import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  ViewColumn: { Active: 1 },
  window: { createWebviewPanel: vi.fn(), showWarningMessage: vi.fn() }
}));

import { parseCostCenterMessage } from '../../src/view/costCenter';

describe('parseCostCenterMessage', () => {
  it('accepts and canonicalizes every allowlisted message shape', () => {
    const messages = [
      { type: 'refresh' }, { type: 'copySummary' }, { type: 'openSettings' },
      { type: 'setScope', value: 'workspace' },
      { type: 'setRange', value: { kind: '7d', compare: true } },
      { type: 'setSection', value: 'sessions' },
      { type: 'setSettingsGroup', value: 'display' },
      { type: 'clearFilter', value: 'project' },
      { type: 'drillProject', key: 'c:\\repo\\one' }, { type: 'drillModel', key: 'gpt-5.4' },
      { type: 'filterChartPoint', pointStart: '2026-07-16T00:00:00.000Z', pointEndExclusive: '2026-07-17T00:00:00.000Z' },
      { type: 'toggleProjectPin', key: 'c:\\repo\\one' }, { type: 'excludeProject', key: 'c:\\repo\\one' },
      { type: 'toggleSession', key: 'session-key' },
      { type: 'setSearch', value: 'gpt' }, { type: 'setSort', key: 'models', value: 'totalTokens' },
      { type: 'updateSettingField', key: 'budget.dayAmount', value: 12 },
      { type: 'resetSettingsGroup', value: 'budget' },
      { type: 'saveSettings' }, { type: 'discardSettings' }, { type: 'checkData' },
      { type: 'testNotification' }, { type: 'openAdvancedSettings' }, { type: 'openAdvancedPricing' }
    ] as const;
    for (const message of messages) expect(parseCostCenterMessage(message)).toEqual(message);
    expect(parseCostCenterMessage({ type: 'saveSettings', extra: '<script>' })).toEqual({ type: 'saveSettings' });
  });

  it('rejects unknown, malformed, non-allowlisted, and oversized values', () => {
    const invalid = [
      null, [], 'refresh', { type: 'unknown' }, { type: 'setSection', value: 'secrets' },
      { type: 'setScope', value: 1 }, { type: 'clearFilter', value: 'secret' },
      { type: 'updateSettingField', key: 'pricing.models', value: {} },
      { type: 'updateSettingField', key: 'budget.dayAmount', value: '12' },
      { type: 'updateSettingField', key: 'display.showSession', value: 1 },
      { type: 'updateSettingField', key: 'dataSources.logRoots', value: [1] },
      { type: 'drillProject', key: 'x'.repeat(4097) },
      { type: 'setSort', key: 'models', value: 'updatedAt' },
      { type: 'filterChartPoint', key: '2026-07-16' },
      { type: 'filterChartPoint', pointStart: 'later', pointEndExclusive: 'earlier' },
      { type: 'setRange', value: { kind: 'custom', compare: false, startDate: 'x'.repeat(4097), endDate: 'x' } }
    ];
    for (const message of invalid) expect(parseCostCenterMessage(message)).toBeUndefined();
  });
});
