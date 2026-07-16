import { describe, expect, it } from 'vitest';
import type { ExtensionConfig } from '../../src/config';
import {
  createGuidedSettingsDraft,
  resetSettingsGroup,
  settingsUpdates,
  validateGuidedSettings
} from '../../src/domain/costCenterSettings';

const config: ExtensionConfig = {
  logRoots: ['C:\\Users\\example\\.codex\\sessions'],
  pricingByModel: { 'gpt-5.4': { inputPer1M: 2.5, cachedInputPer1M: 0.25, outputPer1M: 15 } },
  sessionSources: ['vscode'],
  scopeDefault: 'workspace',
  autoRefreshSeconds: 60,
  filterStartDate: '',
  budgetSettings: { dayAmount: 5, weekAmount: 15, monthAmount: 50, warningPercent: 80 },
  budgetNotificationsEnabled: true,
  budgetNotificationEveryAmount: 10,
  statusBarVisibility: { showSession: true, showWorkspace: false, showBudget: true },
  statusBarBudgetPeriod: 'month'
};

describe('guided cost-center settings', () => {
  it('validates editable values and produces only changed settings', () => {
    const draft = createGuidedSettingsDraft(config);
    draft.budget.dayAmount = -1;

    expect(validateGuidedSettings(draft)).toEqual({
      'budget.dayAmount': 'Enter zero or a positive USD amount.'
    });

    draft.budget.dayAmount = 12;
    expect(settingsUpdates(config, draft)).toEqual([
      { key: 'budget.dayAmount', value: 12 }
    ]);
  });

  it('resets a settings group to its recommended defaults without changing other groups', () => {
    const draft = createGuidedSettingsDraft(config);
    const reset = resetSettingsGroup(draft, 'budget');

    expect(reset.budget).toEqual({
      dayAmount: 0,
      weekAmount: 0,
      monthAmount: 0,
      warningPercent: 80
    });
    expect(reset.display).toEqual(draft.display);
  });

  it('validates bounds and requires at least one log root', () => {
    const draft = createGuidedSettingsDraft(config);

    expect(validateGuidedSettings({
      ...draft,
      budget: { ...draft.budget, warningPercent: 101 }
    })).toHaveProperty('budget.warningPercent');
    expect(validateGuidedSettings({
      ...draft,
      notifications: { ...draft.notifications, everyAmount: -1 }
    })).toHaveProperty('notifications.everyAmount');
    expect(validateGuidedSettings({
      ...draft,
      dataSources: { ...draft.dataSources, logRoots: [] }
    })).toHaveProperty('dataSources.logRoots');
  });

  it('normalizes source filters and emits no updates for an unchanged draft', () => {
    expect(createGuidedSettingsDraft({
      ...config,
      sessionSources: [' VSCode ', 'vscode', 'CLI']
    }).dataSources.include).toEqual(['vscode', 'cli']);
    expect(settingsUpdates(config, createGuidedSettingsDraft(config))).toEqual([]);
  });
});
