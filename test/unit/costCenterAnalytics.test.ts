process.env.TZ = 'UTC';

import { describe, expect, it } from 'vitest';

import { buildCostCenterReport } from '../../src/domain/costCenterAnalytics';
import type { BuildCostCenterReportInput, CostCenterReport } from '../../src/domain/costCenterTypes';
import type { ParsedSession, PricingByModel } from '../../src/domain/types';

const pricing: PricingByModel = {
  'gpt-5.4': { inputPer1M: 10, cachedInputPer1M: 1, outputPer1M: 20 },
  'gpt-5.4-mini': { inputPer1M: 2, cachedInputPer1M: 0.2, outputPer1M: 4 }
};

const sessions: ParsedSession[] = [
  {
    sessionId: 'one-main', filePath: 'one-main.jsonl', cwd: 'C:\\repo\\one', source: 'vscode',
    startedAt: '2026-07-15T09:00:00.000Z', updatedAt: '2026-07-16T10:00:00.000Z', usageHistory: [
      { timestamp: '2026-07-15T10:00:00.000Z', cwd: 'C:\\repo\\one', model: 'gpt-5.4', tokens: { inputTokens: 1_000, cachedInputTokens: 100, outputTokens: 500, totalTokens: 1_500 } },
      { timestamp: '2026-07-16T10:00:00.000Z', cwd: 'C:\\repo\\one', model: 'gpt-5.4-mini', tokens: { inputTokens: 2_000, cachedInputTokens: 200, outputTokens: 1_000, totalTokens: 3_000 } }
    ]
  },
  {
    sessionId: 'one-extra', filePath: 'one-extra.jsonl', cwd: 'C:\\repo\\one', source: 'cli',
    startedAt: '2026-07-16T09:00:00.000Z', updatedAt: '2026-07-16T11:00:00.000Z', usageHistory: [
      { timestamp: '2026-07-16T11:00:00.000Z', cwd: 'C:\\repo\\one', model: 'gpt-5.4', tokens: { inputTokens: 3_000, cachedInputTokens: 300, outputTokens: 1_500, totalTokens: 4_500 } }
    ]
  },
  {
    sessionId: 'two-main', filePath: 'two-main.jsonl', cwd: 'C:\\repo\\two', source: 'desktop',
    startedAt: '2026-07-16T08:00:00.000Z', updatedAt: '2026-07-16T12:00:00.000Z', usageHistory: [
      { timestamp: '2026-07-16T12:00:00.000Z', cwd: 'C:\\repo\\two', model: 'gpt-5.4-mini', tokens: { inputTokens: 500, cachedInputTokens: 50, outputTokens: 250, totalTokens: 750 } }
    ]
  }
];

const baseInput: BuildCostCenterReportInput = {
  sessions, filesCount: 3, repositoryWarnings: [], workspaceRoots: ['C:\\repo\\one'], pricingByModel: pricing,
  customPricingModels: new Set(['gpt-5.4-mini']), sessionSources: [],
  filters: { scope: 'all', range: { kind: '7d', compare: true }, section: 'overview' },
  budgetSettings: { dayAmount: 10, weekAmount: 50, monthAmount: 150, warningPercent: 80 },
  pinnedProjects: new Set(), excludedProjects: new Set(), now: new Date('2026-07-16T12:00:00.000Z')
};

function buildReport(overrides: Partial<BuildCostCenterReportInput> = {}): CostCenterReport {
  return buildCostCenterReport({ ...baseInput, ...overrides, filters: overrides.filters ?? baseInput.filters });
}

describe('buildCostCenterReport', () => {
  it('aggregates projects, models, sessions, chart, and drivers', () => {
    const report = buildReport();
    expect(report.projects.map((row) => row.label)).toEqual(['one', 'two']);
    expect(report.models[0]).toMatchObject({ model: 'gpt-5.4', pricingState: 'bundled' });
    expect(report.sessions[0]?.sharePercent).toBeGreaterThan(0);
    expect(report.chart).toHaveLength(7);
    expect(report.drivers.project?.label).toBe('one');
  });

  it('keeps tokens and marks money partial when pricing is missing', () => {
    const report = buildReport({ pricingByModel: {} });
    expect(report.summary.totalTokens).toBeGreaterThan(0);
    expect(report.summary.cost).toMatchObject({ value: undefined, partial: true });
    expect(report.sessions[0]).toMatchObject({ partial: true });
  });

  it('intersects project and model drill-down filters', () => {
    const report = buildReport({ filters: { scope: 'all', range: { kind: '7d', compare: false }, section: 'sessions', projectKey: 'c:\\repo\\one', model: 'gpt-5.4-mini' } });
    expect(report.sessions.every((row) => row.projectKey === 'c:\\repo\\one' && row.models.includes('gpt-5.4-mini'))).toBe(true);
  });

  it('excludes projects from totals and sorts pinned projects first', () => {
    const report = buildReport({ pinnedProjects: new Set(['c:\\repo\\two']), excludedProjects: new Set(['c:\\repo\\one']) });
    expect(report.projects[0]?.key).toBe('c:\\repo\\two');
    expect(report.projects.some((row) => row.key === 'c:\\repo\\one')).toBe(false);
  });

  it.each([
    [[], undefined, 'no-logs'],
    [sessions, { kind: 'custom', startDate: '01.01.2000', endDate: '02.01.2000', compare: false }, 'no-period-data']
  ] as const)('returns a specific empty state', (inputSessions, range, kind) => {
    const report = buildReport({ sessions: inputSessions, filters: range ? { scope: 'all', range, section: 'overview' } : undefined });
    expect(report.emptyState?.kind).toBe(kind);
  });

  it('uses hourly Today buckets and an equivalent elapsed comparison', () => {
    const report = buildReport({ filters: { scope: 'all', range: { kind: 'today', compare: true }, section: 'overview' }, now: new Date('2026-07-16T12:30:00.000Z') });
    expect(report.chart.every((point) => point.start.includes('T'))).toBe(true);
    expect(report.chart.some((point) => point.comparisonCost !== undefined)).toBe(true);
  });

  it('restricts workspace scope to the configured root', () => {
    const report = buildReport({ filters: { scope: 'workspace', range: { kind: '7d', compare: false }, section: 'overview' } });
    expect(report.sessions.every((row) => row.projectKey === 'c:\\repo\\one')).toBe(true);
  });
});
