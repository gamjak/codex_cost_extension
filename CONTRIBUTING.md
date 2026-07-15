# Contributing to Codex Cost

Thank you for improving Codex Cost. Please keep changes small, reviewable, and focused on locally derived usage estimates.

## Prerequisites

- Node.js 22
- pnpm 11 (the repository declares the exact package-manager version)
- VS Code for manual extension-host checks when a change affects the UI

## Development workflow

Install the locked dependency set:

```sh
pnpm install --frozen-lockfile
```

Use these commands before opening a pull request:

```sh
pnpm run compile
pnpm run check
pnpm run test
pnpm run package
pnpm run verify-package
```

`compile` emits only runtime extension code. `check` type-checks without emitting files, then lints and runs the test suite. `package` creates a VSIX, and `verify-package` checks its contents. Some constrained sandboxes cannot download or execute all dependencies; report that limitation in the pull request instead of treating an unrun command as a passing result.

## Commits and pull requests

Use Conventional Commits with a meaningful scope when practical, for example `fix(parser): handle malformed timestamps` or `docs(release): prepare 0.3.0`. Keep generated output and secrets out of commits.

Before requesting review:

- [ ] The change has focused tests or a clear explanation of why tests are not applicable.
- [ ] `pnpm run check` has run, or its environment blocker is documented.
- [ ] `pnpm run package` and `pnpm run verify-package` have run for packaging changes, or their blocker is documented.
- [ ] User-facing behavior, configuration, and `CHANGELOG.md` are updated where needed.
- [ ] The pull request is narrow, explains its motivation, and contains no credentials, tokens, or private session data.
