# Release Readiness Design

## Goal

Make Codex Cost safely releasable as version 0.3.0: reproducible VSIX packaging, guarded pull-request workflow, secure dependency maintenance, a manual Marketplace publication path, and a GitHub release.

## Scope

### In scope

- Compile only extension runtime code into `out/`; never package tests or tooling configuration.
- Add an automated package-content assertion that rejects test, configuration, documentation, and local-workflow artifacts.
- Add GitHub Actions concurrency, immutable action references, and Dependabot updates for npm and Actions.
- Add a manually dispatched Marketplace workflow that validates, packages, and publishes only when `VSCE_PAT` is configured.
- Add release documentation, contribution guidance, issue and pull-request templates, and a security policy.
- Bump the extension to `0.3.0`, document the release, merge it through a required-check PR, then create a GitHub release with the verified VSIX attached.

### Explicitly out of scope

- Running Marketplace publication. The workflow is prepared but never dispatched in this release.
- Calling billing APIs or transmitting session data.
- New analytics UI such as timelines, exports, forecasting, or session drill-down. Those are separate product increments after this release.

## Architecture

The existing `tsconfig.json` remains the no-emit type-check configuration for both source and tests. A new `tsconfig.build.json` emits only `src/**/*.ts` into `out/`; all packaging commands use it through `compile` and `vscode:prepublish`.

Package validation is a small Node script. It calls the local `vsce ls`, normalizes paths, and fails if a forbidden package path is present. This keeps the assertion independent of shell glob expansion and checks the same inclusion rules used by `vsce package`.

CI remains a three-platform validation matrix plus one package job. It adds cancellation for superseded pull-request runs. Every third-party action is referenced by a full commit SHA and has a trailing human-readable version comment. Dependabot owns future npm and GitHub Actions updates.

Marketplace publishing is a separate manual workflow. It checks out a user-selected ref, runs the same checks and package verification, then uses `VSCE_PAT` only in the final `vsce publish --packagePath` step. A missing secret causes a clear failure rather than a silent non-publication.

## User-visible behavior

- The shipped extension behavior is unchanged.
- The packaged VSIX contains runtime files, manifest/localization resources, README, changelog, license, and icon only.
- Version `0.3.0` is available through a GitHub release. Marketplace publication is ready but must be explicitly triggered later.

## Error handling and security

- A forbidden package path fails CI before an artifact can be released.
- Publishing uses a repository secret and an approval-capable GitHub environment named `marketplace`; no token is stored in the repository.
- Repository policy requires successful CI and package checks before merging to `main`.
- The workflow token stays read-only except in the future release workflow where a GitHub release requires `contents: write`.

## Testing and verification

- Each packaging rule is covered by a failing-first unit test or package-verification test.
- Run TypeScript type-checking, ESLint, Vitest, `pnpm audit --prod`, package verification, VSIX packaging, and VSIX-content inspection.
- Confirm the PR checks pass on Ubuntu, macOS, Windows, and the package job.
- Confirm the released VSIX digest and attachment correspond to the merged `main` commit.

## Follow-up increments

1. Correctness and resilience: workspace-scoped budget notification keys, numeric timestamp ordering, stricter token validation, schema fixtures, and bounded warning/session rendering.
2. Analytics: timeline, filters, export, forecast, and per-session detail.
