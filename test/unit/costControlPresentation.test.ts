import { describe, expect, it } from 'vitest';

import type { CostControlReport } from '../../src/domain/types';
import {
  buildCostControlQuickPickPlaceholder,
  buildCostControlText,
  buildCostSummaryText
} from '../../src/view/costControlPresentation';

const control: CostControlReport = {
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
    filter: { state: 'active', rawStartDate: '05.06.2026', appliedStartDate: '05.06.2026' },
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

describe('buildCostControlText', () => {
  it('labels an under-budget daily control as on track with a projection', () => {
    expect(buildCostControlText(control)).toMatchObject({
      label: 'On track',
      text: 'Today 0,50 $/1,00 $ · On track',
      tone: 'default',
      projectedText: 'Projected end of day: 1,00 $'
    });
  });

  it('keeps partial daily pricing visibly approximate', () => {
    expect(buildCostControlText({
      ...control,
      today: {
        ...control.today,
        hasEstimatedCostGaps: true,
        budget: { ...control.today.budget, spentCost: 0.5, hasEstimatedCostGaps: true, state: 'warning' }
      }
    })).toMatchObject({
      label: 'Watch',
      text: 'Today ~0,50 $/1,00 $ · Watch',
      tone: 'warning',
      projectedText: 'Projected end of day: ~1,00 $'
    });
  });
});

describe('buildCostSummaryText', () => {
  it('includes the local daily estimate, budget, remaining amount, and projection', () => {
    expect(buildCostSummaryText(control)).toBe([
      'Today 0,50 $/1,00 $ · On track',
      'Remaining: 0,50 $',
      'Projected end of day: 1,00 $',
      'Estimated local Codex cost; pricing may differ from billed usage.'
    ].join('\n'));
  });
});

describe('buildCostControlQuickPickPlaceholder', () => {
  it('surfaces the latest daily spend, budget, and state in the action picker', () => {
    expect(buildCostControlQuickPickPlaceholder(control)).toBe(
      'Today 0,50 $/1,00 $ · On track — choose an action'
    );
  });
});
