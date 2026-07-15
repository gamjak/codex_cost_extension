import { describe, expect, it } from 'vitest';

import { buildStatusBarEntries } from '../../src/view/statusBarPresentation';
import type { CostControlReport, UsageReport } from '../../src/domain/types';

const dailyControl: CostControlReport = {
  today: {
    summary: {
      sessionsCount: 1,
      inputTokens: 500_000,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 500_000,
      estimatedCost: 0.5
    },
    models: [],
    sessions: [],
    warnings: [],
    hasEstimatedCostGaps: false,
    filter: { state: 'off' },
    budget: {
      period: 'day',
      spentCost: 0.5,
      budgetAmount: 1,
      warningPercent: 80,
      hasEstimatedCostGaps: false,
      state: 'neutral'
    }
  },
  remainingCost: 0.5,
  projectedCost: 1,
  daily: []
};

const pricedReport: UsageReport = {
  summary: {
    sessionsCount: 2,
    inputTokens: 3_100,
    cachedInputTokens: 800,
    outputTokens: 950,
    totalTokens: 4_050,
    estimatedCost: 154
  },
  models: [],
  sessions: [
    {
      sessionId: 'session-priced',
      label: 'Codex Cost',
      model: 'gpt-5.4',
      updatedAt: '2026-06-05T11:00:00.000Z',
      cwd: 'C:\\Users\\gambjako\\Repositories\\codex_cost_extension',
      tokens: {
        inputTokens: 2_500,
        cachedInputTokens: 700,
        outputTokens: 900,
        totalTokens: 3_400
      },
      estimatedCost: 12.4,
      hasPricing: true
    }
  ],
  warnings: [],
  hasEstimatedCostGaps: false,
  filter: {
    state: 'active',
    rawStartDate: '01.06.2026',
    appliedStartDate: '01.06.2026'
  },
  budget: {
    period: 'month',
    spentCost: 154,
    budgetAmount: 500,
    warningPercent: 80,
    hasEstimatedCostGaps: false,
    state: 'neutral'
  }
};

const partialBudgetReport: UsageReport = {
  ...pricedReport,
  summary: {
    ...pricedReport.summary,
    estimatedCost: 91
  },
  sessions: [
    {
      sessionId: 'session-unpriced',
      label: 'Codex Cost',
      model: 'unknown-model',
      updatedAt: '2026-06-05T12:00:00.000Z',
      cwd: 'C:\\Users\\gambjako\\Repositories\\codex_cost_extension\\src',
      tokens: {
        inputTokens: 600,
        cachedInputTokens: 100,
        outputTokens: 50,
        totalTokens: 650
      },
      estimatedCost: undefined,
      hasPricing: false
    }
  ],
  warnings: ['Missing pricing for model: unknown-model'],
  hasEstimatedCostGaps: true,
  budget: {
    period: 'week',
    spentCost: 91,
    budgetAmount: 100,
    warningPercent: 80,
    hasEstimatedCostGaps: true,
    state: 'warning'
  }
};

describe('buildStatusBarEntries', () => {
  it('builds session, workspace, and budget labels when visibility is enabled', () => {
    const entries = buildStatusBarEntries(pricedReport, {
      autoRefreshSeconds: 60,
      visibility: {
        showSession: true,
        showWorkspace: true,
        showBudget: true
      }
    }, dailyControl);

    expect(entries.session.visible).toBe(true);
    expect(entries.session.text).toBe('$(history) Latest 12,40 $');
    expect(entries.workspace.text).toBe('$(folder-opened) Workspace 154,00 $');
    expect(entries.budget.text).toBe('$(dashboard) Today 0,50 $/1,00 $ · On track');
    expect(entries.budget.tone).toBe('default');
    expect(entries.session.tooltip).toContain('Filter start: 01.06.2026');
    expect(entries.session.tooltip).toContain('Click to open Cost Dashboard.');
    expect(entries.workspace.tooltip).toContain('Auto-refresh: every 60s');
    expect(entries.workspace.tooltip).toContain('Click to open Cost Dashboard.');
    expect(entries.budget.tooltip).toContain('Projected end of day: 1,00 $');
    expect(entries.budget.tooltip).toContain('Click to open Cost Dashboard.');
    expect(entries.session.tooltip).not.toContain('Click to refresh now.');
    expect(entries.workspace.tooltip).not.toContain('Click to refresh now.');
    expect(entries.budget.tooltip).not.toContain('Click to refresh now.');
  });

  it('marks approximate budgets and warning states clearly', () => {
    const entries = buildStatusBarEntries(partialBudgetReport, {
      autoRefreshSeconds: 0,
      visibility: {
        showSession: true,
        showWorkspace: true,
        showBudget: true
      }
    }, {
      ...dailyControl,
      today: {
        ...dailyControl.today,
        hasEstimatedCostGaps: true,
        budget: { ...dailyControl.today.budget, hasEstimatedCostGaps: true, state: 'warning' }
      }
    });

    expect(entries.session.text).toBe('$(history) Latest n/a');
    expect(entries.workspace.text).toBe('$(folder-opened) Workspace ~91,00 $');
    expect(entries.budget.text).toBe('$(dashboard) Today ~0,50 $/1,00 $ · Watch');
    expect(entries.budget.tone).toBe('warning');
    expect(entries.budget.tooltip).toContain('Auto-refresh: off');
  });

  it('respects per-item visibility settings and shows no-budget states without colors', () => {
    const entries = buildStatusBarEntries(
      {
        ...pricedReport,
        sessions: [],
        summary: {
          ...pricedReport.summary,
          sessionsCount: 0,
          estimatedCost: 0
        },
        budget: {
          period: 'day',
          spentCost: 0,
          budgetAmount: undefined,
          warningPercent: 80,
          hasEstimatedCostGaps: false,
          state: 'none'
        }
      },
      {
        autoRefreshSeconds: 30,
        visibility: {
          showSession: false,
          showWorkspace: true,
          showBudget: true
        }
      },
      {
        ...dailyControl,
        today: {
          ...dailyControl.today,
          budget: { ...dailyControl.today.budget, budgetAmount: undefined, state: 'none' }
        },
        remainingCost: undefined
      }
    );

    expect(entries.session.visible).toBe(false);
    expect(entries.workspace.visible).toBe(true);
    expect(entries.workspace.text).toBe('$(folder-opened) Workspace n/a');
    expect(entries.budget.text).toBe('$(dashboard) Today 0,50 $ · Set daily budget');
    expect(entries.budget.tone).toBe('default');
  });
});
