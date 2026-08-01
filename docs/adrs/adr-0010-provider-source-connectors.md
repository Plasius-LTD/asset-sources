# ADR-0010: Fail-closed provider source connector boundary

- Status: accepted
- Date: 2026-08-01

## Problem

The governed asset pipeline needs one reusable boundary for provider discovery and acquisition without allowing callers or provider payloads to introduce raw download URLs, credentials, filesystem paths, or unreviewed rights claims.

## Decision

`@plasius/asset-sources` exposes opaque-ID requests and dependency-injected ports for credentials, provider transport, acquisition, private staging, and idempotent checkpoints. The registry contains descriptors for the five planned providers, but every descriptor is disabled until the parent and provider feature flags, source review, rights evidence, required capabilities, and private-staging gates are satisfied. Provider-specific normalizers and live acquisition remain outside this package.

Untrusted provider text is bounded and normalized; URL-shaped text is redacted. Rights evidence is fail-closed for unknown or changed states. Download requests are checkpointed by idempotency key and downloads produce only private staging references.

## Alternatives considered

1. Accept provider URLs from callers. Rejected because signed URLs, SSRF targets, and provider endpoint drift would cross the trust boundary.
2. Implement each provider independently without a shared contract. Rejected because safety gates, redaction, and idempotency would drift.
3. Enable providers by default after registration. Rejected because source review, commercial rights, and credentials are external release gates.

## Impact and release

The package is additive and has no runtime dependency. Provider Features can implement the ports without coupling to site or dashboard code. The package is published by the exact-main-SHA npm CD workflow after CI, coverage, audit, privacy, and pack checks pass.
