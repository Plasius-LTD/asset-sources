import {
  CAPABILITIES,
  FEATURE_FLAGS,
  type ProviderId,
  type ProviderRegistry,
  type ProviderSourceDescriptor,
} from "./contracts.js";
import { deepFreeze, validateDescriptor, validateProviderId, SourceValidationError } from "./validation.js";

export const DEFAULT_PROVIDER_DESCRIPTORS: readonly ProviderSourceDescriptor[] = deepFreeze([
  descriptor("polyhaven", "Poly Haven", FEATURE_FLAGS.polyHaven, ["glb", "gltf", "blend"]),
  descriptor("kenney", "Kenney", FEATURE_FLAGS.kenney, ["glb", "gltf", "fbx"]),
  descriptor("smithsonian", "Smithsonian Open Access", FEATURE_FLAGS.smithsonian, ["glb", "gltf", "obj"]),
  descriptor("nasa", "NASA", FEATURE_FLAGS.nasa, ["glb", "gltf", "obj", "fbx"]),
  descriptor("sketchfab", "Sketchfab", FEATURE_FLAGS.sketchfab, ["glb", "gltf", "fbx"]),
]);

export function createProviderRegistry(
  descriptors: readonly ProviderSourceDescriptor[] = DEFAULT_PROVIDER_DESCRIPTORS,
): ProviderRegistry {
  const validated = descriptors.map(validateDescriptor);
  const byId = new Map<ProviderId, ProviderSourceDescriptor>();
  for (const item of validated) {
    if (byId.has(item.providerId)) throw new SourceValidationError("duplicate-provider-id");
    byId.set(item.providerId, item);
  }
  const list = Object.freeze([...byId.values()]);
  return Object.freeze({
    get(providerId: ProviderId): ProviderSourceDescriptor {
      validateProviderId(providerId);
      const descriptor = byId.get(providerId);
      if (!descriptor) throw new SourceValidationError("unknown-provider-id");
      return descriptor;
    },
    list(): readonly ProviderSourceDescriptor[] {
      return list;
    },
  });
}

function descriptor(
  providerId: string,
  displayName: string,
  featureFlag: string,
  supportedFormats: readonly ("glb" | "gltf" | "fbx" | "obj" | "blend")[],
): ProviderSourceDescriptor {
  return {
    providerId: providerId as ProviderId,
    displayName,
    enabled: false,
    featureFlag,
    parentFeatureFlag: FEATURE_FLAGS.parent,
    requiredCapabilities: [CAPABILITIES.sourceManage, CAPABILITIES.catalogReview, CAPABILITIES.catalogRequest],
    operationalGates: ["parent-flag", "provider-flag", "source-review", "rights-evidence", "private-staging"],
    sourceReview: "approved",
    rightsPolicy: "commercial-with-attribution",
    supportedFormats,
  };
}
