import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';
import vitestConfig from '../../vitest.config';

interface ToolingManifest {
  scripts: {
    compile: string;
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

function readJson(relativePath: string): unknown {
  return JSON.parse(readText(relativePath));
}

function countActiveWorkflowLines(workflow: string, line: RegExp): number {
  return workflow.split(/\r?\n/).filter((candidate) => line.test(candidate)).length;
}

describe('tooling configuration', () => {
  it('separates runtime compilation from type checking and tests', () => {
    const scripts = readManifest().scripts;

    expect(scripts.compile).toBe('tsc -p tsconfig.build.json');
    expect(scripts.check).toBe('tsc -p tsconfig.json --noEmit && eslint . && vitest run');
    expect(scripts.test).toBe('vitest run');
    expect(scripts['vscode:prepublish']).toBe('tsc -p ./ && eslint . && vitest run');

    expect(vitestConfig.test?.exclude).toEqual([
      'out/**',
      'node_modules/**',
      '.vscode-test/**'
    ]);
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

  it('uses Node 24-based action majors while testing the project on Node 22', () => {
    const workflow = readText('.github/workflows/ci.yml');

    expect(countActiveWorkflowLines(workflow, /^\s*- uses: actions\/checkout@v7\s*$/)).toBe(2);
    expect(countActiveWorkflowLines(workflow, /^\s*- uses: pnpm\/action-setup@v6\s*$/)).toBe(2);
    expect(countActiveWorkflowLines(workflow, /^\s*- uses: actions\/setup-node@v7\s*$/)).toBe(2);
    expect(countActiveWorkflowLines(workflow, /^\s*- uses: actions\/upload-artifact@v7\s*$/)).toBe(1);
    expect(countActiveWorkflowLines(workflow, /^\s*node-version: 22\s*$/)).toBe(2);
    expect(countActiveWorkflowLines(workflow, /^\s*- uses: \S+@v4\s*$/)).toBe(0);
  });

  it('does not treat comments or arbitrary text as active workflow steps', () => {
    const inactiveWorkflowText = [
      '# - uses: actions/checkout@v7',
      'description: actions/checkout@v7',
      '# node-version: 22',
      'description: node-version: 22'
    ].join('\n');

    expect(countActiveWorkflowLines(inactiveWorkflowText, /^\s*- uses: actions\/checkout@v7\s*$/)).toBe(0);
    expect(countActiveWorkflowLines(inactiveWorkflowText, /^\s*node-version: 22\s*$/)).toBe(0);
  });
});
