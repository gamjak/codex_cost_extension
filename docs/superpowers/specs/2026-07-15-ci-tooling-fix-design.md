# CI Tooling Fix Design

## Goal

Make validation and VS Code extension packaging deterministic across Ubuntu, macOS, and Windows, while removing the GitHub Actions Node 20 runtime warnings.

## Scope

The change fixes the confirmed shell-expansion failure in the Vitest commands and updates the workflow actions whose current major versions run on Node 24. The project itself continues to be tested with Node.js 22. No extension runtime behavior, pricing data, or user-facing functionality changes.

## Confirmed Failure

The current `check`, `test`, and `vscode:prepublish` scripts pass unquoted `out/**` and `.vscode-test/**` patterns to Vitest. Bash expands `out/**` after TypeScript has created `out/src` and `out/test`. Vitest consequently loads the compiled CommonJS tests from `out/test`, and all 14 suites fail because Vitest cannot be imported with `require()`.

The package job has the same root cause. VSCE invokes `npm run vscode:prepublish`, which reaches the same Vitest command and then reports `npm failed with exit code 1`.

## Chosen Approach

Restore a repository-level `vitest.config.ts` and keep all test discovery exclusions there. Simplify the three package scripts so they invoke `vitest run` without shell-sensitive glob arguments. This centralizes the exclusion policy and makes it independent of the invoking shell.

Update the workflow to the current Node 24-based action majors:

- `actions/checkout@v7`
- `actions/setup-node@v7`
- `pnpm/action-setup@v6`
- `actions/upload-artifact@v7`

Keep `node-version: 22` because that setting controls the project toolchain, not the internal runtime of the actions.

## Files and Responsibilities

- `vitest.config.ts`: define `out/**`, `node_modules/**`, and `.vscode-test/**` as excluded test paths.
- `package.json`: remove duplicated CLI exclusion globs from `check`, `test`, and `vscode:prepublish`.
- `.github/workflows/ci.yml`: update the four action majors while preserving the existing matrix, permissions, install, check, audit, package, and artifact behavior.
- `.vscodeignore`: exclude `vitest.config.ts` from the published extension package.
- `test/unit/toolingConfiguration.test.ts`: guard the centralized Vitest configuration, shell-independent package scripts, workflow action majors, Node 22 project matrix, and package exclusion.

## Test Strategy

Follow a red-green cycle for the configuration regression:

1. Add `toolingConfiguration.test.ts` against the desired configuration and run it on the current repository. It must fail because `vitest.config.ts` is absent, the scripts contain CLI globs, and the workflow uses the old action majors.
2. Add the minimal configuration and workflow changes.
3. Run the focused configuration test until it passes.
4. Run `pnpm run check` to cover TypeScript, ESLint, and all Vitest suites.
5. Reproduce the former Unix argument-expansion failure and confirm compiled tests are no longer selected.
6. Run `pnpm run vscode:prepublish` and create the VSIX package where the local Node/npm toolchain permits it.
7. Confirm the worktree contains only the intended tracked changes and no generated package or cache artifacts.

No GitHub push, workflow rerun, or pull request is part of this implementation unless separately authorized.

## Error Handling and Compatibility

The change introduces no runtime error path. Test discovery remains explicit and cross-platform. The workflow retains `fail-fast: false`, so all operating-system validation results remain visible when a future failure occurs. Major action updates are limited to officially released versions whose action manifests specify Node 24.

## Success Criteria

- Vitest never selects files beneath `out/` on any supported operating system.
- `pnpm run check` passes locally with all source test suites.
- `vscode:prepublish` uses the same centralized Vitest configuration.
- Extension packaging no longer fails because compiled CommonJS tests were selected.
- The workflow contains no action version that produced the observed Node 20 runtime warnings.
- Node.js 22 remains the project test version across Ubuntu, macOS, and Windows.
