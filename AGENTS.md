# AGENTS.md

## Package scope

This repository publishes `@plasius/asset-sources`, a public TypeScript package containing generic provider connector contracts and a disabled provider registry for the governed Plasius asset pipeline.

Follow the organisation-level `AGENTS.md`, `WORKFLOW.md`, `FLAGS_AND_CAPABILITIES.md`, and `NFR.md` rules. Source is authoritative in `src/`; tests are in `tests/`; `dist/` and `coverage/` are generated and must not be edited by hand.

## Invariants

- Keep public operations limited to safe discovery, metadata inspection, download-request, and private-staging ports.
- Callers use opaque provider and asset identifiers. Never add raw download URLs, filesystem paths, credentials, signed URLs, or arbitrary provider endpoints to public contracts.
- Treat provider text and metadata as untrusted, bounded input. Redact URL-shaped text and reject control characters, unsafe identifiers, malformed rights evidence, and invalid revisions.
- Real provider descriptors remain disabled until the parent flag, provider flag, source review, rights evidence, capability, and private-staging gates are satisfied.
- Preserve idempotency and revision checks in acquisition checkpoints. Do not silently substitute a provider or ranker.
- Keep provider-specific normalizers and live credentials out of this package.

## Validation

Use Node 24 and npm. Required checks are `npm ci`, `npm run typecheck`, `npm test`, `npm run test:coverage`, `npm run lint`, `npm run build`, `npm run audit:npm`, `npm run privacy:check`, and `npm run pack:check`. Every changed source file must appear in LCOV and coverage must remain at least 80% for lines/functions where the repository gate applies.

## Release

Use a focused branch and PR. Publish only through the approved `.github/workflows/cd.yml` workflow from `main` after exact-SHA CI succeeds. Never publish from a local machine or introduce provider secrets into source, fixtures, logs, or package metadata.
