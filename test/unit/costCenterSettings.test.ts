import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createGuidedSettingsDraft,
  RECOMMENDED_GUIDED_SETTINGS,
  resetSettingsGroup,
  settingsUpdates,
  validateGuidedSettings,
  type GuidedSettingsConfig
} from '../../src/domain/costCenterSettings';

const config: GuidedSettingsConfig = {
  logRoots: ['C:\\Users\\example\\.codex\\sessions'],
  sessionSources: ['vscode'],
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

  it('does not represent or emit pricing when a caller includes it at runtime', () => {
    const configWithPricing = {
      ...config,
      pricingByModel: { 'gpt-5.4': { inputPer1M: 2.5 } }
    };
    const draft = createGuidedSettingsDraft(configWithPricing);

    expect(draft).not.toHaveProperty('pricingByModel');
    expect(settingsUpdates(config, draft).map(({ key }) => key)).not.toContain('pricing.models');
    expectTypeOf<GuidedSettingsConfig>().not.toHaveProperty('pricingByModel');
  });

  it('keeps recommended defaults and all draft arrays independent after mutation attempts', () => {
    expect(() => {
      (RECOMMENDED_GUIDED_SETTINGS.dataSources.logRoots as string[]).push('C:\\mutated');
    }).toThrow(TypeError);
    expect(() => {
      (RECOMMENDED_GUIDED_SETTINGS.budget as { dayAmount: number }).dayAmount = 99;
    }).toThrow(TypeError);

    const first = createGuidedSettingsDraft(config);
    const second = createGuidedSettingsDraft(config);
    first.dataSources.logRoots.push('C:\\first-only');
    first.dataSources.include.push('cli');

    expect(second.dataSources).toEqual({
      logRoots: ['C:\\Users\\example\\.codex\\sessions'],
      include: ['vscode']
    });
    expect(resetSettingsGroup(first, 'dataSources').dataSources).toEqual({
      logRoots: ['%USERPROFILE%/.codex/sessions'],
      include: []
    });
  });

  it('returns independent reset state after a reset result is mutated', () => {
    const reset = resetSettingsGroup(createGuidedSettingsDraft(config), 'dataSources');
    reset.dataSources.logRoots.push('C:\\reset-only');

    expect(resetSettingsGroup(createGuidedSettingsDraft(config), 'dataSources').dataSources).toEqual({
      logRoots: ['%USERPROFILE%/.codex/sessions'],
      include: []
    });
  });
});
