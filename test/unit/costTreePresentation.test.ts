import { describe, expect, it } from 'vitest';

import { buildUsageTree, formatCostUsd, formatTokensDe } from '../../src/view/treePresentation';
import type { CostControlReport, UsageReport } from '../../src/domain/types';

const report: UsageReport = {
  summary: {
    sessionsCount: 9,
    inputTokens: 96_036_402,
    cachedInputTokens: 63_248_000,
    outputTokens: 682_576,
    totalTokens: 96_718_978,
    estimatedCost: 108.0216
  },
  models: [
    {
      model: 'gpt-5.4',
      inputTokens: 96_036_402,
      cachedInputTokens: 63_248_000,
      outputTokens: 682_576,
      totalTokens: 96_718_978,
      sessionCount: 9,
      estimatedCost: 108.0216,
      hasPricing: true
    }
  ],
  sessions: [
    {
      sessionId: 'session-1',
      label: 'Tools',
      model: 'gpt-5.4',
      updatedAt: '2026-06-01T09:00:00.000Z',
      cwd: 'C:\\Users\\gambjako\\Repositories\\codex_cost_extension',
      tokens: {
        inputTokens: 34_000,
        cachedInputTokens: 20_000,
        outputTokens: 313,
        totalTokens: 34_313
      },
      estimatedCost: 0.1299,
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

const control: CostControlReport = {
  today: {
    ...report,
    summary: { ...report.summary, estimatedCost: 0.5 },
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

describe('formatTokensDe', () => {
  it('formats token counts with German separators', () => {
    expect(formatTokensDe(96_718_978)).toBe('96.718.978');
  });
});

describe('formatCostUsd', () => {
  it('formats costs with German decimal separators and two decimals', () => {
    expect(formatCostUsd(108.0216)).toBe('108,02 $');
  });

  it('returns unavailable for missing costs', () => {
    expect(formatCostUsd(undefined)).toBe('Unavailable');
  });
});

describe('buildUsageTree', () => {
  it('shows filter and budget context above the summary while keeping the detailed sections', () => {
    const nodes = buildUsageTree('workspace', report, {
      autoRefreshSeconds: 60,
      lastRefreshAt: new Date('2026-06-01T09:30:00.000Z')
    }, control);

    expect(nodes[0]).toMatchObject({
      id: 'today',
      label: 'Today',
      description: '0,50 $/1,00 $ · On track',
      command: 'codexCost.openCostCenter',
      contextValue: 'codexCost.today'
    });

    expect(nodes[1]).toMatchObject({
      id: 'scope',
      label: 'Scope',
      description: 'Workspace'
    });

    expect(nodes[2]).toMatchObject({
      id: 'filter',
      label: 'Filter start',
      description: '01.06.2026'
    });
    expect(nodes[3]).toMatchObject({
      id: 'refresh',
      label: 'Refresh',
      description: 'Every 60s'
    });
    expect(nodes[3].tooltip).toContain('Manual refresh updates immediately');
    expect(nodes[3].tooltip).toContain('2026');

    expect(nodes[4]).toMatchObject({
      id: 'budget',
      label: 'Budget',
      description: 'Month 154,00 $/500,00 $'
    });

    expect(nodes[5]).toMatchObject({
      id: 'summary',
      label: 'Summary'
    });
    expect(nodes[5].children?.[0]).toMatchObject({
      id: 'summary-cost',
      label: 'Estimated cost',
      description: '108,02 $'
    });
    expect(nodes[5].children?.[1]).toMatchObject({
      id: 'summary-total',
      label: 'Total tokens',
      description: '96.718.978'
    });

    const modelSection = nodes.find((node) => node.id === 'models');
    expect(modelSection?.children?.[0]).toMatchObject({
      id: 'model-gpt-5.4',
      label: 'gpt-5.4',
      description: '108,02 $',
      collapsibleState: 'expanded'
    });

    const sessionSection = nodes.find((node) => node.id === 'sessions');
    expect(sessionSection?.children?.[0]).toMatchObject({
      id: 'session-session-1-0',
      label: 'Tools',
      description: '0,13 $',
      collapsibleState: 'none'
    });
    expect(sessionSection?.children?.[0].tooltip).toContain('Model: gpt-5.4');
    expect(sessionSection?.children?.[0].tooltip).toContain('Total tokens: 34.313');
  });

  it('marks approximate costs and invalid filter state clearly', () => {
    const nodes = buildUsageTree(
      'workspace',
      {
        ...report,
        warnings: ['Invalid filter start date: 99.99.2026. Expected DD.MM.YYYY.'],
        hasEstimatedCostGaps: true,
        filter: {
          state: 'invalid',
          rawStartDate: '99.99.2026'
        },
        budget: {
          ...report.budget,
          period: 'week',
          spentCost: 91,
          budgetAmount: 100,
          hasEstimatedCostGaps: true,
          state: 'warning'
        }
      },
      {
        autoRefreshSeconds: 0,
        lastRefreshAt: new Date('2026-06-01T09:30:00.000Z')
      },
      control
    );

    expect(nodes[2]).toMatchObject({
      id: 'filter',
      description: 'Ignored'
    });
    expect(nodes[3]).toMatchObject({
      id: 'refresh',
      description: 'Off'
    });
    expect(nodes[4]).toMatchObject({
      id: 'budget',
      description: 'Week ~91,00 $/100,00 $'
    });
    expect(nodes[5].children?.[0]).toMatchObject({
      id: 'summary-cost',
      description: '~108,02 $'
    });

    const warningSection = nodes.find((node) => node.id === 'warnings');
    expect(warningSection?.children?.[0]).toMatchObject({
      label: 'Invalid filter start date: 99.99.2026. Expected DD.MM.YYYY.'
    });
  });
});
