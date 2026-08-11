# Changelog

All notable changes to `@plasius/asset-sources` are documented here.

## Unreleased

- Phase-isolated immutable package validation from the OIDC publisher, pinned
  npm 11.6.2, and added fresh current-`main` fences before release mutation and
  npm publication.
- Corrected the trusted-publisher ADR to bind `@plasius/asset-sources` to the
  `Plasius-LTD/asset-sources` GitHub repository (`#3`).
- Added fail-closed provider source connector contracts, injected acquisition/staging/checkpoint ports, and deterministic disabled descriptors for Poly Haven, Kenney, Smithsonian Open Access, NASA, and Sketchfab.
