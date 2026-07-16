import { describe, expect, it } from 'vitest';

import { buildCostCenterSummaryText } from '../../src/view/costCenterSummary';
import type { CostCenterReport } from '../../src/domain/costCenterTypes';

describe('buildCostCenterSummaryText', () => {
  it('uses the selected Cost Center report and excludes local paths and content', () => {
    const report = {
      filters: { scope: 'all', range: { kind: '30d', compare: true }, section: 'projects', projectKey: 'c:\\secret\\repo' },
      rangeLabel: 'Last 30 days',
      summary: { cost: { value: 12.5, partial: false, comparisonPercent: 20 }, totalTokens: 1234, activeDays: 3, averageCostPerActiveDay: 4.16, sessionCount: 2 },
      budget: { period: 'month', state: 'neutral', explanation: 'On track', partial: false },
      chart: [], drivers: { session: { key: 'one', label: 'C:\\secret\\session', cost: 10 }, project: { key: 'c:\\secret\\repo', label: 'Safe repo', cost: 9, sharePercent: 72 } },
      sessions: [{ projectPath: 'c:\\secret\\repo', label: 'prompt: reveal me' }], projects: [], models: [], warnings: []
    } as unknown as CostCenterReport;
    const text = buildCostCenterSummaryText(report);
    expect(text).toContain('Last 30 days');
    expect(text).toContain('Safe repo');
    expect(text).toContain('1,234 tokens');
    expect(text).not.toContain('c:\\secret');
    expect(text).toContain('Top session: session');
    expect(text).not.toContain('reveal me');
    expect(text).not.toMatch(/prompt|response/i);
  });
});
