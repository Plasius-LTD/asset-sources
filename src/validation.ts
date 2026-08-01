import {
  type AssetIdentifier,
  type ProviderId,
  type Revision,
  type RightsEvidence,
  type ProviderSourceDescriptor,
  type ProviderAssetCandidate,
  type ProviderAssetMetadata,
  FEATURE_FLAGS,
  CAPABILITIES,
} from "./contracts.js";

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_CURSOR = /^[A-Za-z0-9._:-]{1,256}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SOURCE_PAGE = /^https:\/\/[A-Za-z0-9.-]+(?:\/[^\s<>]*)?$/u;
const URL_LIKE = /(?:https?:\/\/|ftp:\/\/|file:\/\/|data:|javascript:|\\\\|\/\/)/iu;
const MARKUP = /<\/?[A-Za-z][^>]*>/gu;

export class SourceValidationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "SourceValidationError";
    this.code = code;
  }
}

export class SourceUnavailableError extends Error {
  constructor() {
    super("source-unavailable");
    this.name = "SourceUnavailableError";
  }
}

export class ProviderDisabledError extends Error {
  constructor() {
    super("provider-disabled");
    this.name = "ProviderDisabledError";
  }
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

export function validateProviderId(value: unknown): ProviderId {
  return validateOpaque(value, "invalid-provider-id") as ProviderId;
}

export function validateAssetIdentifier(value: unknown): AssetIdentifier {
  if (typeof value === "string" && URL_LIKE.test(value)) {
    throw new SourceValidationError("unsafe-asset-id");
  }
  const identifier = validateOpaque(value, "invalid-asset-id");
  return identifier as AssetIdentifier;
}

export function validateRevision(value: unknown): Revision {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new SourceValidationError("invalid-revision");
  }
  return value as Revision;
}

export function validateIdempotencyKey(value: unknown): string {
  return validateOpaque(value, "invalid-idempotency-key");
}

export function validateQuery(value: unknown): string {
  if (typeof value !== "string") throw new SourceValidationError("invalid-query");
  const query = value.normalize("NFKC").trim();
  if (query.length === 0 || query.length > 256 || containsControl(query)) {
    throw new SourceValidationError("invalid-query");
  }
  return sanitizeUntrustedText(query, 256);
}

export function validateCursor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !SAFE_CURSOR.test(value)) {
    throw new SourceValidationError("invalid-cursor");
  }
  return value;
}

export function validateLimit(value: unknown): number {
  if (value === undefined) return 20;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) {
    throw new SourceValidationError("invalid-limit");
  }
  return value as number;
}

export function sanitizeUntrustedText(value: unknown, maxLength: number): string {
  if (typeof value !== "string" || value.length > maxLength || containsControl(value)) {
    throw new SourceValidationError("invalid-provider-text");
  }
  return value
    .normalize("NFKC")
    .replace(MARKUP, "[redacted-markup]")
    .replace(URL_LIKE, "[redacted-url]")
    .slice(0, maxLength);
}

export function validateSourcePage(value: unknown): string {
  if (typeof value !== "string" || value.length > 512 || !SOURCE_PAGE.test(value)) {
    throw new SourceValidationError("invalid-source-page");
  }
  return value;
}

export function validateChecksum(value: unknown): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new SourceValidationError("invalid-checksum");
  }
  return value;
}

export function validateDescriptor(
  descriptor: ProviderSourceDescriptor,
): ProviderSourceDescriptor {
  validateProviderId(descriptor.providerId);
  sanitizeUntrustedText(descriptor.displayName, 80);
  if (descriptor.parentFeatureFlag !== FEATURE_FLAGS.parent) {
    throw new SourceValidationError("invalid-parent-feature-flag");
  }
  if (!descriptor.featureFlag.startsWith("asset.pipeline.provider.")) {
    throw new SourceValidationError("invalid-provider-feature-flag");
  }
  if (!descriptor.requiredCapabilities.includes(CAPABILITIES.sourceManage)) {
    throw new SourceValidationError("missing-source-capability");
  }
  if (descriptor.sourceReview !== "approved" || descriptor.enabled !== false) {
    throw new SourceValidationError("descriptor-must-be-disabled-until-approved");
  }
  if (descriptor.rightsPolicy === "not-approved") {
    throw new SourceValidationError("descriptor-rights-not-approved");
  }
  if (descriptor.supportedFormats.length === 0) {
    throw new SourceValidationError("missing-format-matrix");
  }
  return deepFreeze({
    ...descriptor,
    requiredCapabilities: [...descriptor.requiredCapabilities],
    operationalGates: [...descriptor.operationalGates],
    supportedFormats: [...descriptor.supportedFormats],
  });
}

export function assertRightsApproved(rights: RightsEvidence): void {
  validateRevision(rights.evidenceRevision);
  if (
    rights.state !== "approved" ||
    (rights.policy !== "commercial-redistribution" &&
      rights.policy !== "commercial-with-attribution")
  ) {
    throw new SourceValidationError("rights-evidence-not-approved");
  }
}

export function normalizeCandidate(
  candidate: ProviderAssetCandidate,
  expectedProviderId: ProviderId,
): ProviderAssetCandidate {
  if (candidate.providerId !== expectedProviderId) {
    throw new SourceValidationError("provider-mismatch");
  }
  const rightsApproved =
    candidate.rights.state === "approved" &&
    (candidate.rights.policy === "commercial-redistribution" ||
      candidate.rights.policy === "commercial-with-attribution");
  return deepFreeze({
    ...candidate,
    title: sanitizeUntrustedText(candidate.title, 256),
    description: sanitizeUntrustedText(candidate.description, 4096),
    sourcePage: validateSourcePage(candidate.sourcePage),
    revision: validateRevision(candidate.revision),
    rights: {
      ...candidate.rights,
      evidenceRevision: validateRevision(candidate.rights.evidenceRevision),
    },
    supportedFormats: [...candidate.supportedFormats],
    disposition: rightsApproved ? candidate.disposition : "quarantined",
  });
}

export function normalizeMetadata(
  metadata: ProviderAssetMetadata,
  expectedProviderId: ProviderId,
): ProviderAssetMetadata {
  const candidate = normalizeCandidate(metadata, expectedProviderId);
  return deepFreeze({
    ...candidate,
    ...(metadata.creator === undefined
      ? {}
      : { creator: sanitizeUntrustedText(metadata.creator, 256) }),
    ...(metadata.attributionText === undefined
      ? {}
      : { attributionText: sanitizeUntrustedText(metadata.attributionText, 512) }),
  });
}

function validateOpaque(value: unknown, code: string): string {
  if (typeof value !== "string" || !OPAQUE_ID.test(value) || containsControl(value)) {
    throw new SourceValidationError(code);
  }
  return value;
}

function containsControl(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}
