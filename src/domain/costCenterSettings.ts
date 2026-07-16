import type { BudgetPeriod, BudgetSettings, StatusBarVisibility } from './types';

export interface GuidedSettingsDraft {
  budget: {
    dayAmount: number;
    weekAmount: number;
    monthAmount: number;
    warningPercent: number;
  };
  display: {
    showSession: boolean;
    showWorkspace: boolean;
    showBudget: boolean;
    budgetPeriod: BudgetPeriod;
    defaultRange: 'today' | '7d' | '30d';
    compareByDefault: boolean;
  };
  dataSources: {
    logRoots: string[];
    include: string[];
  };
  notifications: {
    enabled: boolean;
    everyAmount: number;
    thresholdSummary: boolean;
  };
}

export type GuidedSettingsGroup = 'budget' | 'display' | 'dataSources' | 'notifications';

export type GuidedSettingField =
  | 'budget.dayAmount'
  | 'budget.weekAmount'
  | 'budget.monthAmount'
  | 'budget.warningPercent'
  | 'display.showSession'
  | 'display.showWorkspace'
  | 'display.showBudget'
  | 'display.budgetPeriod'
  | 'display.defaultRange'
  | 'display.compareByDefault'
  | 'dataSources.logRoots'
  | 'dataSources.include'
  | 'notifications.enabled'
  | 'notifications.everyAmount'
  | 'notifications.thresholdSummary';

export interface GuidedSettingsUpdate {
  key: GuidedSettingField;
  value: boolean | number | string | string[];
}

export interface GuidedSettingsConfig {
  logRoots: string[];
  rawLogRoots?: string[];
  sessionSources: string[];
  budgetSettings: BudgetSettings;
  budgetNotificationsEnabled: boolean;
  budgetNotificationEveryAmount: number;
  statusBarVisibility: StatusBarVisibility;
  statusBarBudgetPeriod: BudgetPeriod;
  costCenterDefaults?: { range: 'today' | '7d' | '30d'; compare: boolean };
  budgetNotificationThresholdSummary?: boolean;
}

type DeepReadonly<T> = T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } : T;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
    Object.freeze(value);
  }

  return value as DeepReadonly<T>;
}

export const RECOMMENDED_GUIDED_SETTINGS = deepFreeze({
  budget: { dayAmount: 0, weekAmount: 0, monthAmount: 0, warningPercent: 80 },
  display: {
    showSession: true,
    showWorkspace: true,
    showBudget: true,
    budgetPeriod: 'month',
    defaultRange: '7d',
    compareByDefault: false
  },
  dataSources: { logRoots: ['%USERPROFILE%/.codex/sessions'], include: [] },
  notifications: { enabled: true, everyAmount: 0, thresholdSummary: true }
} satisfies GuidedSettingsDraft);

function cloneDraft(draft: GuidedSettingsDraft): GuidedSettingsDraft {
  return {
    budget: { ...draft.budget },
    display: { ...draft.display },
    dataSources: { logRoots: [...draft.dataSources.logRoots], include: [...draft.dataSources.include] },
    notifications: { ...draft.notifications }
  };
}

function normalizedSources(sources: string[]): string[] {
  return Array.from(new Set(sources.map((source) => source.trim().toLowerCase()).filter(Boolean)));
}

export function createGuidedSettingsDraft(config: GuidedSettingsConfig): GuidedSettingsDraft {
  return {
    budget: { ...config.budgetSettings },
    display: {
      ...config.statusBarVisibility,
      budgetPeriod: config.statusBarBudgetPeriod,
      defaultRange: config.costCenterDefaults?.range ?? RECOMMENDED_GUIDED_SETTINGS.display.defaultRange,
      compareByDefault: config.costCenterDefaults?.compare ?? RECOMMENDED_GUIDED_SETTINGS.display.compareByDefault
    },
    dataSources: {
      logRoots: [...(config.rawLogRoots ?? config.logRoots)],
      include: normalizedSources(config.sessionSources)
    },
    notifications: {
      enabled: config.budgetNotificationsEnabled,
      everyAmount: config.budgetNotificationEveryAmount,
      thresholdSummary: config.budgetNotificationThresholdSummary ?? RECOMMENDED_GUIDED_SETTINGS.notifications.thresholdSummary
    }
  };
}

export function validateGuidedSettings(draft: GuidedSettingsDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const amounts: Array<keyof GuidedSettingsDraft['budget']> = ['dayAmount', 'weekAmount', 'monthAmount'];

  for (const amount of amounts) {
    if (!Number.isFinite(draft.budget[amount]) || draft.budget[amount] < 0) {
      errors[`budget.${amount}`] = 'Enter zero or a positive USD amount.';
    }
  }
  if (!Number.isFinite(draft.budget.warningPercent) || draft.budget.warningPercent < 0 || draft.budget.warningPercent > 100) {
    errors['budget.warningPercent'] = 'Enter a percentage from 0 to 100.';
  }
  if (!Number.isFinite(draft.notifications.everyAmount) || draft.notifications.everyAmount < 0) {
    errors['notifications.everyAmount'] = 'Enter zero or a positive USD amount.';
  }
  if (!draft.dataSources.logRoots.some((root) => root.trim())) {
    errors['dataSources.logRoots'] = 'Enter at least one log root.';
  }
  if (!['today', '7d', '30d'].includes(draft.display.defaultRange)) {
    errors['display.defaultRange'] = 'Choose today, 7d, or 30d.';
  }

  return errors;
}

export function resetSettingsGroup(draft: GuidedSettingsDraft, group: GuidedSettingsGroup): GuidedSettingsDraft {
  const reset = cloneDraft(draft);

  if (group === 'dataSources') {
    reset.dataSources = {
      logRoots: [...RECOMMENDED_GUIDED_SETTINGS.dataSources.logRoots],
      include: [...RECOMMENDED_GUIDED_SETTINGS.dataSources.include]
    };
  } else {
    Object.assign(reset[group], RECOMMENDED_GUIDED_SETTINGS[group]);
  }

  return reset;
}

export function settingsUpdates(config: GuidedSettingsConfig, draft: GuidedSettingsDraft): GuidedSettingsUpdate[] {
  const current = createGuidedSettingsDraft(config);
  const fields: Array<[GuidedSettingField, boolean | number | string | string[], boolean | number | string | string[]]> = [
    ['budget.dayAmount', current.budget.dayAmount, draft.budget.dayAmount],
    ['budget.weekAmount', current.budget.weekAmount, draft.budget.weekAmount],
    ['budget.monthAmount', current.budget.monthAmount, draft.budget.monthAmount],
    ['budget.warningPercent', current.budget.warningPercent, draft.budget.warningPercent],
    ['display.showSession', current.display.showSession, draft.display.showSession],
    ['display.showWorkspace', current.display.showWorkspace, draft.display.showWorkspace],
    ['display.showBudget', current.display.showBudget, draft.display.showBudget],
    ['display.budgetPeriod', current.display.budgetPeriod, draft.display.budgetPeriod],
    ['display.defaultRange', current.display.defaultRange, draft.display.defaultRange],
    ['display.compareByDefault', current.display.compareByDefault, draft.display.compareByDefault],
    ['dataSources.logRoots', current.dataSources.logRoots, draft.dataSources.logRoots],
    ['dataSources.include', current.dataSources.include, draft.dataSources.include],
    ['notifications.enabled', current.notifications.enabled, draft.notifications.enabled],
    ['notifications.everyAmount', current.notifications.everyAmount, draft.notifications.everyAmount],
    ['notifications.thresholdSummary', current.notifications.thresholdSummary, draft.notifications.thresholdSummary]
  ];

  return fields
    .filter(([, before, after]) => JSON.stringify(before) !== JSON.stringify(after))
    .map(([key, , value]) => ({ key, value }));
}
