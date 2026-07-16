import { resolveCostCenterRange } from './costCenterTimeRange';
import { buildSessionFacts, type SessionFact } from './sessionFacts';
import { estimateTokenCost, resolveModelPricing } from './sessionAggregator';
import { addTokenUsage, emptyTokenUsage, type SessionUsageDelta } from './usageTimeline';
import { matchesWorkspaceRoots } from './workspaceMatcher';
import type {
  BuildCostCenterReportInput,
  CostCenterChartPoint,
  CostCenterFilters,
  CostCenterModelRow,
  CostCenterProjectRow,
  CostCenterReport,
  CostCenterSessionRow,
  DateInterval
} from './costCenterTypes';
import type { BudgetPeriod, BudgetState, PricingByModel, TokenUsageSnapshot } from './types';

interface PricedDelta extends SessionUsageDelta { estimatedCost?: number; partial: boolean; }
interface FactDelta { fact: SessionFact; delta: PricedDelta; }
interface Aggregate { tokens: TokenUsageSnapshot; cost?: number; partial: boolean; sessions: Set<string>; projects: Set<string>; days: Set<string>; models: Map<string, number>; }

function pricedDelta(delta: SessionUsageDelta, pricing: PricingByModel): PricedDelta {
  const modelPricing = resolveModelPricing(delta.model, pricing);
  return { ...delta, estimatedCost: estimateTokenCost(delta.tokens, modelPricing), partial: !delta.model || !modelPricing };
}

function inInterval(timestamp: string, interval: DateInterval): boolean {
  const value = Date.parse(timestamp);
  return Number.isFinite(value) && value >= interval.start.getTime() && value < interval.endExclusive.getTime();
}

function localDay(timestamp: string): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function emptyAggregate(): Aggregate {
  return { tokens: emptyTokenUsage(), partial: false, sessions: new Set(), projects: new Set(), days: new Set(), models: new Map() };
}

function addAggregate(aggregate: Aggregate, entry: FactDelta): void {
  aggregate.tokens = addTokenUsage(aggregate.tokens, entry.delta.tokens);
  if (entry.delta.estimatedCost !== undefined) aggregate.cost = (aggregate.cost ?? 0) + entry.delta.estimatedCost;
  aggregate.partial ||= entry.delta.partial;
  aggregate.sessions.add(entry.fact.key);
  aggregate.projects.add(entry.fact.projectKey);
  aggregate.days.add(localDay(entry.delta.timestamp));
  if (entry.delta.model) aggregate.models.set(entry.delta.model, (aggregate.models.get(entry.delta.model) ?? 0) + (entry.delta.estimatedCost ?? 0));
}

function aggregate(entries: readonly FactDelta[]): Aggregate {
  const result = emptyAggregate();
  entries.forEach((entry) => addAggregate(result, entry));
  return result;
}

function percentageChange(current: number | undefined, previous: number | undefined): number | undefined {
  if (current === undefined || previous === undefined || previous === 0) return undefined;
  return (current - previous) / previous * 100;
}

function labelRange(filters: CostCenterFilters): string {
  if (filters.range.kind === 'custom') return `${filters.range.startDate}–${filters.range.endDate}`;
  return filters.range.kind === 'today' ? 'Today' : filters.range.kind === '7d' ? 'Last 7 days' : 'Last 30 days';
}

function allowedEntries(input: BuildCostCenterReportInput, interval: DateInterval, pointInterval?: DateInterval): FactDelta[] {
  const sources = new Set((input.sessionSources ?? []).map((source) => source.toLowerCase()));
  return buildSessionFacts(input.sessions, input.workspaceRoots).flatMap((fact) => {
    if (input.excludedProjects.has(fact.projectKey) ||
      (input.filters.scope === 'workspace' && !matchesWorkspaceRoots(fact.projectPath, input.workspaceRoots)) ||
      (sources.size > 0 && !sources.has(fact.source)) ||
      (input.filters.projectKey && fact.projectKey !== input.filters.projectKey)) return [];
    return fact.deltas
      .filter((delta) => inInterval(delta.timestamp, interval) &&
        (!input.filters.model || delta.model === input.filters.model) &&
        (!pointInterval || inInterval(delta.timestamp, pointInterval)))
      .map((delta) => ({ fact, delta: pricedDelta(delta, input.pricingByModel) }));
  });
}

function buildBuckets(interval: DateInterval, bucket: 'hour' | 'day'): DateInterval[] {
  const result: DateInterval[] = [];
  for (let start = new Date(interval.start); start < interval.endExclusive;) {
    const end = new Date(start);
    if (bucket === 'hour') end.setHours(end.getHours() + 1, 0, 0, 0);
    else end.setDate(end.getDate() + 1);
    const endExclusive = end > interval.endExclusive ? interval.endExclusive : end;
    result.push({ start: new Date(start), endExclusive });
    start = endExclusive;
  }
  return result;
}

function buildChart(range: ReturnType<typeof resolveCostCenterRange>, current: readonly FactDelta[], comparison: readonly FactDelta[]): CostCenterChartPoint[] {
  const buckets = buildBuckets(range.current, range.bucket);
  const comparisonBuckets = range.comparison ? buildBuckets(range.comparison, range.bucket) : [];
  return buckets.map((bucket) => {
    const comparisonBucket = comparisonBuckets[buckets.indexOf(bucket)];
    const currentAggregate = aggregate(current.filter((entry) => inInterval(entry.delta.timestamp, bucket)));
    const comparisonAggregate = comparisonBucket ? aggregate(comparison.filter((entry) => inInterval(entry.delta.timestamp, comparisonBucket))) : undefined;
    return { key: bucket.start.toISOString(), label: range.bucket === 'hour' ? `${bucket.start.getHours()}:00` : `${bucket.start.getMonth() + 1}/${bucket.start.getDate()}`, start: bucket.start.toISOString(), endExclusive: bucket.endExclusive.toISOString(), cost: currentAggregate.cost, comparisonCost: comparisonAggregate?.cost, tokens: currentAggregate.tokens.totalTokens, sessions: currentAggregate.sessions.size, partial: currentAggregate.partial };
  });
}

function sessionRows(entries: readonly FactDelta[], comparison: readonly FactDelta[], range: ReturnType<typeof resolveCostCenterRange>, total: number | undefined): CostCenterSessionRow[] {
  const groups = new Map<string, FactDelta[]>();
  entries.forEach((entry) => groups.set(entry.fact.key, [...(groups.get(entry.fact.key) ?? []), entry]));
  return Array.from(groups.values()).map((group) => {
    const value = aggregate(group); const fact = group[0].fact;
    const comparisonForSession = comparison.filter((entry) => entry.fact.key === fact.key);
    return { key: fact.key, sessionId: fact.sessionId, label: fact.label, projectKey: fact.projectKey, projectLabel: fact.projectLabel, projectPath: fact.projectPath, source: fact.source, startedAt: fact.startedAt, updatedAt: fact.updatedAt, durationMs: fact.durationMs, models: Array.from(new Set(group.flatMap((entry) => entry.delta.model ? [entry.delta.model] : []))), tokens: value.tokens, estimatedCost: value.cost, sharePercent: total && value.cost !== undefined ? value.cost / total * 100 : undefined, partial: value.partial, timeline: buildChart(range, group, comparisonForSession) };
  }).sort((left, right) => (right.estimatedCost ?? -1) - (left.estimatedCost ?? -1) || left.label.localeCompare(right.label));
}

function projectRows(entries: readonly FactDelta[], comparison: readonly FactDelta[], input: BuildCostCenterReportInput): CostCenterProjectRow[] {
  const currentGroups = new Map<string, FactDelta[]>(); const previousGroups = new Map<string, FactDelta[]>();
  entries.forEach((entry) => currentGroups.set(entry.fact.projectKey, [...(currentGroups.get(entry.fact.projectKey) ?? []), entry]));
  comparison.forEach((entry) => previousGroups.set(entry.fact.projectKey, [...(previousGroups.get(entry.fact.projectKey) ?? []), entry]));
  return Array.from(currentGroups.entries()).map(([key, group]) => { const value = aggregate(group); const fact = group[0].fact; const topModel = Array.from(value.models.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]; return { key, label: fact.projectLabel, path: fact.projectPath, estimatedCost: value.cost, comparisonPercent: percentageChange(value.cost, aggregate(previousGroups.get(key) ?? []).cost), sessionCount: value.sessions.size, activeDays: value.days.size, topModel, averageCostPerSession: value.cost !== undefined && value.sessions.size ? value.cost / value.sessions.size : undefined, partial: value.partial, pinned: input.pinnedProjects.has(key), excluded: false }; }).sort((left, right) => Number(right.pinned) - Number(left.pinned) || (right.estimatedCost ?? -1) - (left.estimatedCost ?? -1) || left.label.localeCompare(right.label));
}

function modelRows(entries: readonly FactDelta[], total: number | undefined, input: BuildCostCenterReportInput): CostCenterModelRow[] {
  const groups = new Map<string, FactDelta[]>(); entries.forEach((entry) => { const key = entry.delta.model ?? 'unknown'; groups.set(key, [...(groups.get(key) ?? []), entry]); });
  return Array.from(groups.entries()).map(([model, group]) => { const value = aggregate(group); const pricingState: CostCenterModelRow['pricingState'] = !resolveModelPricing(model === 'unknown' ? undefined : model, input.pricingByModel) ? 'missing' : input.customPricingModels.has(model) ? 'custom' : 'bundled'; return { model, estimatedCost: value.cost, tokens: value.tokens, sessionCount: value.sessions.size, projectCount: value.projects.size, averageCostPerSession: value.cost !== undefined && value.sessions.size ? value.cost / value.sessions.size : undefined, sharePercent: total && value.cost !== undefined ? value.cost / total * 100 : undefined, pricingState, partial: value.partial }; }).sort((left, right) => (right.estimatedCost ?? -1) - (left.estimatedCost ?? -1) || left.model.localeCompare(right.model));
}

function budget(input: BuildCostCenterReportInput, summary: Aggregate, range: ReturnType<typeof resolveCostCenterRange>): CostCenterReport['budget'] {
  const days = Math.ceil((range.current.endExclusive.getTime() - range.current.start.getTime()) / 86_400_000);
  const period: BudgetPeriod = input.filters.range.kind === 'today' ? 'day' : input.filters.range.kind === '7d' ? 'week' : days > 7 ? 'month' : 'week';
  const amount = period === 'day' ? input.budgetSettings.dayAmount : period === 'week' ? input.budgetSettings.weekAmount : input.budgetSettings.monthAmount;
  const configured = amount > 0 ? amount : undefined; const spent = summary.cost;
  const projected = input.filters.range.kind === 'today' && spent !== undefined ? spent * (24 * 60 * 60 * 1000) / Math.max(1, input.now.getTime() - range.current.start.getTime()) : undefined;
  const state: BudgetState = !configured || summary.partial ? 'none' : spent === undefined ? 'neutral' : spent >= configured ? 'error' : spent >= configured * input.budgetSettings.warningPercent / 100 ? 'warning' : 'neutral';
  return { period, amount: configured, spent, remaining: configured !== undefined && spent !== undefined ? configured - spent : undefined, projected, state, explanation: summary.partial ? 'Some usage has no pricing.' : configured ? 'Budget based on selected range.' : 'No budget configured.', partial: summary.partial };
}

export function buildCostCenterReport(input: BuildCostCenterReportInput): CostCenterReport {
  const range = resolveCostCenterRange(input.filters.range, input.now);
  const selectedPoint = input.filters.pointStart && input.filters.pointEndExclusive ? { start: new Date(input.filters.pointStart), endExclusive: new Date(input.filters.pointEndExclusive) } : undefined;
  const currentBuckets = buildBuckets(range.current, range.bucket);
  const selectedPointIndex = selectedPoint ? currentBuckets.findIndex((bucket) => bucket.start.getTime() === selectedPoint.start.getTime() && bucket.endExclusive.getTime() === selectedPoint.endExclusive.getTime()) : -1;
  const comparisonPoint = range.comparison && selectedPointIndex >= 0 ? buildBuckets(range.comparison, range.bucket)[selectedPointIndex] : undefined;
  const current = allowedEntries(input, range.current, selectedPoint); const comparison = range.comparison ? allowedEntries(input, range.comparison, comparisonPoint) : [];
  const summaryAggregate = aggregate(current); const comparisonAggregate = aggregate(comparison); const chart = buildChart(range, current, comparison); const sessions = sessionRows(current, comparison, range, summaryAggregate.cost); const projects = projectRows(current, comparison, input); const models = modelRows(current, summaryAggregate.cost, input);
  const hasDrillDown = Boolean(input.filters.projectKey || input.filters.model || input.filters.pointStart || input.filters.pointEndExclusive);
  const emptyState = input.sessions.length === 0 ? { kind: 'no-logs' as const, message: 'No session logs found.', action: 'open-settings' as const } : current.length === 0 ? hasDrillDown ? { kind: 'filtered-out' as const, message: 'No usage matches these filters.', action: 'clear-filters' as const } : { kind: 'no-period-data' as const, message: 'No usage in this period.', action: 'clear-filters' as const } : undefined;
  const driver = <T extends { estimatedCost?: number; label?: string; model?: string; key?: string; sharePercent?: number; comparisonPercent?: number }>(rows: T[]) => rows.find((row) => row.estimatedCost !== undefined);
  const sessionDriver = driver(sessions); const projectDriver = driver(projects); const modelDriver = driver(models);
  const sessionComparison = sessionDriver ? aggregate(comparison.filter((entry) => entry.fact.key === sessionDriver.key)).cost : undefined;
  const modelComparison = modelDriver ? aggregate(comparison.filter((entry) => entry.delta.model === modelDriver.model)).cost : undefined;
  return { filters: input.filters, rangeLabel: labelRange(input.filters), summary: { cost: { value: summaryAggregate.cost, partial: summaryAggregate.partial, comparisonPercent: percentageChange(summaryAggregate.cost, comparisonAggregate.cost) }, totalTokens: summaryAggregate.tokens.totalTokens, activeDays: summaryAggregate.days.size, averageCostPerActiveDay: summaryAggregate.cost !== undefined && summaryAggregate.days.size ? summaryAggregate.cost / summaryAggregate.days.size : undefined, sessionCount: summaryAggregate.sessions.size }, budget: budget(input, summaryAggregate, range), chart, drivers: { session: sessionDriver && { key: sessionDriver.key, label: sessionDriver.label, cost: sessionDriver.estimatedCost, sharePercent: sessionDriver.sharePercent, comparisonPercent: percentageChange(sessionDriver.estimatedCost, sessionComparison) }, project: projectDriver && { key: projectDriver.key, label: projectDriver.label, cost: projectDriver.estimatedCost, sharePercent: undefined, comparisonPercent: projectDriver.comparisonPercent }, model: modelDriver && { key: modelDriver.model, label: modelDriver.model, cost: modelDriver.estimatedCost, sharePercent: modelDriver.sharePercent, comparisonPercent: percentageChange(modelDriver.estimatedCost, modelComparison) } }, sessions, projects, models, warnings: [...input.repositoryWarnings].sort((a, b) => a.localeCompare(b)), emptyState };
}
