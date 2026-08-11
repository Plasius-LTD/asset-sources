# ADR-0008: Exact-main OIDC package publishing

- Status: Accepted
- Date: 2026-07-29

## Context

The former package workflow prepared a release commit and published it from the
workflow run dispatched at the preceding commit. Checking out a newer commit
does not change a GitHub Actions run's source identity, so npm provenance could
identify a different commit from the package and tag. The workflow also
configured a reusable long-lived npm write token.

## Decision

Publication is phase-isolated: dependency installation, package validation,
SBOM generation, and immutable tarball packing run in `validate_and_pack`
without the `production` environment or OIDC permission. The final hosted
`publish` job downloads only that sealed artifact, explicitly installs npm
11.6.2, runs no repository dependency code, and publishes the tarball with
lifecycle scripts disabled. It re-fetches current `main` immediately before
the first release mutation and again immediately before npm publication.
`.npmrc` contains no registry-auth placeholder, and release preparation returns
the reviewed current `main` HEAD rather than package-file history.

Use a two-run release protocol:

1. An operator dispatches `cd.yml` from protected `main` with `phase: prepare`.
2. The reusable preparation workflow versions the package with lifecycle
   scripts disabled and lands metadata through a unique, non-force-pushed pull
   request.
3. The prepare run waits for successful push-triggered `ci.yml` evidence whose
   branch, event, head SHA, status, and conclusion match the resulting `main`
   commit.
4. If remote `main` still equals that commit, it dispatches `phase: publish`
   from `main`, carrying the exact expected SHA, release tag, and version-derived
   prerelease identity.
5. A read-only hosted job repeats exact-main and exact-CI checks, validates and
   packs the package with lifecycle scripts disabled, creates the SBOM, and
   uploads both as digest-bound direct artifacts.
6. The hosted `production` job downloads the exact artifact IDs, verifies
   GitHub and SHA-256 digests, package identity, safe members, npm distribution
   tag, and SHA-512 registry integrity. It repeats the exact-main check before
   the first mutation.
7. Only the verified tarball is published through npm OIDC with provenance.
   The privileged job installs no dependencies, runs no project scripts, and
   receives no npm write token.

### First-publication bootstrap

npm does not permit this package's trusted-publisher binding to be completed
before the package exists. The initial `0.1.0` publication therefore uses a
temporary, explicitly selected `bootstrap_first_publish` path inside the same
`cd.yml` and `production` boundary. It reuses the immutable artifact, exact-main
and exact-CI checks above, refuses any version other than `0.1.0`, and refuses
to use the credential if the package name already exists in npm. The credential
is short-lived, stored only in the GitHub `production` environment, materialized
in a mode-`0600` runner-temporary user configuration, and erased on step exit.

This is a one-time bootstrap, not a fallback. After `0.1.0` is verified, the
credential is revoked, its environment secret and the bootstrap workflow path
are removed, npm is bound to `Plasius-LTD/asset-sources`, `cd.yml`, and
`production`, and a subsequent patch release must prove tokenless OIDC
publication before the Task can close.

Preparation runs are serialized. Publication concurrency includes the prepared
SHA so the self-dispatched run is not blocked by its own preparation while
duplicate publication attempts for the same SHA remain non-cancelling.
Conflicting release tags are never rewritten.

The npm trusted publisher is externally bound to organization `Plasius-LTD`,
repository `asset-sources`, workflow `cd.yml`, environment `production`, and action
`npm publish`. GitHub `main` and `production` policies are independent
admission controls. The inherited rollout flag is
`platform.public-artifact-integrity.enabled`; rollback disables `cd.yml` and
never restores token publication.

## Consequences

- npm provenance, package bytes, successful CI, tag, and GitHub release bind to
  one immutable `main` commit.
- Dependency and third-party code cannot use the production OIDC or repository
  mutation permissions.
- A moved `main`, mismatched existing package, or stale dispatch fails closed.
- Releases use two runs and may require a fresh preparation after concurrent
  protected-branch movement.
- The first publication temporarily carries a tightly bounded credential path;
  release readiness is incomplete until that path is removed and OIDC is
  proven on a later version.

## Alternatives considered

- Publishing after checking out a child commit in the original run was
  rejected because provenance remains bound to the dispatch commit.
- A reusable or automatic token fallback was rejected because it weakens the
  trusted-publisher boundary and makes successful authentication ambiguous.
- One shared concurrency group was rejected because the self-dispatched
  publish run would wait behind the prepare run; unsupported queue extensions
  are not part of the GitHub Actions workflow schema.
