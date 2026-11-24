import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  DEFAULT_PROVIDER_DESCRIPTORS,
  FEATURE_FLAGS,
  ProviderDisabledError,
  SourceValidationError,
  assertRightsApproved,
  createFakeDependencies,
  createProviderConnector,
  createProviderRegistry,
  deepFreeze,
  fixtureCandidate,
  normalizeCandidate,
  normalizeMetadata,
  sanitizeUntrustedText,
  validateAssetIdentifier,
  validateChecksum,
  validateCursor,
  validateDescriptor,
  validateLimit,
  validateProviderId,
  validateQuery,
  validateSourcePage,
  validateRevision,
} from "../src/index.js";

describe("provider source registry", () => {
  it("exposes the five providers disabled until their gates are enabled", () => {
    const registry = createProviderRegistry();
    expect(registry.list()).toHaveLength(5);
    expect(registry.list().map((item) => item.providerId)).toEqual([
      "polyhaven",
      "kenney",
      "smithsonian",
      "nasa",
      "sketchfab",
    ]);
    for (const descriptor of registry.list()) {
      expect(descriptor.enabled).toBe(false);
      expect(descriptor.parentFeatureFlag).toBe(FEATURE_FLAGS.parent);
      expect(descriptor.requiredCapabilities).toContain(CAPABILITIES.sourceManage);
      expect(descriptor.operationalGates).toContain("rights-evidence");
      expect(Object.isFrozen(descriptor)).toBe(true);
    }
    expect(registry.get(validateProviderId("polyhaven")).displayName).toBe("Poly Haven");
    expect(() => registry.get(validateProviderId("missing"))).toThrowError(
      new SourceValidationError("unknown-provider-id"),
    );
  });

  it("rejects duplicate ids and descriptors that are not fail-closed", () => {
    expect(() => createProviderRegistry([
      DEFAULT_PROVIDER_DESCRIPTORS[0]!,
      DEFAULT_PROVIDER_DESCRIPTORS[0]!,
    ])).toThrowError(new SourceValidationError("duplicate-provider-id"));
    expect(() => validateDescriptor({
      ...DEFAULT_PROVIDER_DESCRIPTORS[0]!,
      enabled: true,
    })).toThrowError(new SourceValidationError("descriptor-must-be-disabled-until-approved"));
    expect(() => validateDescriptor({
      ...DEFAULT_PROVIDER_DESCRIPTORS[0]!,
      rightsPolicy: "provider-claimed" as typeof DEFAULT_PROVIDER_DESCRIPTORS[0]["rightsPolicy"],
    })).toThrowError(new SourceValidationError("descriptor-rights-not-approved"));
  });

  it("stores only the sanitized provider display name", () => {
    const descriptor = validateDescriptor({
      ...DEFAULT_PROVIDER_DESCRIPTORS[0]!,
      displayName: "Provider https://credentials.test/download?token=secret",
      credential: "private-value",
    } as typeof DEFAULT_PROVIDER_DESCRIPTORS[0] & { readonly credential: string });

    expect(descriptor.displayName).toBe("Provider [redacted-url]");
    expect(descriptor).not.toHaveProperty("credential");
  });
});

describe("source validation", () => {
  it("rejects raw URLs as opaque identifiers and accepts only HTTPS source pages", () => {
    expect(() => validateAssetIdentifier("https://provider.test/download.glb")).toThrowError(
      new SourceValidationError("unsafe-asset-id"),
    );
    expect(() => validateSourcePage("http://provider.test/source")).toThrowError(
      new SourceValidationError("invalid-source-page"),
    );
    expect(validateSourcePage("https://provider.test/source/asset")).toBe(
      "https://provider.test/source/asset",
    );
  });

  it("bounds and neutralizes untrusted provider text", () => {
    expect(sanitizeUntrustedText("<script>alert(1)</script> https://secret.test/x", 100)).toBe(
      "[redacted-markup]alert(1)[redacted-markup] [redacted-url]",
    );
    expect(
      sanitizeUntrustedText(
        "https://first.test/file?token=one ftp://second.test/file#credential",
        100,
      ),
    ).toBe(
      "[redacted-url] [redacted-url]",
    );
    expect(() => sanitizeUntrustedText("x\u0000", 100)).toThrowError(
      new SourceValidationError("invalid-provider-text"),
    );
    expect(() => validateRevision(-1)).toThrowError(new SourceValidationError("invalid-revision"));
    expect(validateProviderId("provider-1")).toBe("provider-1");
    expect(validateQuery("  chair  ")).toBe("chair");
    expect(validateCursor(undefined)).toBeUndefined();
    expect(validateCursor("page-1")).toBe("page-1");
    expect(validateLimit(undefined)).toBe(20);
    expect(validateLimit(100)).toBe(100);
    expect(validateChecksum("a".repeat(64))).toBe("a".repeat(64));
    expect(() => validateProviderId("bad/id")).toThrowError(new SourceValidationError("invalid-provider-id"));
    expect(() => validateQuery(" ")).toThrowError(new SourceValidationError("invalid-query"));
    expect(() => validateCursor("bad cursor")).toThrowError(new SourceValidationError("invalid-cursor"));
    expect(() => validateLimit(101)).toThrowError(new SourceValidationError("invalid-limit"));
    expect(() => validateChecksum("bad")).toThrowError(new SourceValidationError("invalid-checksum"));
  });

  it("quarantines unknown rights and accepts approved rights", () => {
    const candidate = fixtureCandidate("polyhaven", "rights-01");
    expect(() => assertRightsApproved(candidate.rights)).not.toThrow();
    expect(() => assertRightsApproved({ ...candidate.rights, state: "changed" })).toThrowError(
      new SourceValidationError("rights-evidence-not-approved"),
    );
    const quarantined = normalizeCandidate(
      { ...candidate, rights: { ...candidate.rights, state: "unknown" } },
      candidate.providerId,
    );
    expect(quarantined.disposition).toBe("quarantined");
    expect(() => normalizeCandidate(candidate, validateProviderId("nasa"))).toThrowError(
      new SourceValidationError("provider-mismatch"),
    );
    expect(normalizeMetadata({ ...candidate, creator: "Creator", attributionText: "Credit" }, candidate.providerId)).toMatchObject({
      creator: "Creator",
      attributionText: "Credit",
    });
    expect(() => normalizeCandidate(
      {
        ...candidate,
        assetId: "https://provider.test/download?token=secret" as typeof candidate.assetId,
      },
      candidate.providerId,
    )).toThrowError(new SourceValidationError("unsafe-asset-id"));
  });

  it("emits only allowlisted candidate and rights fields", () => {
    const candidate = fixtureCandidate("polyhaven", "allowlisted-01");
    const normalized = normalizeCandidate(
      {
        ...candidate,
        downloadUrl: "https://provider.test/download?token=secret",
        rights: {
          ...candidate.rights,
          privateEvidence: "https://provider.test/evidence?token=secret",
        },
      } as typeof candidate & {
        readonly downloadUrl: string;
        readonly rights: typeof candidate.rights & { readonly privateEvidence: string };
      },
      candidate.providerId,
    );

    expect(normalized).not.toHaveProperty("downloadUrl");
    expect(normalized.rights).not.toHaveProperty("privateEvidence");
  });

  it("deep-freezes nested contract values", () => {
    const value = deepFreeze({ nested: { list: ["safe"] } });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.nested)).toBe(true);
    expect(Object.isFrozen(value.nested.list)).toBe(true);
    expect(() => value.nested.list.push("unsafe")).toThrow();
  });
});

describe("provider connector ports", () => {
  it("exposes only a validated connector descriptor", () => {
    const candidate = fixtureCandidate("polyhaven", "chair-01");
    const dependencies = createFakeDependencies(candidate.providerId, { candidate });
    const connector = createProviderConnector(
      {
        ...DEFAULT_PROVIDER_DESCRIPTORS[0]!,
        enabled: true,
        credential: "private-value",
      } as typeof DEFAULT_PROVIDER_DESCRIPTORS[0] & {
        readonly enabled: true;
        readonly credential: string;
      },
      dependencies,
    );

    expect(connector.descriptor.enabled).toBe(true);
    expect(connector.descriptor).not.toHaveProperty("credential");
  });

  it("uses opaque transport/acquisition ports and checkpoints idempotently", async () => {
    const candidate = fixtureCandidate("polyhaven", "chair-01");
    const dependencies = createFakeDependencies(candidate.providerId, { candidate });
    const connector = createProviderConnector(
      { ...DEFAULT_PROVIDER_DESCRIPTORS[0]!, enabled: true },
      dependencies,
    );

    await expect(connector.search({ providerId: candidate.providerId, query: "chair" })).resolves.toEqual([candidate]);
    await expect(connector.search({ providerId: candidate.providerId, query: " chair ", limit: 10, cursor: "page-1" })).resolves.toHaveLength(1);
    await expect(connector.resolveMetadata({ providerId: candidate.providerId, assetId: candidate.assetId })).resolves.toMatchObject({
      assetId: candidate.assetId,
      rights: candidate.rights,
    });
    const first = await connector.requestDownload({
      providerId: candidate.providerId,
      assetId: candidate.assetId,
      idempotencyKey: "request-01",
      expectedRevision: validateRevision(1),
    });
    const second = await connector.requestDownload({
      providerId: candidate.providerId,
      assetId: candidate.assetId,
      idempotencyKey: "request-01",
    });
    expect(second).toEqual(first);
    await expect(connector.download({
      providerId: candidate.providerId,
      assetId: candidate.assetId,
      acquisitionId: first.acquisitionId,
    })).resolves.toMatchObject({
      stagingId: "stage:request-01",
      checksumSha256: "a".repeat(64),
    });
    await expect(connector.search({ providerId: validateProviderId("nasa"), query: "asset" })).rejects.toThrowError(
      new SourceValidationError("provider-mismatch"),
    );
    await expect(connector.search({ providerId: candidate.providerId, query: "" })).rejects.toThrowError(
      new SourceValidationError("invalid-query"),
    );
  });

  it("fails closed before calling injected ports when a provider is disabled", async () => {
    const candidate = fixtureCandidate("nasa", "mission-asset");
    const dependencies = createFakeDependencies(candidate.providerId, { candidate });
    const connector = createProviderConnector(DEFAULT_PROVIDER_DESCRIPTORS[3]!, dependencies);
    await expect(connector.search({ providerId: candidate.providerId, query: "asset" })).rejects.toBeInstanceOf(
      ProviderDisabledError,
    );
  });

  it("rejects a normalizer result that exceeds the caller's search limit", async () => {
    const candidate = fixtureCandidate("polyhaven", "chair-01");
    const baseDependencies = createFakeDependencies(candidate.providerId, { candidate });
    const connector = createProviderConnector(
      { ...DEFAULT_PROVIDER_DESCRIPTORS[0]!, enabled: true },
      {
        ...baseDependencies,
        normalizer: {
          ...baseDependencies.normalizer,
          normalizeSearch() {
            return [candidate, candidate];
          },
        },
      },
    );

    await expect(connector.search({
      providerId: candidate.providerId,
      query: "chair",
      limit: 1,
    })).rejects.toThrowError(new SourceValidationError("provider-result-limit-exceeded"));
  });

  it("rejects idempotency-key reuse for a different asset or revision", async () => {
    const candidate = fixtureCandidate("polyhaven", "chair-01");
    const dependencies = createFakeDependencies(candidate.providerId, { candidate });
    const connector = createProviderConnector(
      { ...DEFAULT_PROVIDER_DESCRIPTORS[0]!, enabled: true },
      dependencies,
    );

    await connector.requestDownload({
      providerId: candidate.providerId,
      assetId: candidate.assetId,
      idempotencyKey: "request-conflict",
      expectedRevision: validateRevision(1),
    });

    await expect(connector.requestDownload({
      providerId: candidate.providerId,
      assetId: validateAssetIdentifier("table-02"),
      idempotencyKey: "request-conflict",
      expectedRevision: validateRevision(1),
    })).rejects.toThrowError(new SourceValidationError("idempotency-conflict"));

    await expect(connector.requestDownload({
      providerId: candidate.providerId,
      assetId: candidate.assetId,
      idempotencyKey: "request-conflict",
      expectedRevision: validateRevision(2),
    })).rejects.toThrowError(new SourceValidationError("idempotency-conflict"));
  });

  it("rejects an acquisition receipt that is not bound to the request", async () => {
    const candidate = fixtureCandidate("polyhaven", "chair-01");
    const baseDependencies = createFakeDependencies(candidate.providerId, { candidate });
    const connector = createProviderConnector(
      { ...DEFAULT_PROVIDER_DESCRIPTORS[0]!, enabled: true },
      {
        ...baseDependencies,
        acquisition: {
          ...baseDependencies.acquisition,
          async requestDownload(request) {
            return {
              acquisitionId: request.idempotencyKey,
              providerId: request.providerId,
              assetId: validateAssetIdentifier("wrong-asset"),
              revision: validateRevision(2),
              status: "accepted" as const,
            };
          },
        },
      },
    );

    await expect(connector.requestDownload({
      providerId: candidate.providerId,
      assetId: candidate.assetId,
      idempotencyKey: "request-mismatch",
      expectedRevision: validateRevision(1),
    })).rejects.toThrowError(new SourceValidationError("acquisition-mismatch"));
  });

  it("rejects unsafe or mismatched private staging results", async () => {
    const candidate = fixtureCandidate("polyhaven", "chair-01");
    const baseDependencies = createFakeDependencies(candidate.providerId, { candidate });
    const connector = createProviderConnector(
      { ...DEFAULT_PROVIDER_DESCRIPTORS[0]!, enabled: true },
      {
        ...baseDependencies,
        staging: {
          async stage(content) {
            return {
              stagingId: "https://private.test/model?token=secret",
              mediaType: content.mediaType,
              byteLength: content.byteLength,
              checksumSha256: "b".repeat(64),
              expiresAt: "2030-01-01T00:00:00.000Z",
            };
          },
        },
      },
    );

    await expect(connector.download({
      providerId: candidate.providerId,
      assetId: candidate.assetId,
      acquisitionId: "request-unsafe-stage",
    })).rejects.toBeInstanceOf(SourceValidationError);
  });
});
