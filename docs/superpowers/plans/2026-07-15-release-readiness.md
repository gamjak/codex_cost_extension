# Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release Codex Cost 0.3.0 with reproducible, verified packaging; protected CI; and a manual Marketplace publication workflow.

**Architecture:** Split emitting TypeScript from no-emit type checking, test package contents through a Node verifier, and keep Marketplace publication as an explicit workflow dispatch protected by a GitHub environment. CI remains platform-wide and is pinned to immutable action commits.

**Tech Stack:** TypeScript 5.9, Vitest 2, pnpm 11, VS Code Extension API, `@vscode/vsce`, GitHub Actions.

## Global Constraints

- The runtime extension must remain local-only: no billing, telemetry, pricing, or session-data network calls.
- Build output contains only `src/**/*.ts` compiled under `out/src`.
- Tests remain type-checked but never emitted into the VSIX.
- Use Node.js 22 for all repository workflows.
- Action references must be full commit SHAs with their release tag as a comment.
- Marketplace workflow must be manual-only and use the `VSCE_PAT` secret only in its final publishing step.
- Version is exactly `0.3.0`; Marketplace publication is prepared but must not be dispatched.

---

### Task 1: Separate runtime build output from test type checking

**Files:**
- Create: `tsconfig.build.json`
- Modify: `tsconfig.json`
- Modify: `package.json`
- Modify: `test/unit/toolingConfiguration.test.ts`

**Interfaces:**
- `pnpm run compile` executes `tsc -p tsconfig.build.json`.
- `pnpm run check` performs `tsc -p tsconfig.json --noEmit`, ESLint, and Vitest.

- [ ] **Step 1: Write the failing configuration assertions**

```ts
expect(manifest.scripts.compile).toBe('tsc -p tsconfig.build.json');
expect(manifest.scripts.check).toBe('tsc -p tsconfig.json --noEmit && eslint . && vitest run');
expect(buildConfig.include).toEqual(['src/**/*.ts']);
expect(buildConfig.exclude).toContain('test');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run test/unit/toolingConfiguration.test.ts`

Expected: FAIL because no build config exists and the scripts still use the original compilation command.

- [ ] **Step 3: Add the minimal build configuration**

Create `tsconfig.build.json` with `{ "extends": "./tsconfig.json", "compilerOptions": { "outDir": "out", "rootDir": ".", "noEmit": false }, "include": ["src/**/*.ts"], "exclude": ["node_modules", "out", "test", ".vscode-test"] }`.

Set `tsconfig.json` `compilerOptions.noEmit` to `true`; retain `src` and `test` in its includes. Update `compile`, `check`, and `vscode:prepublish` scripts as specified above.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm vitest run test/unit/toolingConfiguration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json tsconfig.build.json package.json test/unit/toolingConfiguration.test.ts
git commit -m "build: separate runtime output from test checks"
```

### Task 2: Verify the actual package file set

**Files:**
- Create: `scripts/verify-package.mjs`
- Modify: `package.json`
- Modify: `.vscodeignore`
- Modify: `test/unit/toolingConfiguration.test.ts`

**Interfaces:**
- `pnpm run verify:package` exits zero only when `vsce ls` reports no forbidden path.
- Forbidden path prefixes are `out/test/`, `out/vitest.config.`, `docs/`, `.github/`, `.vscode/`, `test/`, `work/`, and `.superpowers/`.

- [ ] **Step 1: Write a failing test for the forbidden-path contract**

```ts
expect(packageVerification.forbiddenPrefixes).toEqual([
  'out/test/', 'out/vitest.config.', 'docs/', '.github/', '.vscode/',
  'test/', 'work/', '.superpowers/'
]);
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm vitest run test/unit/toolingConfiguration.test.ts`

Expected: FAIL because the package verifier module does not exist.

- [ ] **Step 3: Implement portable verification**

Export `forbiddenPrefixes` and `assertPackageContents(paths)` from `scripts/verify-package.mjs`. When executed directly, invoke `pnpm exec vsce ls` with `spawnSync`, split stdout into normalized POSIX paths, call the assertion, and throw an Error that lists each forbidden path. Add `verify:package` to `package.json`; add `scripts/**` and `tsconfig.build.json` to `.vscodeignore`.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `pnpm vitest run test/unit/toolingConfiguration.test.ts`

Expected: PASS.

- [ ] **Step 5: Verify the package itself**

Run: `pnpm run package --out codex-cost-extension.vsix && pnpm run verify:package`

Expected: a VSIX is produced and package verification exits 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-package.mjs package.json .vscodeignore test/unit/toolingConfiguration.test.ts
git commit -m "build: verify VSIX contents"
```

### Task 3: Harden CI and dependency maintenance

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/marketplace-publish.yml`
- Create: `.github/dependabot.yml`
- Modify: `test/unit/toolingConfiguration.test.ts`

**Interfaces:**
- CI includes `concurrency.group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}` and `cancel-in-progress: true`.
- CI uses these immutable references: checkout `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0`, pnpm setup `0ebf47130e4866e96fce0953f49152a61190b271`, setup-node `820762786026740c76f36085b0efc47a31fe5020`, upload-artifact `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`.
- Marketplace workflow exposes `workflow_dispatch` with a required `ref` input and environment `marketplace`.

- [ ] **Step 1: Write failing workflow assertions**

```ts
expect(workflow).toContain('cancel-in-progress: true');
expect(workflow).toContain('actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7');
expect(dependabot.packageEcosystem).toBe('npm');
expect(marketplaceWorkflow).toContain('VSCE_PAT: ${{ secrets.VSCE_PAT }}');
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm vitest run test/unit/toolingConfiguration.test.ts`

Expected: FAIL because current workflows use movable major tags and no Dependabot or Marketplace workflow exists.

- [ ] **Step 3: Implement CI hardening**

Pin the four CI actions to the declared SHAs with tag comments, add concurrency, and run `pnpm run verify:package` after packaging. Add weekly Dependabot entries for `npm` and `github-actions`.

Create a manual Marketplace workflow that checks out `inputs.ref`, sets up pnpm and Node 22 with the same pins, runs `pnpm install --frozen-lockfile`, `pnpm run check`, `pnpm run package`, and `pnpm run verify:package`, then executes `pnpm exec vsce publish --packagePath codex-cost-extension.vsix` with `VSCE_PAT` mapped from secrets.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `pnpm vitest run test/unit/toolingConfiguration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/marketplace-publish.yml .github/dependabot.yml test/unit/toolingConfiguration.test.ts
git commit -m "ci: harden workflows and prepare marketplace publish"
```

### Task 4: Add project and release documentation

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/pull_request_template.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `test/unit/packageManifest.test.ts`

**Interfaces:**
- `package.json.version` is `0.3.0`.
- README documents release download, Marketplace secret/environment setup, and the local verification command.

- [ ] **Step 1: Write failing release-metadata assertions**

```ts
expect(manifest.version).toBe('0.3.0');
expect(readText('CHANGELOG.md')).toContain('## 0.3.0');
expect(readText('CONTRIBUTING.md')).toContain('pnpm run check');
expect(readText('SECURITY.md')).toContain('security');
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm vitest run test/unit/packageManifest.test.ts`

Expected: FAIL because version and contributor/security documents are absent.

- [ ] **Step 3: Add release and community artifacts**

Set version to `0.3.0`. Move current Unreleased entries under a dated `0.3.0` section and add package/CI release notes. Document local contribution commands and reporting security vulnerabilities privately. Add focused YAML issue forms and PR checklist. README must instruct maintainers to create a protected `marketplace` environment and add `VSCE_PAT`, but must state that the workflow is manual-only.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `pnpm vitest run test/unit/packageManifest.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add CONTRIBUTING.md SECURITY.md .github README.md CHANGELOG.md package.json test/unit/packageManifest.test.ts
git commit -m "docs: prepare 0.3.0 release"
```

### Task 5: Full verification, PR, merge policy, and release

**Files:**
- Verify: all modified files

- [ ] **Step 1: Run the full local suite**

Run: `pnpm run check && pnpm audit --prod && pnpm run package --out codex-cost-extension.vsix && pnpm run verify:package`

Expected: zero test failures, no production dependency advisories, a VSIX, and zero forbidden paths.

- [ ] **Step 2: Inspect the VSIX**

Run: `tar -tf codex-cost-extension.vsix`

Expected: runtime `out/src/**` files and allowed extension assets only; no test, config, source, documentation, workflow, or local-workflow paths.

- [ ] **Step 3: Push the branch and open a pull request**

Create a PR into `main` titled `Release readiness and 0.3.0` with the package, workflow, security, and documentation changes.

- [ ] **Step 4: Configure merge policy**

Require the four CI checks (`validate` on Ubuntu, macOS, Windows and `package`), require a pull request, dismiss stale approvals, and require the branch to be up to date before merge.

- [ ] **Step 5: Confirm remote checks and merge**

Run: `gh pr checks <number> --watch`

Expected: all four CI checks succeed before merging.

- [ ] **Step 6: Create the GitHub release**

Create annotated tag `v0.3.0` on the merged `main` commit and create a non-draft GitHub release with `codex-cost-extension.vsix` attached. Release notes must state that Marketplace publication is prepared but intentionally not executed.

- [ ] **Step 7: Verify release artifact provenance**

Confirm the release tag points to merged `main`, the attachment downloads, and the VSIX digest matches the locally verified artifact.

## Plan self-review

- Spec coverage: Tasks 1–4 map directly to every in-scope design requirement; Task 5 verifies merge, protection, and release.
- Placeholder scan: no incomplete requirements or deferred implementation markers are present.
- Type consistency: package verifier exports and workflow constants are named once and used consistently across the tasks.
