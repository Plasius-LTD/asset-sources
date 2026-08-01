# Asset source connector design

## Safe flow

```text
opaque request
  -> validation and capability/flag gate
  -> ProviderTransport (provider-specific implementation)
  -> bounded normalizer
  -> rights/evidence disposition
  -> idempotent AcquisitionPort request
  -> private PrivateStagingPort reference
```

The caller never supplies or receives a raw provider download URL. The transport request contains only a provider ID, operation, query, cursor, limit, or opaque asset ID. Credentials are injected at the port boundary and are never part of descriptors or serialized results.

## Data rules

- Provider IDs and asset IDs use bounded opaque identifiers; URL-shaped values are rejected.
- Provider title/description text is bounded, normalized, and has markup and URL-shaped content redacted.
- `RightsEvidence.state` must be `approved`, and the policy must permit commercial redistribution or commercial use with attribution. `unknown` and `changed` states remain quarantined.
- Acquisition receipts carry a revision and status. Accepted receipts are stored under the idempotency key before a caller can retry.
- Private staging returns an opaque staging ID, checksum, media type, byte length, and expiry only.

## Provider rollout

Poly Haven, Kenney, Smithsonian Open Access, NASA, and Sketchfab descriptors are present for deterministic discovery and review tooling, but remain disabled. Provider source reviews and permission-specific integrations are delivered in their own Features.
