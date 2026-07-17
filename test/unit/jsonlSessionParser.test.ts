import * as fs from 'node:fs/promises';
import type * as nodeFs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const readStreamObserver = vi.hoisted(() => ({ starts: [] as Array<number | undefined> }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof nodeFs>();
  return {
    ...actual,
    createReadStream: (...args: Parameters<typeof actual.createReadStream>) => {
      const options = args[1];
      readStreamObserver.starts.push(typeof options === 'object' && options !== null ? options.start : undefined);
      return actual.createReadStream(args[0], options);
    }
  };
});

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

async function temporaryRawJsonl(contents: string | Buffer): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jsonl-checkpoint-'));
  const filePath = path.join(directory, 'session.jsonl');
  await fs.writeFile(filePath, contents);
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

  it.each([
    ['newline-terminated final record', '\n'],
    ['valid non-newline final record', ''],
    ['CRLF records', '\r\n']
  ])('builds an equivalent resumable checkpoint for %s', async (_label, separator) => {
    const records = [
      { timestamp: '2026-07-16T12:00:00.000Z', type: 'session_meta', payload: { id: 'session-é' } },
      { timestamp: '2026-07-16T12:00:30.000Z', type: 'turn_context', payload: { cwd: 'C:\\répo', model: 'mödél' } },
      tokenRecord('2026-07-16T12:01:00.000Z', 100)
    ];
    const delimiter = separator === '\r\n' ? '\r\n' : '\n';
    const filePath = await temporaryRawJsonl(`${records.map((entry) => JSON.stringify(entry)).join(delimiter)}${separator}`);

    const checkpoint = await parseSessionToCheckpoint(filePath);
    const parsed = await parseSessionFileWithDiagnostics(filePath);

    expect(checkpoint.result).toEqual(parsed);
    expect(checkpoint.checkpoint.bytesRead).toBe((await fs.stat(filePath)).size);
    expect(checkpoint.checkpoint.pendingBytes).toHaveLength(0);
    expect(checkpoint.result.session).toMatchObject({ sessionId: 'session-é', cwd: 'C:\\répo', model: 'mödél' });
  });

  it('retains exact invalid partial final bytes without counting them malformed', async () => {
    const complete = `${JSON.stringify({ timestamp: '2026-07-16T12:00:00.000Z', type: 'session_meta', payload: { id: 'session-1' } })}\n`;
    const partial = Buffer.from('{"payload":"caf\xc3', 'binary');
    const filePath = await temporaryRawJsonl(Buffer.concat([Buffer.from(complete), partial]));

    const checkpoint = await parseSessionToCheckpoint(filePath);

    expect(Buffer.from(checkpoint.checkpoint.pendingBytes)).toEqual(partial);
    expect(checkpoint.checkpoint.bytesRead).toBe(Buffer.byteLength(complete) + partial.length);
    expect(checkpoint.result.diagnostics.malformedLines).toBe(0);
  });

  it('accumulates a multi-chunk final fragment with one bounded concatenation', async () => {
    const partial = Buffer.from(`{"payload":"${'x'.repeat(256 * 1024)}`);
    const filePath = await temporaryRawJsonl(partial);
    const concatenate = Buffer.concat.bind(Buffer);
    const concatSpy = vi.spyOn(Buffer, 'concat').mockImplementation((...args) => concatenate(...args));

    try {
      const checkpoint = await parseSessionToCheckpoint(filePath);

      expect(Buffer.from(checkpoint.checkpoint.pendingBytes)).toEqual(partial);
      expect(checkpoint.result.diagnostics.malformedLines).toBe(0);
      expect(concatSpy).toHaveBeenCalledTimes(1);
    } finally {
      concatSpy.mockRestore();
    }
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

  it('opens an incremental stream at the checkpoint byte offset', async () => {
    const filePath = await temporaryJsonl([
      { timestamp: '2026-07-16T12:00:00.000Z', type: 'session_meta', payload: { id: 'session-1' } }
    ]);
    const initial = await parseSessionToCheckpoint(filePath);
    await fs.appendFile(filePath, `${JSON.stringify(tokenRecord('2026-07-16T12:01:00.000Z', 100))}\n`);
    readStreamObserver.starts.length = 0;

    await appendSessionToCheckpoint(filePath, initial.checkpoint);

    expect(readStreamObserver.starts).toEqual([initial.checkpoint.bytesRead]);
  });

  it('accumulates a large newline-free append with linear byte allocation', async () => {
    const filePath = await temporaryJsonl([
      { timestamp: '2026-07-16T12:00:00.000Z', type: 'session_meta', payload: { id: 'session-1' } }
    ]);
    const initial = await parseSessionToCheckpoint(filePath);
    const partial = Buffer.from(`{"payload":"${'x'.repeat(256 * 1024)}`);
    await fs.appendFile(filePath, partial);
    const NativeUint8Array = Uint8Array;
    let allocatedBytes = 0;
    const InstrumentedUint8Array = new Proxy(NativeUint8Array, {
      construct(target, args) {
        if (typeof args[0] === 'number') allocatedBytes += args[0];
        return Reflect.construct(target, args) as Uint8Array;
      }
    });
    vi.stubGlobal('Uint8Array', InstrumentedUint8Array);

    try {
      const appended = await appendSessionToCheckpoint(filePath, initial.checkpoint);
      expect(Buffer.from(appended.checkpoint.pendingBytes)).toEqual(partial);
      expect(appended.result.diagnostics.malformedLines).toBe(0);
      expect(allocatedBytes).toBeLessThan(partial.length * 2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('streams a large newline-rich append without concatenating the complete payload', async () => {
    const filePath = await temporaryJsonl([
      { timestamp: '2026-07-16T12:00:00.000Z', type: 'session_meta', payload: { id: 'session-1' } }
    ]);
    const initial = await parseSessionToCheckpoint(filePath);
    const lines: string[] = [];
    let index = 0;
    let payloadBytes = 0;
    while (payloadBytes < 2 * 1024 * 1024) {
      const line = JSON.stringify(tokenRecord(new Date(Date.UTC(2026, 6, 16, 12, 1, index++)).toISOString(), index + 100));
      lines.push(line);
      payloadBytes += Buffer.byteLength(line) + 1;
    }
    const payload = Buffer.from(`${lines.join('\n')}\n`);
    await fs.appendFile(filePath, payload);
    const concatenate = Buffer.concat.bind(Buffer);
    let maximumConcatBytes = 0;
    const concatSpy = vi.spyOn(Buffer, 'concat').mockImplementation((buffers, totalLength) => {
      maximumConcatBytes = Math.max(
        maximumConcatBytes,
        totalLength ?? buffers.reduce((total, buffer) => total + buffer.length, 0)
      );
      return concatenate(buffers, totalLength);
    });
    let incremental: Awaited<ReturnType<typeof appendSessionToCheckpoint>>;

    try {
      incremental = await appendSessionToCheckpoint(filePath, initial.checkpoint);
    } finally {
      concatSpy.mockRestore();
    }
    const complete = await parseSessionToCheckpoint(filePath);

    expect(incremental.result).toEqual(complete.result);
    expect(incremental.checkpoint.pendingBytes).toHaveLength(0);
    expect(incremental.result.diagnostics).toEqual(complete.result.diagnostics);
    expect(maximumConcatBytes).toBeLessThan(64 * 1024);
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
