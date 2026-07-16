import { describe, expect, it } from 'vitest';

import { buildCostCenterHtml } from '../../src/view/costCenterPresentation';

describe('buildCostCenterHtml', () => {
  it('renders the accessible overview shell while escaping unsafe labels and paths', () => {
    const projectPath = 'C:\\unsafe\\<script>alert(1)</script>';
    const html = buildCostCenterHtml({
      report: {
        filters: { scope: 'workspace', range: { kind: '7d', compare: true }, section: 'overview' },
        rangeLabel: 'Last 7 days',
        summary: {
          cost: { value: 12.5, partial: false, comparisonPercent: 10 },
          totalTokens: 1234,
          activeDays: 2,
          averageCostPerActiveDay: 6.25,
          sessionCount: 1
        },
        budget: { period: 'week', amount: 50, spent: 12.5, remaining: 37.5, projected: undefined, state: 'neutral', explanation: 'Budget based on selected range.', partial: false },
        chart: [{ key: '2026-07-16', label: '<script>alert(1)</script>', start: '2026-07-16T00:00:00.000Z', endExclusive: '2026-07-17T00:00:00.000Z', cost: 12.5, comparisonCost: 10, tokens: 1234, sessions: 1, partial: false }],
        drivers: { session: { key: 'one', label: '<script>alert(1)</script>', cost: 12.5 }, project: { key: 'project', label: '<script>alert(1)</script>', cost: 12.5 }, model: { key: 'gpt-test', label: '<script>alert(1)</script>', cost: 12.5 } },
        sessions: [{ key: 'one', sessionId: 'one', label: 'Unsafe session', projectKey: 'project', projectLabel: 'Unsafe project', projectPath, source: 'cli', startedAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T01:00:00.000Z', durationMs: 3600000, models: ['gpt-test'], tokens: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, totalTokens: 2 }, estimatedCost: 12.5, partial: false, timeline: [] }],
        projects: [],
        models: [],
        warnings: []
      },
      uiState: {
        filters: { scope: 'workspace', range: { kind: '7d', compare: true }, section: 'overview' },
        search: '',
        sort: {
          sessions: { column: 'estimatedCost', direction: 'desc' },
          projects: { column: 'estimatedCost', direction: 'desc' },
          models: { column: 'estimatedCost', direction: 'desc' }
        }
      }
    }, 'safe-nonce');

    expect(html).toContain('<h1>Codex Cost Center</h1>');
    expect(html).toContain('aria-label="Cost Center controls"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-testid="cost-trend-chart"');
    expect(html).toContain('<desc>');
    expect(html).toContain('nonce="safe-nonce"');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain(projectPath);
  });
});
