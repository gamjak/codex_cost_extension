import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseSessionFile, parseSessionFileWithDiagnostics } from '../../src/data/jsonlSessionParser';
import {
  appendSessionToCheckpoint,
  parseSessionToCheckpoint
} from '../../src/data/sessionParseCheckpoint';

function tokenRecord(timestamp: string, totalTokens: number) {
  return {
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: totalTokens - 50,
          cached_input_tokens: 25,
          output_tokens: 50,
          total_tokens: totalTokens
        }
      }
    }
  };
}

async function temporaryJsonl(lines: unknown[]): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jsonl-checkpoint-'));
  const filePath = path.join(directory, 'session.jsonl');
  await fs.writeFile(filePath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
  return filePath;
}

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
    expect(session?.startedAt).toBe('2026-06-01T08:00:00.000Z');
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

  it('orders valid ISO timestamps with offsets by instant while preserving their original strings', async () => {
    const fixturePath = path.resolve('test/fixtures/offset-timestamps-session.jsonl');

    const session = await parseSessionFile(fixturePath);

    expect(session?.startedAt).toBe('2026-06-01T09:00:00.000+02:00');
    expect(session?.updatedAt).toBe('2026-06-01T07:30:00.000Z');
  });

  it('produces the same result when appended records are resumed or parsed fully', async () => {
    const filePath = await temporaryJsonl([
      { timestamp: '2026-07-16T12:00:00.000Z', type: 'session_meta', payload: { id: 'session-1' } },
      { timestamp: '2026-07-16T12:00:30.000Z', type: 'turn_context', payload: { cwd: 'C:\\repo', model: 'gpt-5.4' } },
      tokenRecord('2026-07-16T12:01:00.000Z', 100)
    ]);
    const initial = await parseSessionToCheckpoint(filePath);
    await fs.appendFile(
      filePath,
      `${JSON.stringify({ timestamp: '2026-07-16T12:02:00.000Z', type: 'turn_context', payload: { cwd: 'C:\\repo', model: 'gpt-5.4-mini' } })}\n` +
        `${JSON.stringify(tokenRecord('2026-07-16T12:03:00.000Z', 250))}\n`
    );

    const incremental = await appendSessionToCheckpoint(filePath, initial.checkpoint);
    const complete = await parseSessionToCheckpoint(filePath);

    expect(incremental.result).toEqual(complete.result);
    expect(incremental.checkpoint.bytesRead).toBe((await fs.stat(filePath)).size);
  });

  it('retains an incomplete JSON fragment without reporting it malformed until completed', async () => {
    const filePath = await temporaryJsonl([
      { timestamp: '2026-07-16T12:00:00.000Z', type: 'session_meta', payload: { id: 'session-1' } }
    ]);
    await fs.appendFile(filePath, '{"timestamp":"invalid');

    const partial = await parseSessionToCheckpoint(filePath);
    expect(partial.result.diagnostics.malformedLines).toBe(0);

    await fs.appendFile(filePath, '"}\n');
    const completed = await appendSessionToCheckpoint(filePath, partial.checkpoint);
    expect(completed.result.diagnostics.malformedLines).toBe(0);
    expect(completed.result.diagnostics.invalidTimestamps).toBe(1);
  });

  it('decodes UTF-8 text split across the append boundary exactly once', async () => {
    const filePath = await temporaryJsonl([
      { timestamp: '2026-07-16T12:00:00.000Z', type: 'session_meta', payload: { id: 'session-1' } }
    ]);
    const context = Buffer.from(
      JSON.stringify({ timestamp: '2026-07-16T12:01:00.000Z', type: 'turn_context', payload: { cwd: 'C:\\répo', model: 'mödél' } }) + '\n'
    );
    const split = context.indexOf(Buffer.from('é')) + 1;
    await fs.appendFile(filePath, context.subarray(0, split));
    const partial = await parseSessionToCheckpoint(filePath);
    await fs.appendFile(filePath, context.subarray(split));

    const completed = await appendSessionToCheckpoint(filePath, partial.checkpoint);
    expect(completed.result.session?.cwd).toBe('C:\\répo');
    expect(completed.result.session?.model).toBe('mödél');
  });

  it('accumulates malformed lines and invalid timestamps without double-counting', async () => {
    const filePath = await temporaryJsonl([
      { timestamp: '2026-07-16T12:00:00.000Z', type: 'session_meta', payload: { id: 'session-1' } }
    ]);
    await fs.appendFile(filePath, 'not json\n{"timestamp":"bad"}\n');
    const initial = await parseSessionToCheckpoint(filePath);
    await fs.appendFile(filePath, 'still not json\n{"timestamp":"also bad"}\n');

    const appended = await appendSessionToCheckpoint(filePath, initial.checkpoint);
    expect(appended.result.diagnostics).toMatchObject({ malformedLines: 2, invalidTimestamps: 2 });
  });

  it('does not mutate checkpoint metadata or usage history when append parsing fails', async () => {
    const filePath = await temporaryJsonl([
      { timestamp: '2026-07-16T12:00:00.000Z', type: 'session_meta', payload: { id: 'session-1', cwd: 'C:\\repo' } },
      tokenRecord('2026-07-16T12:01:00.000Z', 100)
    ]);
    const initial = await parseSessionToCheckpoint(filePath);
    const before = structuredClone(initial.checkpoint);
    await fs.rm(filePath);

    await expect(appendSessionToCheckpoint(filePath, initial.checkpoint)).rejects.toThrow();
    expect(initial.checkpoint.session).toEqual(before.session);
    expect(initial.checkpoint.diagnostics).toEqual(before.diagnostics);
  });

  it('rejects a checkpoint created for a different file', async () => {
    const firstPath = await temporaryJsonl([
      { timestamp: '2026-07-16T12:00:00.000Z', type: 'session_meta', payload: { id: 'session-1' } }
    ]);
    const secondPath = await temporaryJsonl([
      { timestamp: '2026-07-16T12:00:00.000Z', type: 'session_meta', payload: { id: 'session-2' } }
    ]);
    const first = await parseSessionToCheckpoint(firstPath);

    await expect(appendSessionToCheckpoint(secondPath, first.checkpoint)).rejects.toThrow(
      'does not match'
    );
  });
});
