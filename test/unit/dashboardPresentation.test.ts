import { describe, expect, it } from 'vitest';

import type { CostControlReport } from '../../src/domain/types';
import { buildDashboardHtml } from '../../src/view/dashboardPresentation';

const controlWithUnsafeLabel: CostControlReport = {
  today: {
    summary: {
      sessionsCount: 1,
      inputTokens: 500_000,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 500_000,
      estimatedCost: 0.5
    },
    models: [{
      model: 'gpt-5.4',
      inputTokens: 500_000,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 500_000,
      sessionCount: 1,
      estimatedCost: 0.5,
      hasPricing: true
    }],
    sessions: [{
      sessionId: 'session-1',
      updatedAt: '2026-06-05T12:00:00.000Z',
      label: '<script>alert(1)</script>',
      model: 'gpt-5.4',
      tokens: { inputTokens: 500_000, cachedInputTokens: 0, outputTokens: 0, totalTokens: 500_000 },
      estimatedCost: 0.5,
      hasPricing: true
    }],
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
  daily: [
    { date: '30.05.2026', estimatedCost: 0.1, hasEstimatedCostGaps: false },
    { date: '31.05.2026', estimatedCost: 0.2, hasEstimatedCostGaps: false },
    { date: '01.06.2026', estimatedCost: 0.3, hasEstimatedCostGaps: false },
    { date: '02.06.2026', estimatedCost: 0.4, hasEstimatedCostGaps: false },
    { date: '03.06.2026', estimatedCost: 0.5, hasEstimatedCostGaps: false },
    { date: '04.06.2026', estimatedCost: 0.6, hasEstimatedCostGaps: false },
    { date: '05.06.2026', estimatedCost: 0.5, hasEstimatedCostGaps: false }
  ]
};

describe('buildDashboardHtml', () => {
  it('renders today, seven daily points, model costs, and no raw HTML from session labels', () => {
    const html = buildDashboardHtml(controlWithUnsafeLabel, 'test-nonce');

    expect(html).toContain('Today');
    expect(html).toContain('gpt-5.4');
    expect(html).toContain('data-testid="seven-day-chart"');
    expect(html).toContain('aria-label="7 day estimated cost chart"');
    expect(html).toContain('nonce="test-nonce"');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
