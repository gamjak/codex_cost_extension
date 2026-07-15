import { describe, expect, it } from 'vitest';

import { buildUsageReport } from '../../src/domain/sessionAggregator';
import type { ParsedSession, PricingByModel, SessionUsageSnapshot } from '../../src/domain/types';

const workspaceRoot = 'C:\\Users\\gambjako\\Repositories\\codex_cost_extension';

const pricing: PricingByModel = {
  'gpt-5.4': {
    inputPer1M: 1,
    cachedInputPer1M: 0,
    outputPer1M: 0
  }
};

function snapshot(
  timestamp: string,
  inputTokens: number,
  cachedInputTokens: number,
  cwd: string,
  model = 'gpt-5.4'
): SessionUsageSnapshot {
  return {
    timestamp,
    cwd,
    model,
    tokens: {
      inputTokens,
      cachedInputTokens,
      outputTokens: 0,
      totalTokens: inputTokens
    }
  };
}

function createSession(
  sessionId: string,
  cwd: string,
  model: string | undefined,
  usageHistory: SessionUsageSnapshot[]
): ParsedSession {
  const latestSnapshot = usageHistory[usageHistory.length - 1];

  return {
    sessionId,
    filePath: `${sessionId}.jsonl`,
    updatedAt: latestSnapshot.timestamp,
    source: 'vscode',
    originator: 'codex_vscode',
    cwd,
    model,
    usage: latestSnapshot.tokens,
    usageHistory
  };
}

const sessions: ParsedSession[] = [
  createSession('workspace-filtered', workspaceRoot, 'gpt-5.4', [
    snapshot('2026-05-26T10:00:00.000Z', 1_000_000, 0, workspaceRoot),
    snapshot('2026-06-02T10:00:00.000Z', 2_000_000, 0, workspaceRoot)
  ]),
  createSession('all-other-workspace', 'C:\\Users\\gambjako\\Repositories\\other_repo', 'gpt-5.4', [
    snapshot('2026-06-03T10:00:00.000Z', 1_000_000, 0, 'C:\\Users\\gambjako\\Repositories\\other_repo')
  ]),
  createSession('workspace-unpriced', `${workspaceRoot}\\src`, 'unknown-model', [
    snapshot('2026-06-04T10:00:00.000Z', 600_000, 100_000, `${workspaceRoot}\\src`, 'unknown-model')
  ]),
  createSession('workspace-latest', `${workspaceRoot}\\docs`, 'gpt-5.4', [
    snapshot('2026-06-05T09:00:00.000Z', 500_000, 0, `${workspaceRoot}\\docs`)
  ])
];

describe('buildUsageReport', () => {
  it('filters usage by fixed start date and sorts sessions by the newest matching delta', () => {
    const report = buildUsageReport(sessions, pricing, {
      scope: 'workspace',
      workspaceRoots: [workspaceRoot],
      filterStartDateInput: '01.06.2026',
      budgetSettings: {
        dayAmount: 1,
        weekAmount: 3,
        monthAmount: 10,
        warningPercent: 80
      },
      budgetPeriod: 'month',
      now: new Date('2026-06-05T12:00:00.000Z')
    });

    expect(report.filter).toEqual({
      state: 'active',
      rawStartDate: '01.06.2026',
      appliedStartDate: '01.06.2026'
    });
    expect(report.summary.sessionsCount).toBe(3);
    expect(report.summary.inputTokens).toBe(2_100_000);
    expect(report.summary.cachedInputTokens).toBe(100_000);
    expect(report.summary.totalTokens).toBe(2_100_000);
    expect(report.summary.estimatedCost).toBeCloseTo(1.5);
    expect(report.hasEstimatedCostGaps).toBe(true);
    expect(report.sessions.map((session) => session.sessionId)).toEqual([
      'workspace-latest',
      'workspace-unpriced',
      'workspace-filtered'
    ]);
    expect(report.warnings).toContain('Missing pricing for model: unknown-model');
  });

  it('returns only deltas inside an explicit end boundary', () => {
    const afterEndSession = createSession('workspace-after-end', workspaceRoot, 'gpt-5.4', [
      snapshot('2026-06-06T00:00:00.000Z', 200_000, 0, workspaceRoot),
      snapshot('2026-06-06T01:00:00.000Z', 300_000, 0, workspaceRoot)
    ]);
    const report = buildUsageReport([...sessions, afterEndSession], pricing, {
      scope: 'workspace',
      workspaceRoots: [workspaceRoot],
      budgetSettings: {
        dayAmount: 1,
        weekAmount: 3,
        monthAmount: 10,
        warningPercent: 80
      },
      budgetPeriod: 'month',
      now: new Date('2026-06-06T12:00:00.000Z'),
      filterStartDateInput: '05.06.2026',
      filterEndAt: new Date('2026-06-06T00:00:00.000Z')
    });

    expect(report.summary.estimatedCost).toBeCloseTo(0.5);
  });

  it('ignores invalid filter dates and surfaces a warning instead of throwing', () => {
    const report = buildUsageReport(sessions, pricing, {
      scope: 'all',
      workspaceRoots: [workspaceRoot],
      filterStartDateInput: '32.13.2026',
      budgetSettings: {
        dayAmount: 0,
        weekAmount: 0,
        monthAmount: 0,
        warningPercent: 80
      },
      budgetPeriod: 'month',
      now: new Date('2026-06-05T12:00:00.000Z')
    });

    expect(report.filter).toEqual({
      state: 'invalid',
      rawStartDate: '32.13.2026'
    });
    expect(report.summary.sessionsCount).toBe(4);
    expect(report.summary.inputTokens).toBe(4_100_000);
    expect(report.warnings).toContain('Invalid filter start date: 32.13.2026. Expected DD.MM.YYYY.');
  });

  it('computes day, week, and month budgets from calendar windows independent of the fixed filter', () => {
    const baseOptions = {
      scope: 'workspace' as const,
      workspaceRoots: [workspaceRoot],
      filterStartDateInput: '04.06.2026',
      budgetSettings: {
        dayAmount: 1,
        weekAmount: 3,
        monthAmount: 2,
        warningPercent: 80
      },
      now: new Date('2026-06-05T12:00:00.000Z')
    };

    const dayReport = buildUsageReport(sessions, pricing, {
      ...baseOptions,
      budgetPeriod: 'day'
    });
    const weekReport = buildUsageReport(sessions, pricing, {
      ...baseOptions,
      budgetPeriod: 'week'
    });
    const monthReport = buildUsageReport(sessions, pricing, {
      ...baseOptions,
      budgetPeriod: 'month'
    });

    expect(dayReport.summary.inputTokens).toBe(1_100_000);
    expect(dayReport.budget).toMatchObject({
      period: 'day',
      spentCost: 0.5,
      budgetAmount: 1,
      state: 'neutral',
      hasEstimatedCostGaps: false
    });

    expect(weekReport.budget).toMatchObject({
      period: 'week',
      spentCost: 1.5,
      budgetAmount: 3,
      state: 'neutral',
      hasEstimatedCostGaps: true
    });

    expect(monthReport.budget).toMatchObject({
      period: 'month',
      spentCost: 1.5,
      budgetAmount: 2,
      state: 'neutral',
      hasEstimatedCostGaps: true
    });
  });

  it('applies budget totals to the active workspace scope', () => {
    const report = buildUsageReport(sessions, pricing, {
      scope: 'workspace',
      workspaceRoots: [workspaceRoot],
      budgetSettings: { dayAmount: 0, weekAmount: 0, monthAmount: 10, warningPercent: 80 },
      budgetPeriod: 'month',
      now: new Date('2026-06-05T12:00:00.000Z')
    });

    expect(report.budget.spentCost).toBeCloseTo(1.5);
  });

  it('includes non-VS Code sessions and resolves dated model variants by family', () => {
    const cliSession = {
      ...createSession('cli-session', workspaceRoot, 'gpt-5.4-2026-07-10', [
        snapshot('2026-06-05T10:00:00.000Z', 1_000_000, 0, workspaceRoot, 'gpt-5.4-2026-07-10')
      ]),
      source: 'cli',
      originator: 'codex_cli'
    };

    const report = buildUsageReport([cliSession], pricing, {
      scope: 'all',
      workspaceRoots: [],
      budgetSettings: { dayAmount: 0, weekAmount: 0, monthAmount: 10, warningPercent: 80 },
      budgetPeriod: 'month',
      now: new Date('2026-06-05T12:00:00.000Z')
    });

    expect(report.summary.sessionsCount).toBe(1);
    expect(report.summary.estimatedCost).toBeCloseTo(1);
    expect(report.warnings).not.toContain('Missing pricing for model: gpt-5.4-2026-07-10');
  });

  it('can restrict reports to normalized session sources', () => {
    const vscodeSession = sessions[0];
    const cliSession = {
      ...sessions[1],
      source: undefined,
      originator: 'codex_cli'
    };
    const report = buildUsageReport([vscodeSession, cliSession], pricing, {
      scope: 'all',
      workspaceRoots: [],
      sessionSources: ['cli'],
      budgetSettings: { dayAmount: 0, weekAmount: 0, monthAmount: 0, warningPercent: 80 },
      budgetPeriod: 'month',
      now: new Date('2026-06-05T12:00:00.000Z')
    });

    expect(report.summary.sessionsCount).toBe(1);
    expect(report.sessions[0]?.sessionId).toBe('all-other-workspace');
  });

  it('keeps duplicate session IDs from separate files separate', () => {
    const first = createSession('duplicate', workspaceRoot, 'gpt-5.4', [
      snapshot('2026-06-05T10:00:00.000Z', 100, 0, workspaceRoot)
    ]);
    const second = {
      ...first,
      filePath: 'different-file.jsonl',
      usageHistory: [snapshot('2026-06-05T11:00:00.000Z', 200, 0, workspaceRoot)]
    };
    const report = buildUsageReport([first, second], pricing, {
      scope: 'all',
      workspaceRoots: [],
      budgetSettings: { dayAmount: 0, weekAmount: 0, monthAmount: 0, warningPercent: 80 },
      budgetPeriod: 'month',
      now: new Date('2026-06-05T12:00:00.000Z')
    });

    expect(report.summary.sessionsCount).toBe(2);
    expect(report.models[0]?.sessionCount).toBe(2);
  });
});
