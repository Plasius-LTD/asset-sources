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
      "[redacted-markup]alert(1)[redacted-markup] [redacted-url]secret.test/x",
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
});
