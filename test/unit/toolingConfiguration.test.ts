import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';
import vitestConfig from '../../vitest.config';

interface ToolingManifest {
  scripts: {
    compile: string;
    check: string;
    test: string;
    watch: string;
    'vscode:prepublish': string;
  };
  devDependencies?: Record<string, string>;
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.resolve(relativePath), 'utf8');
}

function readManifest(): ToolingManifest {
  return JSON.parse(readText('package.json')) as ToolingManifest;
}

function readJson(relativePath: string): unknown {
  return JSON.parse(readText(relativePath));
}

function countActiveWorkflowLines(workflow: string, line: RegExp): number {
  return workflow.split(/\r?\n/).filter((candidate) => line.test(candidate)).length;
}

describe('tooling configuration', () => {
  it('separates runtime compilation from type checking and tests', () => {
    const scripts = readManifest().scripts;

    expect(scripts.compile).toBe('node scripts/clean-build.mjs && tsc -p tsconfig.build.json');
    expect(scripts.check).toBe('tsc -p tsconfig.json --noEmit && eslint . && vitest run');
    expect(scripts.test).toBe('vitest run');
    expect(scripts.watch).toBe('tsc -watch -p tsconfig.build.json');
    expect(scripts['vscode:prepublish']).toBe(
      'node scripts/clean-build.mjs && tsc -p tsconfig.build.json && eslint . && vitest run'
    );

    expect(vitestConfig.test?.exclude).toEqual([
      'out/**',
      'node_modules/**',
      '.vscode-test/**'
    ]);
  });

  it('declares a Vite version compatible with the Vitest runner', () => {
    const manifest = readManifest();

    expect(manifest.devDependencies).toMatchObject({
      vitest: '^4.1.10',
      vite: '^6.0.0'
    });
  });

  it('emits only extension source files in the runtime build configuration', () => {
    expect(fs.existsSync(path.resolve('tsconfig.build.json'))).toBe(true);

    const buildConfig = readJson('tsconfig.build.json') as {
      extends: string;
      compilerOptions: Record<string, unknown>;
      include: string[];
      exclude: string[];
    };

    expect(buildConfig.extends).toBe('./tsconfig.json');
    expect(buildConfig.compilerOptions).toMatchObject({
      outDir: 'out',
      rootDir: '.',
      noEmit: false
    });
    expect(buildConfig.include).toEqual(['src/**/*.ts']);
    expect(buildConfig.exclude).toEqual(['node_modules', 'out', 'test', '.vscode-test']);

    const checkConfig = readJson('tsconfig.json') as {
      compilerOptions: Record<string, unknown>;
    };
    expect(checkConfig.compilerOptions.noEmit).toBe(true);
  });

  it('keeps local tooling artifacts out of the extension package', () => {
    const ignoredPaths = readText('.vscodeignore').split(/\r?\n/);
    expect(ignoredPaths).toContain('vitest.config.ts');
    expect(ignoredPaths).toContain('.superpowers/**');
  });

  it('uses immutable action pins and cancels stale CI runs', () => {
    const workflow = readText('.github/workflows/ci.yml');

    expect(workflow).toContain('group: ${{ github.workflow }}-${{ github.ref }}');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(countActiveWorkflowLines(workflow, /^\s*- uses: actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0\s+# v7\s*$/)).toBe(2);
    expect(countActiveWorkflowLines(workflow, /^\s*- uses: pnpm\/action-setup@0ebf47130e4866e96fce0953f49152a61190b271\s+# v6\s*$/)).toBe(2);
    expect(countActiveWorkflowLines(workflow, /^\s*- uses: actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020\s+# v7\s*$/)).toBe(2);
    expect(countActiveWorkflowLines(workflow, /^\s*- uses: actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a\s+# v7\s*$/)).toBe(1);
    expect(countActiveWorkflowLines(workflow, /^\s*node-version: 22\s*$/)).toBe(2);
    expect(workflow).toMatch(/pnpm run package --out codex-cost-extension\.vsix\s*\n\s*- run: pnpm run verify-package/);
  });

  it('lints Node package tooling with its runtime globals', () => {
    const eslintConfig = readText('eslint.config.mjs');

    expect(eslintConfig).toContain("files: ['scripts/**/*.mjs']");
    expect(eslintConfig).toContain("process: 'readonly'");
    expect(eslintConfig).toContain("console: 'readonly'");
  });

  it('keeps dependency updates bounded and weekly', () => {
    const dependabot = readText('.github/dependabot.yml');

    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot).toContain('package-ecosystem: npm');
    expect(countActiveWorkflowLines(dependabot, /^\s*interval: weekly\s*$/)).toBe(2);
    expect(countActiveWorkflowLines(dependabot, /^\s*open-pull-requests-limit: 5\s*$/)).toBe(2);
  });

  it('makes Marketplace publication manual, approved, and secret-scoped', () => {
    const workflow = readText('.github/workflows/marketplace-publish.yml');

    expect(workflow).toMatch(/^on:\s*\n\s*workflow_dispatch:/m);
    expect(workflow).toContain('release_tag:');
    expect(workflow).toContain('description: Existing GitHub Release tag to publish');
    expect(workflow).toMatch(/release_tag:[\s\S]*?required: true/);
    expect(workflow).toMatch(/^permissions:\s*\n\s+contents: read\s*$/m);
    expect(workflow).toContain('environment: marketplace');
    expect(workflow).toContain('- name: Validate GitHub release tag');
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow).toContain('gh release view "$RELEASE_TAG"');
    expect(workflow).toContain('--json tagName --jq \'.tagName\')" = "$RELEASE_TAG"');
    expect(workflow.indexOf('- name: Validate GitHub release tag')).toBeLessThan(
      workflow.indexOf('actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7')
    );
    expect(workflow).toContain('ref: ${{ inputs.release_tag }}');
    expect(workflow).toContain('actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7');
    expect(workflow).toContain('pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6');
    expect(workflow).toContain('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7');
    expect(workflow).toMatch(/pnpm run check\s*\n\s*- run: pnpm run package --out codex-cost-extension\.vsix\s*\n\s*- run: pnpm run verify-package/);
    expect(workflow).toMatch(/- name: Publish to VS Code Marketplace\s*\n\s+env:\s*\n\s+VSCE_PAT: \$\{\{ secrets\.VSCE_PAT \}\}\s*\n\s+run: pnpm exec vsce publish --packagePath codex-cost-extension\.vsix/m);
    expect((workflow.match(/VSCE_PAT/g) ?? [])).toHaveLength(2);
  });

  it('keeps the readme focused on extension use while documenting contributor and security paths separately', () => {
    const manifest = readManifest() as ToolingManifest & { version: string };
    const changelog = readText('CHANGELOG.md');
    const readme = readText('README.md');
    const contributing = readText('CONTRIBUTING.md');
    const security = readText('SECURITY.md');
    const bugTemplate = readText('.github/ISSUE_TEMPLATE/bug-report.yml');
    const featureTemplate = readText('.github/ISSUE_TEMPLATE/feature-request.yml');
    const pullRequestTemplate = readText('.github/pull_request_template.md');

    expect(manifest.version).toBe('0.5.0');
    expect(changelog).toContain('## 0.5.0 - 2026-07-16');
    expect(changelog).toContain('## 0.4.0 - 2026-07-15');
    expect(changelog).toContain('## 0.3.0 - 2026-07-15');
    expect(changelog).toContain('does not automatically publish to the VS Code Marketplace');
    expect(contributing).toContain('pnpm install --frozen-lockfile');
    expect(contributing).toContain('pnpm run verify-package');
    expect(contributing).toContain('Conventional Commits');
    expect(security).toContain('private vulnerability reporting');
    expect(security).toContain('0.3.x');
    expect(security).toContain('five business days');
    expect(readme).toContain('Installation from a VSIX');
    expect(readme).toContain('Privacy and data access');
    expect(readme).not.toContain('Local development');
    expect(readme).not.toContain('Publish to VS Code Marketplace');
    expect(readme).not.toContain('VSCE_PAT');
    expect(bugTemplate).toContain('name: Bug report');
    expect(bugTemplate).toContain('validations:');
    expect(featureTemplate).toContain('name: Feature request');
    expect(featureTemplate).toContain('validations:');
    expect(pullRequestTemplate).toContain('pnpm run verify-package');
    expect(pullRequestTemplate).toContain('No secrets');
  });

  it('does not treat comments or arbitrary text as active workflow steps', () => {
    const inactiveWorkflowText = [
      '# - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7',
      'description: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7',
      '# node-version: 22',
      'description: node-version: 22'
    ].join('\n');

    expect(countActiveWorkflowLines(inactiveWorkflowText, /^\s*- uses: actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0\s+# v7\s*$/)).toBe(0);
    expect(countActiveWorkflowLines(inactiveWorkflowText, /^\s*node-version: 22\s*$/)).toBe(0);
  });
});
