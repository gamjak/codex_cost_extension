export type ViewScope = 'workspace' | 'all';
export type BudgetPeriod = 'day' | 'week' | 'month';
export type BudgetState = 'none' | 'neutral' | 'warning' | 'error';
export type FilterState = 'off' | 'active' | 'invalid';

export interface TokenUsageSnapshot {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface SessionUsageSnapshot {
  timestamp: string;
  tokens: TokenUsageSnapshot;
  cwd?: string;
  model?: string;
}

export interface ParsedSession {
  sessionId: string;
  filePath: string;
  updatedAt: string;
  source?: string;
  originator?: string;
  cwd?: string;
  model?: string;
  usage?: TokenUsageSnapshot;
  usageHistory: SessionUsageSnapshot[];
}

export interface ModelPricing {
  inputPer1M: number;
  cachedInputPer1M: number;
  outputPer1M: number;
}

export type PricingByModel = Record<string, ModelPricing>;

export interface SessionReportItem {
  sessionId: string;
  cwd?: string;
  label: string;
  model?: string;
  updatedAt: string;
  tokens: TokenUsageSnapshot;
  estimatedCost?: number;
  hasPricing: boolean;
}

export interface ModelReportItem {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  sessionCount: number;
  estimatedCost?: number;
  hasPricing: boolean;
}

export interface SummaryReportItem {
  sessionsCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost?: number;
}

export interface FilterStatus {
  state: FilterState;
  rawStartDate?: string;
  appliedStartDate?: string;
}

export interface BudgetStatus {
  period: BudgetPeriod;
  spentCost?: number;
  budgetAmount?: number;
  warningPercent: number;
  hasEstimatedCostGaps: boolean;
  state: BudgetState;
}

export interface BudgetSettings {
  dayAmount: number;
  weekAmount: number;
  monthAmount: number;
  warningPercent: number;
}

export interface StatusBarVisibility {
  showSession: boolean;
  showWorkspace: boolean;
  showBudget: boolean;
}

export interface UsageReport {
  summary: SummaryReportItem;
  models: ModelReportItem[];
  sessions: SessionReportItem[];
  warnings: string[];
  hasEstimatedCostGaps: boolean;
  filter: FilterStatus;
  budget: BudgetStatus;
}

export interface DailyCostPoint {
  date: string;
  estimatedCost?: number;
  hasEstimatedCostGaps: boolean;
}

export interface CostControlReport {
  today: UsageReport;
  remainingCost?: number;
  projectedCost?: number;
  daily: readonly DailyCostPoint[];
}
