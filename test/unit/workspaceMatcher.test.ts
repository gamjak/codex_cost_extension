import { describe, expect, it } from 'vitest';

import { matchesWorkspaceRoots, normalizeFsPath } from '../../src/domain/workspaceMatcher';

describe('normalizeFsPath', () => {
  it('normalizes separators, case, and trailing slashes', () => {
    expect(normalizeFsPath('C:\\Users\\gambjako\\Repo\\')).toBe('c:/users/gambjako/repo');
  });
});

describe('matchesWorkspaceRoots', () => {
  it('matches the same workspace root ignoring case', () => {
    expect(
      matchesWorkspaceRoots('C:\\Users\\gambjako\\Repositories\\codex_cost_extension', [
        'c:/users/gambjako/repositories/codex_cost_extension'
      ])
    ).toBe(true);
  });

  it('matches child folders within the workspace', () => {
    expect(
      matchesWorkspaceRoots('C:\\Users\\gambjako\\Repositories\\codex_cost_extension\\src', [
        'C:\\Users\\gambjako\\Repositories\\codex_cost_extension'
      ])
    ).toBe(true);
  });

  it('does not match sibling folders that share a prefix', () => {
    expect(
      matchesWorkspaceRoots('C:\\Users\\gambjako\\Repositories\\codex_cost_extension_two', [
        'C:\\Users\\gambjako\\Repositories\\codex_cost_extension'
      ])
    ).toBe(false);
  });

  it('returns false when session cwd is missing', () => {
    expect(matchesWorkspaceRoots(undefined, ['C:\\Users\\gambjako\\Repositories\\codex_cost_extension'])).toBe(false);
  });
});
