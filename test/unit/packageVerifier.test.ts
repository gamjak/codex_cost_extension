import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const requiredPackagePaths = [
  'extension/out/src/extension.js',
  'extension/out/src/config.js',
  'extension/out/src/domain/costCenterAnalytics.js',
  'extension/out/src/domain/costCenterSettings.js',
  'extension/out/src/domain/costCenterState.js',
  'extension/out/src/domain/costCenterTimeRange.js',
  'extension/out/src/domain/costCenterTypes.js',
  'extension/out/src/domain/sessionFacts.js',
  'extension/out/src/view/costCenter.js',
  'extension/out/src/view/costCenterClient.js',
  'extension/out/src/view/costCenterController.js',
  'extension/out/src/view/costCenterOverviewPresentation.js',
  'extension/out/src/view/costCenterPresentation.js',
  'extension/out/src/view/costCenterSettingsPresentation.js',
  'extension/out/src/view/costCenterSummary.js',
  'extension/out/src/view/costCenterTablePresentation.js',
  'extension/package.json',
  'extension/readme.md',
  'extension/LICENSE.txt',
  'extension/package.nls.de.json'
];

function verifyPackage(paths: string[]) {
  return spawnSync(process.execPath, ['scripts/verify-package.mjs', '--paths', ...paths], {
    cwd: path.resolve('.'),
    encoding: 'utf8'
  });
}

function createEmptyZip(entries: string[]) {
  const localEntries: Buffer[] = [];
  const centralEntries: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry, 'utf8');
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(name.length, 26);
    localEntries.push(localHeader, name);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralEntries.push(centralHeader, name);
    localOffset += localHeader.length + name.length;
  }

  const centralDirectory = Buffer.concat(centralEntries);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(localOffset, 16);

  return Buffer.concat([...localEntries, centralDirectory, endOfCentralDirectory]);
}

describe('package verifier', () => {
  it('exposes the local refresh benchmark without packaging benchmark artifacts', async () => {
    const manifest = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const listing = spawnSync(process.execPath, [path.resolve('node_modules/@vscode/vsce/vsce'), 'ls'], {
      cwd: path.resolve('.'),
      encoding: 'utf8'
    });
    const includedFiles = listing.stdout.split(/\r?\n/u).filter(Boolean);

    expect(listing.status).toBe(0);
    expect(manifest.scripts?.['benchmark:refresh']).toBe(
      'vitest bench --run test/performance/sessionRepository.bench.ts'
    );
    expect(includedFiles.some((file) => file.startsWith('test/performance/'))).toBe(false);
    expect(includedFiles.some((file) => file.includes('benchmark-data'))).toBe(false);
  }, 15_000);

  it('accepts a package containing every required release entry', () => {
    const result = verifyPackage(requiredPackagePaths);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('verifies paths read from the generated VSIX archive', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'codex-cost-vsix-'));
    const packagePath = path.join(directory, 'extension.vsix');
    writeFileSync(packagePath, createEmptyZip(requiredPackagePaths));

    try {
      const result = spawnSync(process.execPath, ['scripts/run-package-verifier.mjs', '--package-path', packagePath], {
        cwd: path.resolve('.'),
        encoding: 'utf8'
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('rejects a package missing the compiled extension entry point', () => {
    const result = verifyPackage(requiredPackagePaths.filter((entry) => entry !== 'extension/out/src/extension.js'));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('extension/out/src/extension.js');
  });

  it('rejects a package missing a compiled Cost Center runtime module', () => {
    const requiredRuntimePath = 'extension/out/src/view/costCenterController.js';
    const result = verifyPackage(requiredPackagePaths.filter((entry) => entry !== requiredRuntimePath));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(requiredRuntimePath);
  });

  it('rejects a package missing the copied-summary runtime module', () => {
    const requiredRuntimePath = 'extension/out/src/view/costCenterSummary.js';
    const result = verifyPackage(requiredPackagePaths.filter((entry) => entry !== requiredRuntimePath));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(requiredRuntimePath);
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

  it('rejects deleted legacy dashboard runtime output', () => {
    for (const legacyPath of [
      'extension/out/src/view/costDashboard.js',
      'extension/out/src/view/dashboardPresentation.js'
    ]) {
      const result = verifyPackage([...requiredPackagePaths, legacyPath]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(legacyPath);
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
