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

  it('uses Node 24-based action majors while testing the project on Node 22', () => {
    const workflow = readText('.github/workflows/ci.yml');

    expect(workflow.match(/actions\/checkout@v7/g) ?? []).toHaveLength(2);
    expect(workflow.match(/pnpm\/action-setup@v6/g) ?? []).toHaveLength(2);
    expect(workflow.match(/actions\/setup-node@v7/g) ?? []).toHaveLength(2);
    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow.match(/node-version: 22/g) ?? []).toHaveLength(2);
    expect(workflow).not.toContain('@v4');
  });
});
