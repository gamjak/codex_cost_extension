import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SessionRepository } from '../../src/data/sessionRepository';

const tempDirectories: string[] = [];

afterEach(async () => {
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
});
