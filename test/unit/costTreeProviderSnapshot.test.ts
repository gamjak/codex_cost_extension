import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ output: [] as string[], values: new Map<string, unknown>(), statusShows: 0 }));
vi.mock('vscode', () => ({
  EventEmitter: class { event = vi.fn(); fire = vi.fn(); }, TreeItemCollapsibleState: { None: 0, Expanded: 1 },
  StatusBarAlignment: { Left: 1 }, ThemeIcon: class {}, ThemeColor: class {},
  env: { language: 'en', clipboard: { writeText: vi.fn() } },
  workspace: { workspaceFolders: [{ uri: { fsPath: 'C:\\repo' } }], getConfiguration: vi.fn(() => ({ get: vi.fn((key: string, fallback: unknown) => mocks.values.get(key) ?? fallback), inspect: vi.fn() })) },
  window: {
    createStatusBarItem: vi.fn(() => ({ show: vi.fn(() => { mocks.statusShows += 1; }), hide: vi.fn(), dispose: vi.fn() })),
    createOutputChannel: vi.fn(() => ({ appendLine: (line: string) => mocks.output.push(line), dispose: vi.fn() })),
    showInformationMessage: vi.fn()
  }
}));

import { CodexCostTreeProvider } from '../../src/view/costTreeProvider';
import { SessionRepository } from '../../src/data/sessionRepository';

const tempDirectories: string[] = [];

describe('Cost tree provider snapshot publication', () => {
  beforeEach(() => { mocks.output.length = 0; mocks.values.clear(); mocks.statusShows = 0; });
  afterEach(async () => {
    await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
  });
  it('publishes successful snapshots and retains the last one across a failed refresh', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce({ sessions: [], filesCount: 1, warnings: ['first'] })
      .mockRejectedValueOnce(new Error('scan failed'));
    const context = { workspaceState: { get: vi.fn((_key: string, fallback: unknown) => fallback), update: vi.fn() }, subscriptions: [] };
    const provider = new CodexCostTreeProvider(context as never, { load });
    const updater = vi.fn(); provider.setCostCenterUpdater(updater);
    await provider.refresh(); const successful = provider.getLatestCostData();
    expect(successful).toMatchObject({ filesCount: 1, warnings: ['first'], workspaceRoots: ['C:\\repo'] });
    expect(updater).toHaveBeenCalledOnce();
    await provider.refresh();
    expect(provider.getLatestCostData()).toBe(successful); expect(updater).toHaveBeenCalledOnce();
    expect(mocks.output.some((line) => line.includes('scan failed'))).toBe(true);
  });

  it('publishes every cached consumer with current configuration without loading the repository', async () => {
    const load = vi.fn().mockResolvedValue({ sessions: [], filesCount: 1, warnings: [] });
    const context = { workspaceState: { get: vi.fn((_key: string, fallback: unknown) => fallback), update: vi.fn() }, subscriptions: [] };
    const provider = new CodexCostTreeProvider(context as never, { load }); const updater = vi.fn(); provider.setCostCenterUpdater(updater);
    await provider.refresh(); const showsAfterScan = mocks.statusShows;
    mocks.values.set('budget.dayAmount', 25);
    await provider.publishCachedConsumers();
    expect(load).toHaveBeenCalledOnce();
    expect(provider.getLatestCostData()?.configuration.budgetSettings.dayAmount).toBe(25);
    expect(updater).toHaveBeenCalledTimes(2);
    expect(mocks.statusShows).toBeGreaterThan(showsAfterScan);
  });

  it('publishes the same session snapshot after incremental append as a fresh repository', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cost-snapshot-'));
    tempDirectories.push(root);
    const sessionPath = path.join(root, 'session.jsonl');
    const record = (tokens: number, timestamp: string) => JSON.stringify({
      timestamp,
      type: 'event_msg',
      payload: { type: 'token_count', info: { total_token_usage: { input_tokens: tokens, output_tokens: 1 } } }
    });
    await fs.writeFile(sessionPath,
      `${JSON.stringify({ timestamp: '2026-07-10T10:00:00.000Z', type: 'session_meta', payload: { id: 'incremental' } })}\n` +
      `${record(10, '2026-07-10T10:00:01.000Z')}\n`);
    const repository = new SessionRepository();
    const context = { workspaceState: { get: vi.fn((_key: string, fallback: unknown) => fallback), update: vi.fn() }, subscriptions: [] };
    const provider = new CodexCostTreeProvider(context as never, repository);
    mocks.values.set('logRoots', [root]);
    await provider.refresh();
    await fs.appendFile(sessionPath, `${record(25, '2026-07-10T10:00:02.000Z')}\n`);

    await provider.refresh();
    const fresh = await new SessionRepository().load([root]);
    expect(provider.getLatestCostData()?.sessions).toEqual(fresh.sessions);
  });
});
