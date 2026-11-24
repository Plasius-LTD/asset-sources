import {
  type AcquisitionPort,
  type AcquiredContent,
  type CheckpointPort,
  type CredentialProvider,
  type DownloadRequest,
  type ProviderAssetCandidate,
  type ProviderAssetMetadata,
  type ProviderConnector,
  type ProviderPayloadNormalizer,
  type ProviderSourceDescriptor,
  type ProviderTransport,
  type PrivateStagingPort,
  type RequestDownloadRequest,
  type ResolveMetadataRequest,
  type SearchRequest,
  type AcquisitionReceipt,
  type PrivateStagingRef,
} from "./contracts.js";
import {
  deepFreeze,
  ProviderDisabledError,
  SourceValidationError,
  validateAssetIdentifier,
  validateChecksum,
  validateCursor,
  validateIdempotencyKey,
  validateLimit,
  normalizeCandidate,
  normalizeMetadata,
  validateDescriptor,
  validateProviderId,
  validateQuery,
  validateRevision,
} from "./validation.js";

const MEDIA_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}$/u;

export interface ProviderConnectorDependencies {
  readonly credentials: CredentialProvider;
  readonly transport: ProviderTransport;
  readonly normalizer: ProviderPayloadNormalizer;
  readonly acquisition: AcquisitionPort;
  readonly staging: PrivateStagingPort;
  readonly checkpoints: CheckpointPort;
}

export function createProviderConnector(
  descriptor: ProviderSourceDescriptor,
  dependencies: ProviderConnectorDependencies,
): ProviderConnector {
  if (typeof descriptor.enabled !== "boolean") {
    throw new SourceValidationError("invalid-provider-enabled-state");
  }
  const validatedDescriptor = validateDescriptor({ ...descriptor, enabled: false });
  const connectorDescriptor = deepFreeze({
    ...validatedDescriptor,
    enabled: descriptor.enabled,
  });
  const assertEnabled = (): void => {
    if (!connectorDescriptor.enabled) throw new ProviderDisabledError();
  };

  return Object.freeze({
    descriptor: connectorDescriptor,
    async search(request: SearchRequest): Promise<readonly ProviderAssetCandidate[]> {
      assertEnabled();
      const providerId = validateProviderId(request.providerId);
      if (providerId !== connectorDescriptor.providerId) throw new SourceValidationError("provider-mismatch");
      const query = validateQuery(request.query);
      const limit = validateLimit(request.limit);
      const cursor = validateCursor(request.cursor);
      const credential = await dependencies.credentials.getCredential({ providerId, operation: "search" });
      const payload = await dependencies.transport.execute(
        { providerId, operation: "search", query, limit, cursor },
        credential,
      );
      const candidates = dependencies.normalizer.normalizeSearch(payload);
      if (!Array.isArray(candidates) || candidates.length > limit) {
        throw new SourceValidationError("provider-result-limit-exceeded");
      }
      return deepFreeze(candidates.map(candidate => normalizeCandidate(candidate, connectorDescriptor.providerId)));
    },
    async resolveMetadata(request: ResolveMetadataRequest): Promise<ProviderAssetMetadata> {
      assertEnabled();
      const providerId = validateProviderId(request.providerId);
      const assetId = validateAssetIdentifier(request.assetId);
      if (providerId !== connectorDescriptor.providerId) throw new SourceValidationError("provider-mismatch");
      const credential = await dependencies.credentials.getCredential({ providerId, operation: "resolveMetadata" });
      const payload = await dependencies.transport.execute({ providerId, operation: "resolveMetadata", assetId }, credential);
      return normalizeMetadata(dependencies.normalizer.normalizeMetadata(payload), connectorDescriptor.providerId);
    },
    async requestDownload(request: RequestDownloadRequest): Promise<AcquisitionReceipt> {
      assertEnabled();
      const providerId = validateProviderId(request.providerId);
      const assetId = validateAssetIdentifier(request.assetId);
      const idempotencyKey = validateIdempotencyKey(request.idempotencyKey);
      const expectedRevision = request.expectedRevision === undefined ? undefined : validateRevision(request.expectedRevision);
      if (providerId !== connectorDescriptor.providerId) throw new SourceValidationError("provider-mismatch");
      const existing = await dependencies.checkpoints.get(idempotencyKey);
      if (existing) {
        if (existing.idempotencyKey !== idempotencyKey) {
          throw new SourceValidationError("idempotency-conflict");
        }
        return normalizeAcquisitionReceipt(
          existing.receipt,
          providerId,
          assetId,
          expectedRevision,
          "idempotency-conflict",
        );
      }
      const receipt = await dependencies.acquisition.requestDownload({ providerId, assetId, idempotencyKey, expectedRevision });
      const normalizedReceipt = normalizeAcquisitionReceipt(
        receipt,
        providerId,
        assetId,
        expectedRevision,
        "acquisition-mismatch",
      );
      if (normalizedReceipt.status === "accepted") {
        await dependencies.checkpoints.put(deepFreeze({ idempotencyKey, receipt: normalizedReceipt }));
      }
      return normalizedReceipt;
    },
    async download(request: DownloadRequest): Promise<PrivateStagingRef> {
      assertEnabled();
      const providerId = validateProviderId(request.providerId);
      const assetId = validateAssetIdentifier(request.assetId);
      const acquisitionId = validateIdempotencyKey(request.acquisitionId);
      if (providerId !== connectorDescriptor.providerId) throw new SourceValidationError("provider-mismatch");
      const content = await dependencies.acquisition.download({ providerId, assetId, acquisitionId });
      const normalizedContent = normalizeAcquiredContent(content, acquisitionId);
      const stagingRef = await dependencies.staging.stage(normalizedContent);
      return normalizePrivateStagingRef(stagingRef, normalizedContent);
    },
  });
}

function normalizeAcquiredContent(
  content: AcquiredContent,
  expectedAcquisitionId: string,
): AcquiredContent {
  const acquisitionId = validateIdempotencyKey(content.acquisitionId);
  if (acquisitionId !== expectedAcquisitionId) {
    throw new SourceValidationError("acquisition-mismatch");
  }
  if (typeof content.mediaType !== "string" || !MEDIA_TYPE.test(content.mediaType)) {
    throw new SourceValidationError("invalid-media-type");
  }
  if (!Number.isSafeInteger(content.byteLength) || content.byteLength <= 0) {
    throw new SourceValidationError("invalid-byte-length");
  }
  return deepFreeze({
    acquisitionId,
    mediaType: content.mediaType,
    byteLength: content.byteLength,
    checksumSha256: validateChecksum(content.checksumSha256),
  });
}

function normalizePrivateStagingRef(
  stagingRef: PrivateStagingRef,
  content: AcquiredContent,
): PrivateStagingRef {
  const stagingId = validateIdempotencyKey(stagingRef.stagingId);
  const checksumSha256 = validateChecksum(stagingRef.checksumSha256);
  if (
    stagingRef.mediaType !== content.mediaType ||
    stagingRef.byteLength !== content.byteLength ||
    checksumSha256 !== content.checksumSha256
  ) {
    throw new SourceValidationError("staging-mismatch");
  }
  if (
    typeof stagingRef.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(stagingRef.expiresAt)) ||
    new Date(stagingRef.expiresAt).toISOString() !== stagingRef.expiresAt
  ) {
    throw new SourceValidationError("invalid-staging-expiry");
  }
  return deepFreeze({
    stagingId,
    mediaType: content.mediaType,
    byteLength: content.byteLength,
    checksumSha256,
    expiresAt: stagingRef.expiresAt,
  });
}

function normalizeAcquisitionReceipt(
  receipt: AcquisitionReceipt,
  expectedProviderId: ReturnType<typeof validateProviderId>,
  expectedAssetId: ReturnType<typeof validateAssetIdentifier>,
  expectedRevision: ReturnType<typeof validateRevision> | undefined,
  mismatchCode: "acquisition-mismatch" | "idempotency-conflict",
): AcquisitionReceipt {
  const providerId = validateProviderId(receipt.providerId);
  const assetId = validateAssetIdentifier(receipt.assetId);
  const revision = validateRevision(receipt.revision);
  const acquisitionId = validateIdempotencyKey(receipt.acquisitionId);
  if (
    providerId !== expectedProviderId ||
    assetId !== expectedAssetId ||
    (expectedRevision !== undefined && revision !== expectedRevision)
  ) {
    throw new SourceValidationError(mismatchCode);
  }
  if (
    receipt.status !== "accepted" &&
    receipt.status !== "unavailable" &&
    receipt.status !== "quarantined"
  ) {
    throw new SourceValidationError("invalid-acquisition-status");
  }
  return deepFreeze({
    acquisitionId,
    providerId,
    assetId,
    revision,
    status: receipt.status,
  });
}
