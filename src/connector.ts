import {
  type AcquisitionPort,
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
  validateCursor,
  validateIdempotencyKey,
  validateLimit,
  normalizeCandidate,
  normalizeMetadata,
  validateProviderId,
  validateQuery,
  validateRevision,
} from "./validation.js";

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
  const assertEnabled = (): void => {
    if (!descriptor.enabled) throw new ProviderDisabledError();
  };

  return Object.freeze({
    descriptor,
    async search(request: SearchRequest): Promise<readonly ProviderAssetCandidate[]> {
      assertEnabled();
      const providerId = validateProviderId(request.providerId);
      if (providerId !== descriptor.providerId) throw new SourceValidationError("provider-mismatch");
      const query = validateQuery(request.query);
      const limit = validateLimit(request.limit);
      const cursor = validateCursor(request.cursor);
      const credential = await dependencies.credentials.getCredential({ providerId, operation: "search" });
      const payload = await dependencies.transport.execute(
        { providerId, operation: "search", query, limit, cursor },
        credential,
      );
      return deepFreeze(dependencies.normalizer.normalizeSearch(payload).map(candidate => normalizeCandidate(candidate, descriptor.providerId)));
    },
    async resolveMetadata(request: ResolveMetadataRequest): Promise<ProviderAssetMetadata> {
      assertEnabled();
      const providerId = validateProviderId(request.providerId);
      const assetId = validateAssetIdentifier(request.assetId);
      if (providerId !== descriptor.providerId) throw new SourceValidationError("provider-mismatch");
      const credential = await dependencies.credentials.getCredential({ providerId, operation: "resolveMetadata" });
      const payload = await dependencies.transport.execute({ providerId, operation: "resolveMetadata", assetId }, credential);
      return normalizeMetadata(dependencies.normalizer.normalizeMetadata(payload), descriptor.providerId);
    },
    async requestDownload(request: RequestDownloadRequest): Promise<AcquisitionReceipt> {
      assertEnabled();
      const providerId = validateProviderId(request.providerId);
      const assetId = validateAssetIdentifier(request.assetId);
      const idempotencyKey = validateIdempotencyKey(request.idempotencyKey);
      const expectedRevision = request.expectedRevision === undefined ? undefined : validateRevision(request.expectedRevision);
      if (providerId !== descriptor.providerId) throw new SourceValidationError("provider-mismatch");
      const existing = await dependencies.checkpoints.get(idempotencyKey);
      if (existing) return deepFreeze({ ...existing.receipt });
      const receipt = await dependencies.acquisition.requestDownload({ providerId, assetId, idempotencyKey, expectedRevision });
      if (receipt.status === "accepted") await dependencies.checkpoints.put(deepFreeze({ idempotencyKey, receipt: { ...receipt } }));
      return deepFreeze({ ...receipt });
    },
    async download(request: DownloadRequest): Promise<PrivateStagingRef> {
      assertEnabled();
      const providerId = validateProviderId(request.providerId);
      const assetId = validateAssetIdentifier(request.assetId);
      const acquisitionId = validateIdempotencyKey(request.acquisitionId);
      if (providerId !== descriptor.providerId) throw new SourceValidationError("provider-mismatch");
      const content = await dependencies.acquisition.download({ providerId, assetId, acquisitionId });
      if (content.acquisitionId !== acquisitionId) throw new SourceValidationError("acquisition-mismatch");
      return deepFreeze({ ...(await dependencies.staging.stage(content)) });
    },
  });
}
