import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ output: [] as string[] }));
vi.mock('vscode', () => ({
  EventEmitter: class { event = vi.fn(); fire = vi.fn(); }, TreeItemCollapsibleState: { None: 0, Expanded: 1 },
  StatusBarAlignment: { Left: 1 }, ThemeIcon: class {}, ThemeColor: class {},
  env: { language: 'en', clipboard: { writeText: vi.fn() } },
  workspace: { workspaceFolders: [{ uri: { fsPath: 'C:\\repo' } }], getConfiguration: vi.fn(() => ({ get: vi.fn((_key: string, fallback: unknown) => fallback), inspect: vi.fn() })) },
  window: {
    createStatusBarItem: vi.fn(() => ({ show: vi.fn(), hide: vi.fn(), dispose: vi.fn() })),
    createOutputChannel: vi.fn(() => ({ appendLine: (line: string) => mocks.output.push(line), dispose: vi.fn() })),
    showInformationMessage: vi.fn()
  }
}));

import { CodexCostTreeProvider } from '../../src/view/costTreeProvider';

describe('Cost tree provider snapshot publication', () => {
  beforeEach(() => { mocks.output.length = 0; });
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
});
