import { buildUsageReport, type BuildUsageReportOptions } from './sessionAggregator';
import { formatFixedDate } from './timeWindows';
import type { CostControlReport, DailyCostPoint, ParsedSession, PricingByModel, UsageReport } from './types';

function startOfLocalDay(value: Date): Date {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  return start;
}

function addLocalDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function buildDailyReport(
  sessions: readonly ParsedSession[],
  pricingByModel: PricingByModel,
  options: BuildUsageReportOptions,
  start: Date,
  end: Date
): UsageReport {
  return buildUsageReport(sessions, pricingByModel, {
    ...options,
    filterStartDateInput: formatFixedDate(start),
    filterEndAt: end
  });
}

export function buildCostControlReport(
  sessions: readonly ParsedSession[],
  pricingByModel: PricingByModel,
  options: BuildUsageReportOptions
): CostControlReport {
  const now = options.now ?? new Date();
  const todayStart = startOfLocalDay(now);
  const tomorrowStart = addLocalDays(todayStart, 1);
  const today = buildDailyReport(sessions, pricingByModel, { ...options, now, budgetPeriod: 'day' }, todayStart, tomorrowStart);
  const daily = Array.from({ length: 7 }, (_, index): DailyCostPoint => {
    const start = addLocalDays(todayStart, index - 6);
    const end = addLocalDays(start, 1);
    const report = buildDailyReport(sessions, pricingByModel, { ...options, now }, start, end);

    return {
      date: formatFixedDate(start),
      estimatedCost: report.summary.estimatedCost,
      hasEstimatedCostGaps: report.hasEstimatedCostGaps
    };
  });

  const elapsedMilliseconds = now.getTime() - todayStart.getTime();
  const totalDayMilliseconds = tomorrowStart.getTime() - todayStart.getTime();
  const spentCost = today.summary.estimatedCost;
  const projectedCost = spentCost !== undefined && spentCost !== 0 && elapsedMilliseconds > 0
    ? spentCost * totalDayMilliseconds / elapsedMilliseconds
    : undefined;
  const remainingCost = today.budget.budgetAmount !== undefined && today.budget.spentCost !== undefined
    ? today.budget.budgetAmount - today.budget.spentCost
    : undefined;

  return { today, remainingCost, projectedCost, daily };
}
