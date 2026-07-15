# CI Tooling Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make validation and VS Code extension packaging deterministic on Ubuntu, macOS, and Windows while removing GitHub Actions Node 20 runtime warnings.

**Architecture:** Centralize Vitest discovery exclusions in `vitest.config.ts` so package scripts contain no shell-sensitive globs. Protect the tooling contract with file-level regression tests, then update only the action majors in the existing workflow while keeping Node.js 22 as the project toolchain.

**Tech Stack:** TypeScript 5.8, Vitest 2.1, pnpm 11.7, VSCE 3.9, GitHub Actions

## Global Constraints

- Keep `node-version: 22` in every validation and packaging job.
- Use `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`, and `actions/upload-artifact@v7`.
- Keep the existing operating-system matrix, `fail-fast: false`, permissions, audit, packaging, and artifact behavior.
- Do not change extension runtime behavior, pricing data, or user-facing functionality.
- Do not push, rerun a workflow, or open a pull request without separate authorization.

---

### Task 1: Make Vitest discovery shell-independent

**Files:**
- Create: `test/unit/toolingConfiguration.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json:284-291`
- Modify: `.vscodeignore:14-20`

**Interfaces:**
- Consumes: repository-root configuration files read through `fs.readFileSync(path.resolve(...), 'utf8')`.
- Produces: a centralized Vitest exclusion contract and package scripts that invoke `vitest run` without CLI globs.

- [ ] **Step 1: Write the failing tooling regression tests**

Create `test/unit/toolingConfiguration.test.ts` with:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface ToolingManifest {
  scripts: {
    check: string;
    test: string;
    'vscode:prepublish': string;
  };
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.resolve(relativePath), 'utf8');
}

function readManifest(): ToolingManifest {
  return JSON.parse(readText('package.json')) as ToolingManifest;
}

describe('tooling configuration', () => {
  it('centralizes Vitest exclusions outside shell commands', () => {
    const scripts = readManifest().scripts;

    expect(scripts.check).toBe('tsc -p ./ && eslint . && vitest run');
    expect(scripts.test).toBe('vitest run');
    expect(scripts['vscode:prepublish']).toBe('tsc -p ./ && eslint . && vitest run');

    const configPath = path.resolve('vitest.config.ts');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = readText('vitest.config.ts');
    expect(config).toContain("'out/**'");
    expect(config).toContain("'node_modules/**'");
    expect(config).toContain("'.vscode-test/**'");
  });

  it('keeps the Vitest config out of the extension package', () => {
    const ignoredPaths = readText('.vscodeignore').split(/\r?\n/);
    expect(ignoredPaths).toContain('vitest.config.ts');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm run test -- test/unit/toolingConfiguration.test.ts`

Expected: FAIL because the three scripts still contain `--exclude` arguments, `vitest.config.ts` does not exist, and `.vscodeignore` does not contain `vitest.config.ts`.

- [ ] **Step 3: Add the centralized Vitest configuration**

Create `vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      'out/**',
      'node_modules/**',
      '.vscode-test/**'
    ]
  }
});
```

- [ ] **Step 4: Simplify the package scripts**

Replace the three script values in `package.json` with:

```json
"check": "tsc -p ./ && eslint . && vitest run",
"test": "vitest run",
"vscode:prepublish": "tsc -p ./ && eslint . && vitest run"
```

Keep `compile`, `lint`, `package`, and `watch` unchanged.

- [ ] **Step 5: Exclude the Vitest configuration from the VSIX**

Add this exact line to `.vscodeignore` next to the other root tooling files:

```text
vitest.config.ts
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `pnpm run test -- test/unit/toolingConfiguration.test.ts`

Expected: PASS with 1 test file and 2 tests passing; no file beneath `out/` is selected.

- [ ] **Step 7: Run the complete validation suite**

Run: `pnpm run check`

Expected: PASS for TypeScript, ESLint, and all Vitest source suites. The suite count increases from 14 files and 42 tests to 15 files and 44 tests.

- [ ] **Step 8: Commit the shell-independent test configuration**

```bash
git add test/unit/toolingConfiguration.test.ts vitest.config.ts package.json .vscodeignore
git commit -m "fix: make Vitest discovery cross-platform"
```

---

### Task 2: Upgrade GitHub Actions and verify packaging

**Files:**
- Modify: `test/unit/toolingConfiguration.test.ts`
- Modify: `.github/workflows/ci.yml:19-40`

**Interfaces:**
- Consumes: the `readText(relativePath: string): string` test helper created in Task 1.
- Produces: a workflow pinned to Node 24-based action majors while retaining Node.js 22 for project commands.

- [ ] **Step 1: Add the failing workflow regression test**

Append this test inside the existing `describe('tooling configuration', ...)` block:

```ts
it('uses Node 24-based action majors while testing the project on Node 22', () => {
  const workflow = readText('.github/workflows/ci.yml');

  expect(workflow.match(/actions\/checkout@v7/g) ?? []).toHaveLength(2);
  expect(workflow.match(/pnpm\/action-setup@v6/g) ?? []).toHaveLength(2);
  expect(workflow.match(/actions\/setup-node@v7/g) ?? []).toHaveLength(2);
  expect(workflow).toContain('actions/upload-artifact@v7');
  expect(workflow.match(/node-version: 22/g) ?? []).toHaveLength(2);
  expect(workflow).not.toContain('@v4');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm run test -- test/unit/toolingConfiguration.test.ts`

Expected: FAIL because the workflow still uses `checkout@v4`, `action-setup@v4`, `setup-node@v4`, and `upload-artifact@v4`.

- [ ] **Step 3: Update only the workflow action majors**

Replace `.github/workflows/ci.yml` with this content:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  validate:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run check
      - run: pnpm audit --prod

  package:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run package --out codex-cost-extension.vsix
      - uses: actions/upload-artifact@v7
        with:
          name: codex-cost-extension
          path: codex-cost-extension.vsix
```

- [ ] **Step 4: Run the focused workflow test and verify GREEN**

Run: `pnpm run test -- test/unit/toolingConfiguration.test.ts`

Expected: PASS with 1 test file and 3 tests passing.

- [ ] **Step 5: Run all local CI-equivalent commands**

Run each command separately:

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm audit --prod
pnpm run vscode:prepublish
pnpm run package --out codex-cost-extension.vsix
```

Expected:

- Installation reports an unchanged lockfile.
- Validation passes with 15 test files and 45 tests.
- Production audit exits successfully.
- Prepublish passes without selecting `out/test`.
- VSCE creates `codex-cost-extension.vsix` successfully.

- [ ] **Step 6: Inspect and clean the generated package artifact**

Run: `Get-Item 'codex-cost-extension.vsix' | Select-Object Name,Length`

Expected: one non-empty `codex-cost-extension.vsix` file.

Then remove only that ignored generated artifact:

```powershell
$artifact = (Resolve-Path 'codex-cost-extension.vsix').Path
$workspace = (Resolve-Path '.').Path
if (-not $artifact.StartsWith($workspace + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to remove artifact outside workspace: $artifact"
}
Remove-Item -LiteralPath $artifact -Force
```

- [ ] **Step 7: Verify the final diff and worktree**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only `.github/workflows/ci.yml` plus the Task 2 test modification are uncommitted.

- [ ] **Step 8: Commit the action upgrades**

```bash
git add test/unit/toolingConfiguration.test.ts .github/workflows/ci.yml
git commit -m "ci: update actions to Node 24 runtimes"
```

- [ ] **Step 9: Perform the final repository verification**

Run:

```bash
pnpm run check
git status --short --branch
```

Expected: 15 test files and 45 tests pass, and the branch is clean with four local commits ahead of `origin/main` (design, implementation plan, cross-platform Vitest fix, action upgrades).
