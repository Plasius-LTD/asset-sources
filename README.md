# @plasius/asset-sources

[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/asset-sources/ci.yml?branch=main&label=build)](https://github.com/Plasius-LTD/asset-sources/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Plasius-LTD/asset-sources)](./LICENSE)
[![Security Policy](https://img.shields.io/badge/security-policy-orange)](./SECURITY.md)

Fail-closed provider source connector contracts for the Plasius governed asset pipeline. The package defines safe provider-facing ports and a deterministic disabled registry; provider-specific normalizers and live acquisition remain in their own reviewed Features.

## Install

```bash
npm install @plasius/asset-sources
```

## Contract surface

The package exports:

- `ProviderSourceDescriptor` and `createProviderRegistry()` for the parent and five provider feature flags.
- `CredentialProvider`, `ProviderTransport`, `AcquisitionPort`, `PrivateStagingPort`, and `CheckpointPort` for dependency-inverted implementations.
- `createProviderConnector()` for search, metadata inspection, download requests, and private staging.
- `createFakeDependencies()` and `fixtureCandidate()` for deterministic contract tests.

Callers provide opaque provider asset identifiers. They do not provide download URLs, credentials, paths, archive names, or provider-specific network addresses. Every real provider descriptor is disabled until the parent flag, provider flag, source review, rights evidence, capability, and private-staging gates are satisfied.

```ts
import {
  DEFAULT_PROVIDER_DESCRIPTORS,
  createProviderRegistry,
} from "@plasius/asset-sources";

const registry = createProviderRegistry();
const sketchfab = registry.get(DEFAULT_PROVIDER_DESCRIPTORS[4].providerId);
// sketchfab.enabled === false until its source review and rollout gates pass
```

Provider text is bounded and normalized as untrusted data. URL-shaped text is redacted, unsafe opaque IDs are rejected, rights evidence must be approved for commercial redistribution, and acquisition checkpoints are idempotent by caller-supplied key. Private staging returns only an opaque staging reference, checksum, media type, size, and expiry; it never returns a raw provider URL.

## Development

Use Node.js 24 (the version in [`.nvmrc`](./.nvmrc)) and npm:

```bash
npm ci
npm run typecheck
npm test
npm run test:coverage
npm run lint
npm run build
npm run audit:npm
npm run privacy:check
npm run pack:check
```

The release workflow publishes only an exact successful `main` commit through `.github/workflows/cd.yml`; no local publish is permitted.

## Architecture and rollout

- [ADR-0010: fail-closed provider source connector boundary](./docs/adrs/adr-0010-provider-source-connectors.md)
- [TDR-0001: source connector delivery direction](./docs/tdrs/tdr-0001-provider-source-connectors.md)
- [Connector design](./docs/design/asset-source-connectors.md)

The inherited template files in this repository provide the legal, security, contribution, workflow, and public-artifact integrity baseline required for `@plasius/*` packages.
