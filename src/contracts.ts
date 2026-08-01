export const FEATURE_FLAGS = Object.freeze({
  parent: "asset.pipeline.unified-ai-assets.enabled",
  externalHarvest: "asset.pipeline.external-model-harvest.enabled",
  polyHaven: "asset.pipeline.provider.polyhaven.enabled",
  kenney: "asset.pipeline.provider.kenney.enabled",
  smithsonian: "asset.pipeline.provider.smithsonian.enabled",
  nasa: "asset.pipeline.provider.nasa.enabled",
  sketchfab: "asset.pipeline.provider.sketchfab.enabled",
} as const);

export const CAPABILITIES = Object.freeze({
  sourceManage: "asset.source.manage",
  catalogReview: "asset.catalog.review",
  catalogRequest: "asset.catalog.request",
} as const);

export type ProviderId = string & { readonly __providerId: unique symbol };
export type AssetIdentifier = string & {
  readonly __assetIdentifier: unique symbol;
};
export type Revision = number & { readonly __revision: unique symbol };

export type ProviderOperation =
  | "search"
  | "resolveMetadata"
  | "requestDownload"
  | "download";

export type SupportedFormat =
  | "glb"
  | "gltf"
  | "fbx"
  | "obj"
  | "blend"
  | "zip"
  | "unknown";

export type SourceReviewState = "pending" | "approved" | "rejected";
export type RightsEvidenceState = "approved" | "unknown" | "changed";
export type RightsPolicyState =
  | "commercial-redistribution"
  | "commercial-with-attribution"
  | "not-approved";

export interface ProviderSourceDescriptor {
  readonly providerId: ProviderId;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly featureFlag: string;
  readonly parentFeatureFlag: typeof FEATURE_FLAGS.parent;
  readonly requiredCapabilities: readonly string[];
  readonly operationalGates: readonly string[];
  readonly sourceReview: SourceReviewState;
  readonly rightsPolicy: RightsPolicyState;
  readonly supportedFormats: readonly SupportedFormat[];
}

export interface SearchRequest {
  readonly providerId: ProviderId;
  readonly query: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface ResolveMetadataRequest {
  readonly providerId: ProviderId;
  readonly assetId: AssetIdentifier;
}

export interface RequestDownloadRequest {
  readonly providerId: ProviderId;
  readonly assetId: AssetIdentifier;
  readonly idempotencyKey: string;
  readonly expectedRevision?: Revision;
}

export interface DownloadRequest {
  readonly providerId: ProviderId;
  readonly assetId: AssetIdentifier;
  readonly acquisitionId: string;
}

export interface RightsEvidence {
  readonly state: RightsEvidenceState;
  readonly policy: RightsPolicyState;
  readonly evidenceRevision: Revision;
  readonly attributionRequired: boolean;
}

export interface ProviderAssetCandidate {
  readonly providerId: ProviderId;
  readonly assetId: AssetIdentifier;
  readonly title: string;
  readonly description: string;
  readonly sourcePage: string;
  readonly rights: RightsEvidence;
  readonly supportedFormats: readonly SupportedFormat[];
  readonly revision: Revision;
  readonly disposition: "eligible" | "quarantined";
}

export interface ProviderAssetMetadata extends ProviderAssetCandidate {
  readonly creator?: string;
  readonly attributionText?: string;
}

export interface CredentialRequest {
  readonly providerId: ProviderId;
  readonly operation: ProviderOperation;
}

export interface ProviderCredential {
  readonly kind: "oauth" | "api-key" | "none";
  readonly value: string;
}

export interface CredentialProvider {
  getCredential(request: CredentialRequest): Promise<ProviderCredential | null>;
}

export interface ProviderTransportRequest {
  readonly providerId: ProviderId;
  readonly operation: "search" | "resolveMetadata";
  readonly assetId?: AssetIdentifier;
  readonly query?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface ProviderTransport {
  execute(
    request: ProviderTransportRequest,
    credential: ProviderCredential | null,
  ): Promise<unknown>;
}

export interface ProviderPayloadNormalizer {
  normalizeSearch(payload: unknown): readonly ProviderAssetCandidate[];
  normalizeMetadata(payload: unknown): ProviderAssetMetadata;
}

export interface AcquisitionRequest {
  readonly providerId: ProviderId;
  readonly assetId: AssetIdentifier;
  readonly idempotencyKey: string;
  readonly expectedRevision?: Revision;
}

export interface AcquisitionReceipt {
  readonly acquisitionId: string;
  readonly providerId: ProviderId;
  readonly assetId: AssetIdentifier;
  readonly revision: Revision;
  readonly status: "accepted" | "unavailable" | "quarantined";
}

export interface AcquiredContent {
  readonly acquisitionId: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly checksumSha256: string;
}

export interface AcquisitionPort {
  requestDownload(request: AcquisitionRequest): Promise<AcquisitionReceipt>;
  download(request: DownloadRequest): Promise<AcquiredContent>;
}

export interface PrivateStagingRef {
  readonly stagingId: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly checksumSha256: string;
  readonly expiresAt: string;
}

export interface PrivateStagingPort {
  stage(content: AcquiredContent): Promise<PrivateStagingRef>;
}

export interface Checkpoint {
  readonly idempotencyKey: string;
  readonly receipt: AcquisitionReceipt;
}

export interface CheckpointPort {
  get(idempotencyKey: string): Promise<Checkpoint | null>;
  put(checkpoint: Checkpoint): Promise<void>;
}

export interface ProviderConnector {
  readonly descriptor: ProviderSourceDescriptor;
  search(request: SearchRequest): Promise<readonly ProviderAssetCandidate[]>;
  resolveMetadata(request: ResolveMetadataRequest): Promise<ProviderAssetMetadata>;
  requestDownload(request: RequestDownloadRequest): Promise<AcquisitionReceipt>;
  download(request: DownloadRequest): Promise<PrivateStagingRef>;
}

export interface ProviderRegistry {
  get(providerId: ProviderId): ProviderSourceDescriptor;
  list(): readonly ProviderSourceDescriptor[];
}
