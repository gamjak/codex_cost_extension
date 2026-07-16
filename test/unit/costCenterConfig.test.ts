import { describe, expect, it, vi } from 'vitest';

const configurationValues = vi.hoisted(() => new Map<string, unknown>());

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: <T>(key: string, fallback?: T): T => (configurationValues.has(key)
        ? configurationValues.get(key) as T
        : fallback as T),
      inspect: () => undefined
    })
  }
}));

import { readExtensionConfig } from '../../src/config';

function readConfig(values: Record<string, unknown>) {
  configurationValues.clear();
  for (const [key, value] of Object.entries(values)) {
    configurationValues.set(key, value);
  }

  return readExtensionConfig();
}

describe('readExtensionConfig Cost Center defaults', () => {
  it('normalizes Cost Center defaults and configured session sources', () => {
    expect(readConfig({ 'costCenter.defaultRange': 'invalid' }).costCenterDefaults.range).toBe('7d');
    expect(readConfig({ 'costCenter.compareByDefault': 'yes' }).costCenterDefaults.compare).toBe(false);
    expect(readConfig({ 'sources.include': ['CLI', 'cli', ' VSCode '] }).sessionSources).toEqual(['cli', 'vscode']);
  });

  it('preserves raw log roots while resolving roots for scanning', () => {
    expect(readConfig({ logRoots: ['~/sessions'] })).toMatchObject({
      rawLogRoots: ['~/sessions']
    });
    expect(readConfig({ logRoots: ['~/sessions'] }).logRoots[0]).not.toBe('~/sessions');
  });
});
