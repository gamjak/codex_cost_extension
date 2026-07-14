import * as path from 'node:path';

import { createBudgetWindow, resolveFilterStartDate } from './timeWindows';
import { addTokenUsage, buildSessionUsageDeltas, emptyTokenUsage } from './usageTimeline';
import { matchesWorkspaceRoots } from './workspaceMatcher';
import type {
  BudgetPeriod,
  BudgetSettings,
  BudgetStatus,
  ModelPricing,
  ModelReportItem,
  ParsedSession,
  PricingByModel,
  SessionReportItem,
  SummaryReportItem,
  TokenUsageSnapshot,
  UsageReport,
  ViewScope
} from './types';

export interface BuildUsageReportOptions {
  scope: ViewScope;
  workspaceRoots: readonly string[];
  sessionSources?: readonly string[];
  filterStartDateInput?: string;
  budgetSettings: BudgetSettings;
  budgetPeriod: BudgetPeriod;
  now?: Date;
}

interface SessionAccumulator {
  sessionId: string;
  cwd?: string;
  model?: string;
  updatedAt: string;
  tokens: TokenUsageSnapshot;
  estimatedCost?: number;
  hasPricing: boolean;
}

interface ModelAccumulator {
  model: string;
  tokens: TokenUsageSnapshot;
  sessionIds: Set<string>;
  estimatedCost?: number;
  hasPricing: boolean;
}

interface CostAccumulator {
  estimatedCost?: number;
  hasPricing: boolean;
}

function getSessionLabel(cwd: string | undefined, sessionId: string): string {
  if (!cwd) {
    return sessionId;
  }

  return path.basename(cwd) || cwd;
}

function getSessionKey(session: ParsedSession): string {
  return `${path.resolve(session.filePath)}::${session.sessionId}`;
}

function normalizedSessionSource(session: ParsedSession): string {
  const source = session.source ?? session.originator ?? 'unknown';
  const normalized = source.toLowerCase();
  if (normalized.includes('vscode')) return 'vscode';
  if (normalized.includes('cli')) return 'cli';
  if (normalized.includes('desktop')) return 'desktop';
  return normalized || 'unknown';
}

export function resolveModelPricing(model: string | undefined, pricingByModel: PricingByModel): ModelPricing | undefined {
  if (!model) {
    return undefined;
  }

  const normalizedModel = model.trim().toLowerCase();

  if (pricingByModel[normalizedModel]) {
    return pricingByModel[normalizedModel];
  }

  const matchingFamily = Object.keys(pricingByModel)
    .filter((candidate) => normalizedModel.startsWith(`${candidate}-`))
    .sort((left, right) => right.length - left.length)[0];

  return matchingFamily ? pricingByModel[matchingFamily] : undefined;
}

function estimateCost(snapshot: TokenUsageSnapshot, pricing: ModelPricing | undefined): number | undefined {
  if (!pricing) {
    return undefined;
  }

  const nonCachedInputTokens = Math.max(snapshot.inputTokens - snapshot.cachedInputTokens, 0);

  return (nonCachedInputTokens / 1_000_000) * pricing.inputPer1M +
    (snapshot.cachedInputTokens / 1_000_000) * pricing.cachedInputPer1M +
    (snapshot.outputTokens / 1_000_000) * pricing.outputPer1M;
}

function updateCostAccumulator(
  accumulator: CostAccumulator,
  tokens: TokenUsageSnapshot,
  pricing: ModelPricing | undefined,
  hasKnownModel: boolean
): void {
  const deltaCost = estimateCost(tokens, pricing);

  if (deltaCost !== undefined) {
    accumulator.estimatedCost = (accumulator.estimatedCost ?? 0) + deltaCost;
  }

  if (!hasKnownModel || !pricing) {
    accumulator.hasPricing = false;
  }
}

function buildSummary(items: SessionReportItem[]): SummaryReportItem {
  let hasPricedItem = false;
  const summary = items.reduce<SummaryReportItem>(
    (current, item) => {
      current.sessionsCount += 1;
      current.inputTokens += item.tokens.inputTokens;
      current.cachedInputTokens += item.tokens.cachedInputTokens;
      current.outputTokens += item.tokens.outputTokens;
      current.totalTokens += item.tokens.totalTokens;

      if (item.estimatedCost !== undefined) {
        current.estimatedCost = (current.estimatedCost ?? 0) + item.estimatedCost;
        hasPricedItem = true;
      }

      return current;
    },
    {
      sessionsCount: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0
    }
  );

  if (items.length === 0) {
    summary.estimatedCost = 0;
    return summary;
  }

  if (!hasPricedItem) {
    summary.estimatedCost = undefined;
  }

  return summary;
}

function buildModelItems(models: Map<string, ModelAccumulator>): ModelReportItem[] {
  return Array.from(models.values())
    .map((model) => ({
      model: model.model,
      inputTokens: model.tokens.inputTokens,
      cachedInputTokens: model.tokens.cachedInputTokens,
      outputTokens: model.tokens.outputTokens,
      totalTokens: model.tokens.totalTokens,
      sessionCount: model.sessionIds.size,
      estimatedCost: model.estimatedCost,
      hasPricing: model.hasPricing
    }))
    .sort((left, right) => right.totalTokens - left.totalTokens);
}

function budgetAmountForPeriod(period: BudgetPeriod, settings: BudgetSettings): number | undefined {
  const rawValue = period === 'day'
    ? settings.dayAmount
    : period === 'week'
      ? settings.weekAmount
      : settings.monthAmount;

  return rawValue > 0 ? rawValue : undefined;
}

function buildBudgetStatus(
  period: BudgetPeriod,
  settings: BudgetSettings,
  spentCost: number,
  hasPricedUsage: boolean,
  hasPricingGaps: boolean
): BudgetStatus {
  const budgetAmount = budgetAmountForPeriod(period, settings);
  const warningPercent = settings.warningPercent;
  const normalizedSpentCost = hasPricedUsage || !hasPricingGaps ? spentCost : undefined;

  if (!budgetAmount) {
    return {
      period,
      spentCost: normalizedSpentCost ?? 0,
      budgetAmount: undefined,
      warningPercent,
      hasEstimatedCostGaps: hasPricingGaps,
      state: 'none'
    };
  }

  if (normalizedSpentCost === undefined) {
    return {
      period,
      spentCost: undefined,
      budgetAmount,
      warningPercent,
      hasEstimatedCostGaps: hasPricingGaps,
      state: 'neutral'
    };
  }

  const utilization = budgetAmount === 0 ? 0 : normalizedSpentCost / budgetAmount;
  const state = utilization >= 1
    ? 'error'
    : utilization >= warningPercent / 100
      ? 'warning'
      : 'neutral';

  return {
    period,
    spentCost: normalizedSpentCost,
    budgetAmount,
    warningPercent,
    hasEstimatedCostGaps: hasPricingGaps,
    state
  };
}

function createSessionAccumulator(sessionId: string): SessionAccumulator {
  return {
    sessionId,
    tokens: emptyTokenUsage(),
    updatedAt: '',
    hasPricing: true
  };
}

function createModelAccumulator(model: string): ModelAccumulator {
  return {
    model,
    tokens: emptyTokenUsage(),
    sessionIds: new Set<string>(),
    hasPricing: true
  };
}

export function buildUsageReport(
  sessions: readonly ParsedSession[],
  pricingByModel: PricingByModel,
  options: BuildUsageReportOptions
): UsageReport {
  const warnings = new Set<string>();
  const filterResolution = resolveFilterStartDate(options.filterStartDateInput);
  if (filterResolution.warning) {
    warnings.add(filterResolution.warning);
  }

  const now = options.now ?? new Date();
  const filterStartAtMs = filterResolution.startAt?.getTime();
  const nowMs = now.getTime();
  const budgetWindow = createBudgetWindow(options.budgetPeriod, now);
  const budgetStartAtMs = budgetWindow.start.getTime();

  const sessionAccumulators = new Map<string, SessionAccumulator>();
  const modelAccumulators = new Map<string, ModelAccumulator>();
  let budgetSpentCost = 0;
  let budgetHasPricedUsage = false;
  let budgetHasPricingGaps = false;

  const allowedSources = new Set((options.sessionSources ?? []).map((source) => source.toLowerCase()));
  for (const session of sessions.filter((candidate) =>
    allowedSources.size === 0 || allowedSources.has(normalizedSessionSource(candidate)))) {
    const sessionKey = getSessionKey(session);
    for (const delta of buildSessionUsageDeltas(session)) {
      const deltaTimestampMs = new Date(delta.timestamp).getTime();
      if (!Number.isFinite(deltaTimestampMs) || deltaTimestampMs > nowMs) {
        continue;
      }

      const matchesScope = options.scope === 'all' || matchesWorkspaceRoots(delta.cwd, options.workspaceRoots);
      const matchesFilterWindow = (filterStartAtMs === undefined || deltaTimestampMs >= filterStartAtMs) && matchesScope;
      const matchesBudgetWindow = deltaTimestampMs >= budgetStartAtMs && matchesScope;
      const pricing = resolveModelPricing(delta.model, pricingByModel);

      if (matchesFilterWindow || matchesBudgetWindow) {
        if (!delta.model) {
          warnings.add(`Missing model for session: ${session.sessionId}`);
        } else if (!pricing) {
          warnings.add(`Missing pricing for model: ${delta.model}`);
        }
      }

      if (matchesFilterWindow) {
        const sessionAccumulator = sessionAccumulators.get(sessionKey) ?? createSessionAccumulator(session.sessionId);
        sessionAccumulator.tokens = addTokenUsage(sessionAccumulator.tokens, delta.tokens);
        sessionAccumulator.updatedAt = sessionAccumulator.updatedAt.localeCompare(delta.timestamp) >= 0
          ? sessionAccumulator.updatedAt
          : delta.timestamp;
        sessionAccumulator.cwd = delta.cwd ?? session.cwd;
        sessionAccumulator.model = delta.model ?? session.model;
        updateCostAccumulator(sessionAccumulator, delta.tokens, pricing, Boolean(delta.model));
        sessionAccumulators.set(sessionKey, sessionAccumulator);

        const modelKey = delta.model ?? 'unknown';
        const modelAccumulator = modelAccumulators.get(modelKey) ?? createModelAccumulator(modelKey);
        modelAccumulator.tokens = addTokenUsage(modelAccumulator.tokens, delta.tokens);
        modelAccumulator.sessionIds.add(sessionKey);
        updateCostAccumulator(modelAccumulator, delta.tokens, pricing, Boolean(delta.model));
        modelAccumulators.set(modelKey, modelAccumulator);
      }

      if (matchesBudgetWindow) {
        const deltaCost = estimateCost(delta.tokens, pricing);

        if (deltaCost !== undefined) {
          budgetSpentCost += deltaCost;
          budgetHasPricedUsage = true;
        } else if (delta.model) {
          budgetHasPricingGaps = true;
        } else {
          budgetHasPricingGaps = true;
        }
      }
    }
  }

  const sessionItems = Array.from(sessionAccumulators.values())
    .filter((session) => session.tokens.totalTokens > 0)
    .map<SessionReportItem>((session) => ({
      sessionId: session.sessionId,
      cwd: session.cwd,
      label: getSessionLabel(session.cwd, session.sessionId),
      model: session.model,
      updatedAt: session.updatedAt,
      tokens: session.tokens,
      estimatedCost: session.estimatedCost,
      hasPricing: session.hasPricing
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const summary = buildSummary(sessionItems);
  const models = buildModelItems(modelAccumulators);
  const budget = buildBudgetStatus(
    options.budgetPeriod,
    options.budgetSettings,
    budgetSpentCost,
    budgetHasPricedUsage,
    budgetHasPricingGaps
  );

  return {
    summary,
    models,
    sessions: sessionItems,
    warnings: Array.from(warnings).sort((left, right) => left.localeCompare(right)),
    hasEstimatedCostGaps: sessionItems.some((item) => !item.hasPricing),
    filter: filterResolution.filter,
    budget
  };
}
