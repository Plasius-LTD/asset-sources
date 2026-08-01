# Contributing to `@plasius/asset-sources`

Contributions must preserve the fail-closed source boundary. Open a tracked issue for non-trivial changes, use a focused Conventional Commit branch, add tests for every changed behavior, and update the README, changelog, and relevant architecture docs.

Before opening a PR, run:

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

Do not include real credentials, personal data, raw provider download URLs, signed URLs, or private provider payloads in source, fixtures, logs, issues, or PRs. Security reports belong in [SECURITY.md](./SECURITY.md), not public issues.

Public API or package-boundary changes require an ADR under `docs/adrs/` and a TDR/design update where applicable. Packages are published only by the approved GitHub Actions release workflow.
