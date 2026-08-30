# Changelog

All notable changes to `@plasius/asset-sources` are documented here.

## Unreleased

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.1] - 2026-08-30

- Security: Pinned patched transitive npm dependencies to clear the current audit baseline.

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.0] - 2026-08-30

- Added a fail-closed, version-`0.1.0`-only first-publication bootstrap that is
  available solely through `cd.yml` and the `production` environment, refuses
  an existing npm package, and is removed after trusted publishing is bound
  (`#3`).
- Phase-isolated immutable package validation from the OIDC publisher, pinned
  npm 11.6.2, and added fresh current-`main` fences before release mutation and
  npm publication.
- Corrected the trusted-publisher ADR to bind `@plasius/asset-sources` to the
  `Plasius-LTD/asset-sources` GitHub repository (`#3`).
- Added fail-closed provider source connector contracts, injected acquisition/staging/checkpoint ports, and deterministic disabled descriptors for Poly Haven, Kenney, Smithsonian Open Access, NASA, and Sketchfab.


[0.1.0]: https://github.com/Plasius-LTD/asset-sources/releases/tag/v0.1.0
[0.1.1]: https://github.com/Plasius-LTD/asset-sources/releases/tag/v0.1.1
