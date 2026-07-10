import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseSessionFile, parseSessionFileWithDiagnostics } from '../../src/data/jsonlSessionParser';

describe('parseSessionFile', () => {
  it('keeps cumulative snapshot history alongside the latest model/cwd data', async () => {
    const fixturePath = path.resolve('test/fixtures/workspace-session.jsonl');

    const session = await parseSessionFile(fixturePath);

    expect(session).not.toBeNull();
    expect(session?.sessionId).toBe('session-workspace');
    expect(session?.source).toBe('vscode');
    expect(session?.originator).toBe('codex_vscode');
    expect(session?.model).toBe('gpt-5.4');
    expect(session?.cwd).toBe('C:\\Users\\gambjako\\Repositories\\codex_cost_extension\\src');
    expect(session?.usage).toEqual({
      inputTokens: 2500,
      cachedInputTokens: 700,
      outputTokens: 900,
      totalTokens: 3400
    });
    expect(session?.usageHistory).toEqual([
      {
        timestamp: '2026-06-01T08:02:00.000Z',
        cwd: 'C:\\Users\\gambjako\\Repositories\\codex_cost_extension',
        model: 'gpt-5.4',
        tokens: {
          inputTokens: 1000,
          cachedInputTokens: 200,
          outputTokens: 400,
          totalTokens: 1400
        }
      },
      {
        timestamp: '2026-06-01T08:04:00.000Z',
        cwd: 'C:\\Users\\gambjako\\Repositories\\codex_cost_extension\\src',
        model: 'gpt-5.4',
        tokens: {
          inputTokens: 2500,
          cachedInputTokens: 700,
          outputTokens: 900,
          totalTokens: 3400
        }
      }
    ]);
    expect(session?.updatedAt).toBe('2026-06-01T08:04:00.000Z');
  });

  it('ignores malformed lines and still returns valid session data', async () => {
    const fixturePath = path.resolve('test/fixtures/malformed-session.jsonl');

    const session = await parseSessionFile(fixturePath);

    expect(session).not.toBeNull();
    expect(session?.sessionId).toBe('session-malformed');
    expect(session?.model).toBeUndefined();
    expect(session?.usage).toEqual({
      inputTokens: 300,
      cachedInputTokens: 0,
      outputTokens: 50,
      totalTokens: 350
    });
    expect(session?.usageHistory).toEqual([
      {
        timestamp: '2026-06-01T09:02:00.000Z',
        cwd: 'C:\\Users\\gambjako\\Repositories\\other_repo',
        model: undefined,
        tokens: {
          inputTokens: 300,
          cachedInputTokens: 0,
          outputTokens: 50,
          totalTokens: 350
        }
      }
    ]);
  });

  it('reports malformed lines without rejecting the complete file', async () => {
    const fixturePath = path.resolve('test/fixtures/malformed-session.jsonl');
    const result = await parseSessionFileWithDiagnostics(fixturePath);

    expect(result.session?.sessionId).toBe('session-malformed');
    expect(result.diagnostics.malformedLines).toBe(1);
  });
});
