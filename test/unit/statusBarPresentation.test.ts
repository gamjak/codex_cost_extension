import { describe, expect, it } from 'vitest';

import { buildStatusBarEntries } from '../../src/view/statusBarPresentation';
import type { UsageReport } from '../../src/domain/types';

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
    });

    expect(entries.session.visible).toBe(true);
    expect(entries.session.text).toBe('$(history) Latest 12,40 $');
    expect(entries.workspace.text).toBe('$(folder-opened) Workspace 154,00 $');
    expect(entries.budget.text).toBe('$(dashboard) Month 154,00 $/500,00 $');
    expect(entries.budget.tone).toBe('default');
    expect(entries.session.tooltip).toContain('Filter start: 01.06.2026');
    expect(entries.workspace.tooltip).toContain('Auto-refresh: every 60s');
    expect(entries.budget.tooltip).toContain('Warning threshold: 80%');
  });

  it('marks approximate budgets and warning states clearly', () => {
    const entries = buildStatusBarEntries(partialBudgetReport, {
      autoRefreshSeconds: 0,
      visibility: {
        showSession: true,
        showWorkspace: true,
        showBudget: true
      }
    });

    expect(entries.session.text).toBe('$(history) Latest n/a');
    expect(entries.workspace.text).toBe('$(folder-opened) Workspace ~91,00 $');
    expect(entries.budget.text).toBe('$(dashboard) Week ~91,00 $/100,00 $');
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
      }
    );

    expect(entries.session.visible).toBe(false);
    expect(entries.workspace.visible).toBe(true);
    expect(entries.workspace.text).toBe('$(folder-opened) Workspace n/a');
    expect(entries.budget.text).toBe('$(dashboard) Day no budget');
    expect(entries.budget.tone).toBe('default');
  });
});
