import type { ConfigurationRefreshController } from './configurationRefreshController';

export function saveDailyBudget(
  configurationRefresh: ConfigurationRefreshController,
  amount: number,
  update: (key: string, value: unknown) => Promise<void>
): Promise<void> {
  return configurationRefresh.applyGuidedSettings([{ key: 'budget.dayAmount', value: amount }], update);
}
