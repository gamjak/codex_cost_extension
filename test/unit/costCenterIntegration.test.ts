/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';

import type { ExtensionConfig } from '../../src/config';
import type { CostCenterPreferences } from '../../src/domain/costCenterState';
import type { ParsedSession } from '../../src/domain/types';
import { ConfigurationRefreshController } from '../../src/configurationRefreshController';
import { saveDailyBudget } from '../../src/configureDailyBudget';
import { CostCenterController, type CostCenterControllerDependencies } from '../../src/view/costCenterController';
import type { CostDataSnapshot } from '../../src/view/costTreeProvider';

class Memory {
  private readonly values = new Map<string, unknown>();
  get<T>(key: string, fallback?: T): T | undefined { return (this.values.has(key) ? this.values.get(key) : fallback) as T | undefined; }
  update(key: string, value: unknown): Promise<void> { this.values.set(key, value); return Promise.resolve(); }
}

const configuration: ExtensionConfig = {
  rawLogRoots: ['root-a'], logRoots: ['root-a'], pricingByModel: {}, customPricingModels: new Set(), sessionSources: [],
  scopeDefault: 'workspace', costCenterDefaults: { range: '30d', compare: true }, autoRefreshSeconds: 60,
  filterStartDate: '', budgetSettings: { dayAmount: 0, weekAmount: 0, monthAmount: 0, warningPercent: 80 },
  budgetNotificationsEnabled: true, budgetNotificationEveryAmount: 0, budgetNotificationThresholdSummary: true,
  statusBarVisibility: { showSession: true, showWorkspace: true, showBudget: true }, statusBarBudgetPeriod: 'month'
};

function snapshot(overrides: Partial<CostDataSnapshot> = {}): CostDataSnapshot {
  return { sessions: [] as ParsedSession[], filesCount: 0, warnings: [], refreshedAt: new Date('2026-07-16T12:00:00Z'), workspaceRoots: ['C:\\repo'], configuration, ...overrides };
}

function setup(saved?: CostCenterPreferences) {
  const workspaceState = new Memory(); const globalState = new Memory();
  if (saved) void workspaceState.update('codexCost.costCenter.preferences', saved);
  let latest = snapshot();
  const deps: CostCenterControllerDependencies = {
    workspaceState, globalState, getSnapshot: () => latest, refresh: vi.fn(() => Promise.resolve()),
    readConfiguration: () => configuration, applySettingsBatch: vi.fn(() => Promise.resolve()),
    loadRoots: vi.fn((roots: readonly string[]) => Promise.resolve({ sessions: [], filesCount: roots[0] === 'missing' ? 0 : 1, warnings: [] })),
    executeCommand: vi.fn(() => Promise.resolve()), showInformationMessage: vi.fn(() => Promise.resolve()), reportError: vi.fn()
  };
  return { controller: new CostCenterController(deps), deps, workspaceState, globalState, setSnapshot(value: CostDataSnapshot) { latest = value; } };
}

describe('Cost Center integration controller', () => {
  it('opens from configuration defaults, then restores workspace preferences without rescanning', async () => {
    const first = setup();
    expect((await first.controller.open()).report.filters).toEqual({ scope: 'workspace', range: { kind: '30d', compare: true }, section: 'overview' });
    await first.controller.handle({ type: 'setSection', value: 'models' });
    expect(first.workspaceState.get('codexCost.costCenter.preferences')).toMatchObject({ section: 'models' });
    expect(first.deps.refresh).toHaveBeenCalledTimes(0);

    const saved = setup({ scope: 'all', range: { kind: 'today', compare: false }, section: 'projects' });
    expect((await saved.controller.open()).report.filters).toMatchObject({ scope: 'all', range: { kind: 'today' }, section: 'projects' });
  });

  it('leaves the previous range and persisted preferences unchanged for invalid custom dates', async () => {
    const { controller, workspaceState } = setup();
    const initial = await controller.open();
    const result = await controller.handle({ type: 'setRange', value: { kind: 'custom', startDate: '31.02.2026', endDate: '01.03.2026', compare: true } });
    expect(result.report.filters.range).toEqual(initial.report.filters.range);
    expect(result.rangeError).toBe('Enter valid dates in DD.MM.YYYY format with the end on or after the start.');
    expect(workspaceState.get('codexCost.costCenter.preferences')).toBeUndefined();
  });

  it('re-aggregates drill-down state from the cached snapshot and only refreshes explicit data actions', async () => {
    const { controller, deps } = setup(); await controller.open();
    await controller.handle({ type: 'drillModel', key: 'gpt-5' });
    await controller.handle({ type: 'filterChartPoint', pointStart: '2026-07-16T00:00:00.000Z', pointEndExclusive: '2026-07-16T01:00:00.000Z' });
    expect(deps.refresh).not.toHaveBeenCalled();
    await controller.handle({ type: 'refresh' });
    expect(deps.refresh).toHaveBeenCalledOnce();
  });

  it('validates and allowlists guided writes, batching source changes into exactly one refresh', async () => {
    const { controller, deps } = setup(); await controller.open();
    await controller.handle({ type: 'openSettings' });
    await controller.handle({ type: 'updateSettingField', key: 'budget.dayAmount', value: 12 });
    await controller.handle({ type: 'saveSettings' });
    expect(deps.applySettingsBatch).toHaveBeenCalledWith([{ key: 'budget.dayAmount', value: 12 }]);
    expect(deps.refresh).not.toHaveBeenCalled();

    await controller.handle({ type: 'updateSettingField', key: 'dataSources.logRoots', value: ['new-root'] });
    await controller.handle({ type: 'saveSettings' });
    expect(deps.applySettingsBatch).toHaveBeenLastCalledWith(expect.arrayContaining([{ key: 'logRoots', value: ['new-root'] }]));
    expect(deps.refresh).not.toHaveBeenCalled();

    const writesBeforeInvalidSave = vi.mocked(deps.applySettingsBatch).mock.calls.length;
    await controller.handle({ type: 'updateSettingField', key: 'budget.dayAmount', value: -1 });
    await controller.handle({ type: 'saveSettings' });
    expect(deps.applySettingsBatch).toHaveBeenCalledTimes(writesBeforeInvalidSave);
  });

  it('checks each draft root, opens advanced settings, and tests notifications without writes', async () => {
    const { controller, deps } = setup(); await controller.open(); await controller.handle({ type: 'openSettings' });
    await controller.handle({ type: 'updateSettingField', key: 'dataSources.logRoots', value: ['root-a', 'missing'] });
    const checked = await controller.handle({ type: 'checkData' });
    expect(deps.loadRoots).toHaveBeenCalledTimes(2);
    expect(checked.settings?.diagnostics.map((item) => item.status)).toEqual(['ok', 'missing']);
    await controller.handle({ type: 'openAdvancedPricing' }); await controller.handle({ type: 'openAdvancedSettings' });
    expect(deps.executeCommand).toHaveBeenNthCalledWith(1, 'workbench.action.openSettings', '@ext:gamjak.codex-cost-extension codexCost.pricing.models');
    expect(deps.executeCommand).toHaveBeenNthCalledWith(2, 'workbench.action.openSettings', '@ext:gamjak.codex-cost-extension');
    await controller.handle({ type: 'testNotification' });
    expect(deps.showInformationMessage).toHaveBeenCalledOnce(); expect(deps.applySettingsBatch).not.toHaveBeenCalled();
  });

  it('reports render errors while retaining its last model', async () => {
    const { controller, deps } = setup(); const model = await controller.open();
    controller.reportError(new Error('render failed'));
    expect(deps.reportError).toHaveBeenCalledWith(expect.stringContaining('render failed'));
    expect(controller.getModel()).toBe(model);
  });
});

describe('real configuration listener and guided batch coordination', () => {
  it('reaggregates ordinary settings from cache and rescans only data-source changes', async () => {
    const refresh = vi.fn(() => Promise.resolve()); const reaggregate = vi.fn(() => Promise.resolve());
    const coordinator = new ConfigurationRefreshController(refresh, reaggregate);
    await coordinator.handleChange(eventFor('codexCost.budget.dayAmount'));
    await coordinator.handleChange(eventFor('codexCost.costCenter.defaultRange'));
    expect(refresh).not.toHaveBeenCalled(); expect(reaggregate).toHaveBeenCalledTimes(2);
    await coordinator.handleChange(eventFor('codexCost.logRoots'));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('suppresses every listener event for the entire guided batch and publishes exactly once afterward', async () => {
    const refresh = vi.fn(() => Promise.resolve()); const reaggregate = vi.fn(() => Promise.resolve());
    const coordinator = new ConfigurationRefreshController(refresh, reaggregate);
    const update = vi.fn(async (key: string) => { await coordinator.handleChange(eventFor(`codexCost.${key}`)); });
    await coordinator.applyGuidedSettings([{ key: 'budget.dayAmount', value: 12 }, { key: 'statusBar.showBudget', value: false }], update);
    expect(update).toHaveBeenCalledTimes(2); expect(refresh).not.toHaveBeenCalled(); expect(reaggregate).toHaveBeenCalledOnce();
    await coordinator.applyGuidedSettings([{ key: 'logRoots', value: ['new'] }, { key: 'sources.include', value: ['cli'] }], update);
    expect(refresh).toHaveBeenCalledOnce(); expect(reaggregate).toHaveBeenCalledOnce();
  });

  it('suppresses guided configuration events delivered after update promises settle', async () => {
    const refresh = vi.fn(() => Promise.resolve()); const reaggregate = vi.fn(() => Promise.resolve());
    const coordinator = new ConfigurationRefreshController(refresh, reaggregate); const delayed: Array<() => Promise<void>> = [];
    await coordinator.applyGuidedSettings([{ key: 'logRoots', value: ['new'] }], (key) => {
      delayed.push(() => coordinator.handleChange(eventFor(`codexCost.${key}`))); return Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledOnce();
    await delayed[0]();
    expect(refresh).toHaveBeenCalledOnce(); expect(reaggregate).not.toHaveBeenCalled();
  });

  it('uses cached publication for the configure-daily-budget command path', async () => {
    const scan = vi.fn(() => Promise.resolve()); const publishCached = vi.fn(() => Promise.resolve());
    const coordinator = new ConfigurationRefreshController(scan, publishCached); const writes: Array<[string, unknown]> = [];
    await saveDailyBudget(coordinator, 20, (key, value) => { writes.push([key, value]); return Promise.resolve(); });
    expect(writes).toEqual([['budget.dayAmount', 20]]); expect(scan).not.toHaveBeenCalled(); expect(publishCached).toHaveBeenCalledOnce();
  });
});

function eventFor(changed: string) { return { affectsConfiguration(section: string) { return section === changed || section === 'codexCost'; } }; }
