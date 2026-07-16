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
