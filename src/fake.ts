import {
  type AcquisitionPort,
  type AcquisitionReceipt,
  type AssetIdentifier,
  type Checkpoint,
  type CheckpointPort,
  type CredentialProvider,
  type ProviderAssetCandidate,
  type ProviderAssetMetadata,
  type ProviderCredential,
  type ProviderId,
  type ProviderPayloadNormalizer,
  type ProviderTransport,
  type PrivateStagingPort,
  type PrivateStagingRef,
} from "./contracts.js";
import { deepFreeze, SourceUnavailableError, validateAssetIdentifier, validateProviderId, validateRevision } from "./validation.js";

export interface FakeConnectorFixture {
  readonly candidate: ProviderAssetCandidate;
  readonly metadata?: Partial<ProviderAssetMetadata>;
}

export function createMemoryCheckpoints(): CheckpointPort {
  const values = new Map<string, Checkpoint>();
  return {
    async get(key) { return values.get(key) ?? null; },
    async put(value) { values.set(value.idempotencyKey, value); },
  };
}

export function createFakeDependencies(
  providerId: ProviderId,
  fixture: FakeConnectorFixture,
): {
  credentials: CredentialProvider;
  transport: ProviderTransport;
  normalizer: ProviderPayloadNormalizer;
  acquisition: AcquisitionPort;
  staging: PrivateStagingPort;
  checkpoints: CheckpointPort;
} {
  const normalizedProviderId = validateProviderId(providerId);
  const candidate = deepFreeze({ ...fixture.candidate });
  const credentials: CredentialProvider = {
    async getCredential(): Promise<ProviderCredential | null> { return { kind: "none", value: "" }; },
  };
  const transport: ProviderTransport = {
    async execute(request) {
      if (request.providerId !== normalizedProviderId) throw new SourceUnavailableError();
      return request.operation === "search" ? [candidate] : candidate;
    },
  };
  const normalizer: ProviderPayloadNormalizer = {
    normalizeSearch(payload): readonly ProviderAssetCandidate[] {
      if (!Array.isArray(payload)) throw new SourceUnavailableError();
      return payload as ProviderAssetCandidate[];
    },
    normalizeMetadata(payload): ProviderAssetMetadata {
      if (!payload || typeof payload !== "object") throw new SourceUnavailableError();
      return { ...candidate, ...(fixture.metadata ?? {}), ...(payload as Partial<ProviderAssetMetadata>) };
    },
  };
  const acquisition: AcquisitionPort = {
    async requestDownload(request): Promise<AcquisitionReceipt> {
      return { acquisitionId: request.idempotencyKey, providerId: request.providerId, assetId: request.assetId, revision: candidate.revision, status: "accepted" };
    },
    async download(request) {
      if (request.providerId !== normalizedProviderId || request.assetId !== candidate.assetId) throw new SourceUnavailableError();
      return { acquisitionId: request.acquisitionId, mediaType: "model/gltf-binary", byteLength: 128, checksumSha256: "a".repeat(64) };
    },
  };
  const staging: PrivateStagingPort = {
    async stage(content): Promise<PrivateStagingRef> {
      return { stagingId: `stage:${content.acquisitionId}`, mediaType: content.mediaType, byteLength: content.byteLength, checksumSha256: content.checksumSha256, expiresAt: "2030-01-01T00:00:00.000Z" };
    },
  };
  return { credentials, transport, normalizer, acquisition, staging, checkpoints: createMemoryCheckpoints() };
}

export function fixtureCandidate(providerId: string, assetId: string): ProviderAssetCandidate {
  return deepFreeze({
    providerId: validateProviderId(providerId),
    assetId: validateAssetIdentifier(assetId),
    title: "Fixture asset",
    description: "Bounded fixture metadata",
    sourcePage: "https://example.test/assets/fixture",
    rights: { state: "approved", policy: "commercial-with-attribution", evidenceRevision: validateRevision(1), attributionRequired: true },
    supportedFormats: ["glb"],
    revision: validateRevision(1),
    disposition: "eligible",
  });
}
