import type {
  BudgetPeriod,
  BudgetSettings,
  BudgetState,
  ParsedSession,
  PricingByModel,
  TokenUsageSnapshot,
  ViewScope
} from './types';

export type CostCenterSection = 'overview' | 'sessions' | 'projects' | 'models';
export type CostCenterPreset = 'today' | '7d' | '30d';

export type CostCenterRangeSelection =
  | { kind: CostCenterPreset; compare: boolean }
  | { kind: 'custom'; startDate: string; endDate: string; compare: boolean };

export interface DateInterval {
  start: Date;
  endExclusive: Date;
}

export interface ResolvedCostCenterRange {
  current: DateInterval;
  comparison?: DateInterval;
  bucket: 'hour' | 'day';
}

export interface CostCenterFilters {
  scope: ViewScope;
  range: CostCenterRangeSelection;
  section: CostCenterSection;
  projectKey?: string;
  model?: string;
  pointStart?: string;
  pointEndExclusive?: string;
}

export interface CostMetric {
  value?: number;
  partial: boolean;
  comparisonPercent?: number;
}

export interface CostCenterChartPoint {
  key: string;
  label: string;
  start: string;
  endExclusive: string;
  cost?: number;
  comparisonCost?: number;
  tokens: number;
  sessions: number;
  partial: boolean;
}

export interface CostCenterSessionRow {
  key: string;
  sessionId: string;
  label: string;
  projectKey: string;
  projectLabel: string;
  projectPath?: string;
  source: string;
  startedAt: string;
  updatedAt: string;
  durationMs: number;
  models: string[];
  tokens: TokenUsageSnapshot;
  estimatedCost?: number;
  sharePercent?: number;
  partial: boolean;
  timeline: CostCenterChartPoint[];
}

export interface CostCenterProjectRow {
  key: string;
  label: string;
  path?: string;
  estimatedCost?: number;
  comparisonPercent?: number;
  sessionCount: number;
  activeDays: number;
  topModel?: string;
  averageCostPerSession?: number;
  partial: boolean;
  pinned: boolean;
  excluded: boolean;
}

export interface CostCenterModelRow {
  model: string;
  estimatedCost?: number;
  tokens: TokenUsageSnapshot;
  sessionCount: number;
  projectCount: number;
  averageCostPerSession?: number;
  sharePercent?: number;
  pricingState: 'bundled' | 'custom' | 'missing';
  partial: boolean;
}

export interface CostCenterSummary {
  cost: CostMetric;
  totalTokens: number;
  activeDays: number;
  averageCostPerActiveDay?: number;
  sessionCount: number;
}

export interface CostCenterEmptyState {
  kind: 'no-logs' | 'no-period-data' | 'filtered-out';
  message: string;
  action?: 'open-settings' | 'clear-filters';
}

export interface CostCenterReport {
  filters: CostCenterFilters;
  rangeLabel: string;
  summary: CostCenterSummary;
  budget: {
    period: BudgetPeriod;
    amount?: number;
    spent?: number;
    remaining?: number;
    projected?: number;
    state: BudgetState;
    explanation: string;
    partial: boolean;
  };
  chart: CostCenterChartPoint[];
  drivers: {
    session?: { key: string; label: string; cost?: number; sharePercent?: number; comparisonPercent?: number };
    project?: { key: string; label: string; cost?: number; sharePercent?: number; comparisonPercent?: number };
    model?: { key: string; label: string; cost?: number; sharePercent?: number; comparisonPercent?: number };
  };
  sessions: CostCenterSessionRow[];
  projects: CostCenterProjectRow[];
  models: CostCenterModelRow[];
  warnings: string[];
  emptyState?: CostCenterEmptyState;
}

export interface BuildCostCenterReportInput {
  sessions: readonly ParsedSession[];
  filesCount: number;
  repositoryWarnings: readonly string[];
  workspaceRoots: readonly string[];
  pricingByModel: PricingByModel;
  customPricingModels: ReadonlySet<string>;
  sessionSources?: readonly string[];
  filters: CostCenterFilters;
  budgetSettings: BudgetSettings;
  pinnedProjects: ReadonlySet<string>;
  excludedProjects: ReadonlySet<string>;
  now: Date;
}
