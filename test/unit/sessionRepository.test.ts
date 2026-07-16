import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  findSessionFileDescriptors as FindSessionFileDescriptors,
  SessionFileDescriptor
} from '../../src/data/sessionScanner';

const scannerMock = vi.hoisted(() => ({
  transform: undefined as undefined | ((descriptors: SessionFileDescriptor[]) => SessionFileDescriptor[])
}));

vi.mock('../../src/data/sessionScanner', async (importOriginal) => {
  const actual = await importOriginal<{ findSessionFileDescriptors: typeof FindSessionFileDescriptors }>();
  return {
    ...actual,
    findSessionFileDescriptors: async (...args: Parameters<typeof actual.findSessionFileDescriptors>) => {
      const descriptors = await actual.findSessionFileDescriptors(...args);
      return scannerMock.transform ? scannerMock.transform(descriptors) : descriptors;
    }
  };
});

import { SessionRepository } from '../../src/data/sessionRepository';

const tempDirectories: string[] = [];

afterEach(async () => {
  scannerMock.transform = undefined;
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

function sessionLines(inputTokens: number): string {
  return [
    JSON.stringify({ timestamp: '2026-07-10T10:00:00.000Z', type: 'session_meta', payload: { id: 'cached-session' } }),
    JSON.stringify({ timestamp: '2026-07-10T10:00:01.000Z', type: 'turn_context', payload: { cwd: '/repo', model: 'gpt-5.4' } }),
    JSON.stringify({
      timestamp: '2026-07-10T10:00:02.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: inputTokens, cached_input_tokens: 0, output_tokens: 1 } }
      }
    })
  ].join('\n');
}

function tokenLine(inputTokens: number, timestamp = '2026-07-10T10:00:03.000Z'): string {
  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: inputTokens, cached_input_tokens: 0, output_tokens: 1 } }
    }
  });
}

describe('SessionRepository', () => {
  it('loads sessions, reports malformed records, and re-reads changed files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cost-repository-'));
    tempDirectories.push(root);
    const sessionPath = path.join(root, 'session.jsonl');
    await fs.writeFile(sessionPath, `${sessionLines(10)}\nnot-json\n`, 'utf8');

    const repository = new SessionRepository({ concurrency: 2 });
    const first = await repository.load([root]);
    expect(first.sessions[0]?.usage?.inputTokens).toBe(10);
    expect(first.warnings).toContain('session.jsonl: skipped 1 malformed JSONL line(s).');

    await fs.writeFile(sessionPath, `${sessionLines(25)}\n`, 'utf8');
    const second = await repository.load([root]);
    expect(second.sessions[0]?.usage?.inputTokens).toBe(25);
    expect(second.warnings).toEqual([]);
  });

  it('skips parsing unchanged files and incrementally parses appended records', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cost-repository-'));
    tempDirectories.push(root);
    const sessionPath = path.join(root, 'session.jsonl');
    await fs.writeFile(sessionPath, `${sessionLines(10)}\n`, 'utf8');
    const events: string[] = [];
    const repository = new SessionRepository({
      onParse: (kind, filePath) => events.push(`${kind}:${path.basename(filePath)}`)
    });

    const cold = await repository.load([root]);
    expect(events).toEqual(['full:session.jsonl']);
    events.length = 0;
    expect(await repository.load([root])).toEqual(cold);
    expect(events).toEqual([]);

    await fs.appendFile(sessionPath, `${tokenLine(25)}\n`);
    const appended = await repository.load([root]);
    expect(events).toEqual(['append:session.jsonl']);
    expect(appended.sessions[0]?.usage?.inputTokens).toBe(25);
  });

  it('fully parses truncated and replaced files at the same path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cost-repository-'));
    tempDirectories.push(root);
    const sessionPath = path.join(root, 'session.jsonl');
    const events: string[] = [];
    const repository = new SessionRepository({ onParse: (kind) => events.push(kind) });
    await fs.writeFile(sessionPath, `${sessionLines(100)}\n${tokenLine(200)}\n`);
    await repository.load([root]);

    events.length = 0;
    await fs.writeFile(sessionPath, `${sessionLines(30)}\n`);
    expect((await repository.load([root])).sessions[0]?.usage?.inputTokens).toBe(30);
    expect(events).toEqual(['full']);

    events.length = 0;
    const replacement = path.join(root, 'replacement.jsonl');
    await fs.writeFile(replacement, `${sessionLines(40)}\n${tokenLine(50)}\n`);
    await fs.rename(replacement, sessionPath);
    expect((await repository.load([root])).sessions[0]?.usage?.inputTokens).toBe(50);
    expect(events).toEqual(['full']);
  });

  it('fully parses growth when native identity metadata becomes partial', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cost-repository-'));
    tempDirectories.push(root);
    const sessionPath = path.join(root, 'session.jsonl');
    const events: string[] = [];
    let scan = 0;
    let initialCtime = 0;
    scannerMock.transform = (descriptors) => descriptors.map((descriptor) => {
      scan += 1;
      if (scan === 1) {
        initialCtime = descriptor.ctimeMs;
        return { ...descriptor, dev: 10, ino: 20 };
      }
      const partial: SessionFileDescriptor = { ...descriptor };
      delete partial.ino;
      return { ...partial, dev: 10, ctimeMs: initialCtime };
    });
    const repository = new SessionRepository({ onParse: (kind) => events.push(kind) });
    await fs.writeFile(sessionPath, `${sessionLines(10)}\n`);
    await repository.load([root]);
    events.length = 0;
    await fs.appendFile(sessionPath, `${tokenLine(20)}\n`);

    expect((await repository.load([root])).sessions[0]?.usage?.inputTokens).toBe(20);
    expect(events).toEqual(['full']);
  });

  it('evicts deleted sessions and preserves descriptor order', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cost-repository-'));
    tempDirectories.push(root);
    const firstPath = path.join(root, 'a.jsonl');
    const secondPath = path.join(root, 'b.jsonl');
    await fs.writeFile(firstPath, `${sessionLines(10).replace('cached-session', 'a')}\n`);
    await fs.writeFile(secondPath, `${sessionLines(20).replace('cached-session', 'b')}\nnot-json\n`);
    const repository = new SessionRepository();

    expect((await repository.load([root])).sessions.map((session) => session.sessionId)).toEqual(['a', 'b']);
    await fs.rm(firstPath);
    const refreshed = await repository.load([root]);
    expect(refreshed.sessions.map((session) => session.sessionId)).toEqual(['b']);
    expect(refreshed.warnings).toEqual(['b.jsonl: skipped 1 malformed JSONL line(s).']);
  });

  it('drops a failed append checkpoint and retries the next refresh with a full parse', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cost-repository-'));
    tempDirectories.push(root);
    const sessionPath = path.join(root, 'session.jsonl');
    const events: string[] = [];
    let failAppend = false;
    const repository = new SessionRepository({
      onParse: (kind, filePath) => {
        events.push(kind);
        if (kind === 'append' && failAppend) fsSync.rmSync(filePath);
      }
    });
    await fs.writeFile(sessionPath, `${sessionLines(10)}\n`);
    await repository.load([root]);
    await fs.appendFile(sessionPath, `${tokenLine(20)}\n`);
    failAppend = true;

    const failed = await repository.load([root]);
    expect(events.at(-1)).toBe('append');
    expect(failed.sessions).toEqual([]);
    expect(failed.warnings[0]).toMatch(/^session\.jsonl: could not be read \(.+\)\.$/);

    failAppend = false;
    await fs.writeFile(sessionPath, `${sessionLines(30)}\n`);
    const recovered = await repository.load([root]);
    expect(events.at(-1)).toBe('full');
    expect(recovered.sessions[0]?.usage?.inputTokens).toBe(30);
  });
});
