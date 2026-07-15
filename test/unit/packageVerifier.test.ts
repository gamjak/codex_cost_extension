import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const requiredPackagePaths = [
  'extension/out/src/extension.js',
  'extension/package.json',
  'extension/README.md',
  'extension/LICENSE',
  'extension/package.nls.de.json'
];

function verifyPackage(paths: string[]) {
  return spawnSync(process.execPath, ['scripts/verify-package.mjs', '--paths', ...paths], {
    cwd: path.resolve('.'),
    encoding: 'utf8'
  });
}

function runPackageVerifier() {
  return spawnSync(process.execPath, ['scripts/run-package-verifier.mjs'], {
    cwd: path.resolve('.'),
    encoding: 'utf8'
  });
}

describe('package verifier', () => {
  it(
    'runs the VSCE tree verifier through the platform command shim',
    () => {
      const result = runPackageVerifier();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Package verification passed');
      expect(result.stderr).toBe('');
    },
    10_000
  );

  it('accepts a package containing every required release entry', () => {
    const result = verifyPackage(requiredPackagePaths);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('rejects a package missing the compiled extension entry point', () => {
    const result = verifyPackage(requiredPackagePaths.filter((entry) => entry !== 'extension/out/src/extension.js'));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('extension/out/src/extension.js');
  });

  it('rejects generated test and Vitest configuration output', () => {
    const result = verifyPackage([...requiredPackagePaths, 'extension/out/test/packageVerifier.test.js']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('extension/out/test/');

    for (const configPath of ['extension/out/vitest.config.js', 'extension/out/vitest.config.cjs']) {
      const configResult = verifyPackage([...requiredPackagePaths, configPath]);
      expect(configResult.status).not.toBe(0);
      expect(configResult.stderr).toContain(configPath);
    }
  });

  it('rejects repository metadata in the extension package', () => {
    for (const metadataPath of ['extension/.github/ISSUE_TEMPLATE/bug-report.yml', 'extension/.vscode/tasks.json']) {
      const result = verifyPackage([...requiredPackagePaths, metadataPath]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(metadataPath);
    }
  });
});
