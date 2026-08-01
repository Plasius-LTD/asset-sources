# TDR-0001: Provider source connector delivery direction

## Objective

Provide a portable contract package for safe provider source discovery, inspection, acquisition, and private staging.

## Boundaries

The package owns request/result shapes, input validation, immutable descriptors, deterministic registry lookup, port interfaces, checkpoint orchestration, and a fake connector for tests. Provider-specific payload normalization, credentials, live transport, source permissions, and acquisition remain in provider Features.

## Gates

The parent flag is `asset.pipeline.unified-ai-assets.enabled`. Provider flags are named in `FEATURE_FLAGS`; capabilities are `asset.source.manage`, `asset.catalog.review`, and `asset.catalog.request`. All real descriptors start disabled. Enablement requires source review and rights evidence in addition to flag/capability checks.

## Failure behavior

Malformed or unsafe input throws a stable typed validation error. Unknown or changed rights evidence quarantines rather than promoting. Duplicate registry identifiers fail at construction. Existing checkpoints are returned unchanged for repeated idempotency keys. No fallback provider is selected implicitly.

## Verification

Contract tests cover registry gates, duplicate entries, URL/path safety, untrusted text redaction, deep immutability, disabled providers, acquisition idempotency, private staging, and the public package inventory.
