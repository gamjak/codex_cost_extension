import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ panels: [] as MockPanel[], warnings: [] as Array<string | undefined> }));

interface MockPanel {
  viewColumn: number;
  reveal: ReturnType<typeof vi.fn>;
  webview: { html: string; onDidReceiveMessage(callback: (value: unknown) => Promise<void>): void };
  onDidDispose(callback: () => void): void;
  dispose(): void;
  receive(value: unknown): Promise<void>;
}

vi.mock('vscode', () => ({
  ViewColumn: { Active: 1 },
  window: {
    createWebviewPanel: vi.fn(() => {
      let receive: (value: unknown) => Promise<void> = () => Promise.resolve();
      let disposed = () => {};
      const panel: MockPanel = {
        viewColumn: 1,
        reveal: vi.fn(),
        webview: { html: '', onDidReceiveMessage(callback) { receive = callback; } },
        onDidDispose(callback) { disposed = callback; },
        dispose() { disposed(); },
        receive(value) { return receive(value); }
      };
      mocks.panels.push(panel);
      return panel;
    }),
    showWarningMessage: vi.fn(() => Promise.resolve(mocks.warnings.shift()))
  }
}));

import { CostCenter, type CostCenterActions } from '../../src/view/costCenter';
import type { CostCenterViewModel } from '../../src/view/costCenterPresentation';

describe('CostCenter host', () => {
  beforeEach(() => { mocks.panels.length = 0; mocks.warnings.length = 0; vi.clearAllMocks(); });

  it('retains one panel across show and updates only while open', () => {
    const host = new CostCenter(actions());
    host.show(model('First'));
    const panel = mocks.panels[0];
    host.show(model('Second'));
    expect(mocks.panels).toHaveLength(1);
    expect(panel.reveal).toHaveBeenCalledOnce();
    expect(panel.webview.html).toContain('Second');
    host.update(model('Third'));
    expect(panel.webview.html).toContain('Third');
  });

  it.each([['Save'], ['Discard']])('dispatches %s when dirty close is confirmed', async (choice) => {
    const handleMessage = vi.fn();
    mocks.warnings.push(choice);
    const host = new CostCenter(actions({ handleMessage }));
    host.show(model('Dirty', true));
    mocks.panels[0].dispose();
    await tick();
    expect(handleMessage).toHaveBeenCalledWith({ type: choice === 'Save' ? 'saveSettings' : 'discardSettings' });
  });

  it('treats a dismissed dirty-close warning as Cancel and reopens', async () => {
    mocks.warnings.push(undefined);
    const host = new CostCenter(actions());
    host.show(model('Dirty', true));
    mocks.panels[0].dispose();
    await tick();
    expect(mocks.panels).toHaveLength(2);
  });

  it('keeps invalid saved settings open and renders returned field errors', async () => {
    mocks.warnings.push('Save');
    const invalid = model('Invalid', true, { 'budget.dayAmount': 'Bad amount' });
    const host = new CostCenter(actions({ handleMessage: vi.fn(() => Promise.resolve(invalid)) }));
    host.show(model('Dirty', true));
    mocks.panels[0].dispose();
    await tick();
    expect(mocks.panels).toHaveLength(2);
    expect(mocks.panels[1].webview.html).toContain('Bad amount');
  });

  it('contains callback, render, and reporting failures', async () => {
    const reportError = vi.fn(() => Promise.reject(new Error('report failed')));
    const host = new CostCenter(actions({ handleMessage: vi.fn(() => Promise.reject(new Error('callback failed'))), reportError }));
    host.show(model('Safe'));
    await expect(mocks.panels[0].receive({ type: 'refresh' })).resolves.toBeUndefined();
    const broken = model('Broken');
    Object.defineProperty(broken, 'report', { get() { throw new Error('render failed'); } });
    expect(() => host.update(broken)).not.toThrow();
    await tick();
    expect(reportError).toHaveBeenCalledTimes(2);
  });

  it('requires confirmation before excluding a project', async () => {
    const handleMessage = vi.fn();
    mocks.warnings.push(undefined, 'Exclude');
    const host = new CostCenter(actions({ handleMessage }));
    host.show(model('Safe'));
    await mocks.panels[0].receive({ type: 'excludeProject', key: 'project' });
    expect(handleMessage).not.toHaveBeenCalled();
    await mocks.panels[0].receive({ type: 'excludeProject', key: 'project' });
    expect(handleMessage).toHaveBeenCalledWith({ type: 'excludeProject', key: 'project' });
  });

  it('requires modal confirmation before resetting a settings group', async () => {
    const handleMessage = vi.fn();
    mocks.warnings.push(undefined, 'Restore');
    const host = new CostCenter(actions({ handleMessage }));
    host.show(model('Dirty', true));
    await mocks.panels[0].receive({ type: 'resetSettingsGroup', value: 'budget' });
    expect(handleMessage).not.toHaveBeenCalled();
    await mocks.panels[0].receive({ type: 'resetSettingsGroup', value: 'budget' });
    expect(handleMessage).toHaveBeenCalledWith({ type: 'resetSettingsGroup', value: 'budget' });
    expect(vi.mocked((await import('vscode')).window.showWarningMessage)).toHaveBeenLastCalledWith(
      'Restore recommended settings for this group? Unsaved draft values will be replaced.',
      { modal: true }, 'Restore'
    );
  });
});

function actions(overrides: Partial<CostCenterActions> = {}): CostCenterActions {
  return { handleMessage: vi.fn(), reportError: vi.fn(), ...overrides };
}

function model(label: string, dirty = false, errors: Record<string, string> = {}): CostCenterViewModel {
  return {
    report: {
      filters: { scope: 'workspace', range: { kind: '7d', compare: false }, section: 'overview' }, rangeLabel: label,
      summary: { cost: { value: 0, partial: false }, totalTokens: 0, activeDays: 0, averageCostPerActiveDay: 0, sessionCount: 0 },
      budget: { period: 'week', amount: 0, spent: 0, remaining: 0, projected: undefined, state: 'neutral', explanation: label, partial: false },
      chart: [], drivers: {}, sessions: [], projects: [], models: [], warnings: []
    },
    uiState: { filters: { scope: 'workspace', range: { kind: '7d', compare: false }, section: 'overview' }, search: '', sort: { sessions: { column: 'estimatedCost', direction: 'desc' }, projects: { column: 'estimatedCost', direction: 'desc' }, models: { column: 'estimatedCost', direction: 'desc' } } },
    settings: dirty ? { open: true, group: 'budget', dirty, errors, diagnostics: [], draft: { budget: { dayAmount: -1, weekAmount: 0, monthAmount: 0, warningPercent: 80 }, display: { showSession: true, showWorkspace: true, showBudget: true, budgetPeriod: 'month', defaultRange: '7d', compareByDefault: false }, dataSources: { logRoots: ['root'], include: [] }, notifications: { enabled: true, everyAmount: 0, thresholdSummary: true } } } : undefined
  };
}

async function tick(): Promise<void> { await new Promise((resolve) => setTimeout(resolve, 0)); }
