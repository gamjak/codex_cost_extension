import { describe, expect, it } from 'vitest';

import { buildCostCenterHtml, type CostCenterViewModel } from '../../src/view/costCenterPresentation';
import { buildCostCenterClientScript } from '../../src/view/costCenterClient';

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

  it('renders complete overview metrics, comparison series, drilldowns, and valid tab panels', () => {
    const html = buildCostCenterHtml(viewModel(), 'safe-nonce');

    expect(html).toContain('Budget used');
    expect(html).toContain('Budget remaining');
    expect(html).toContain('Average per active day');
    expect(html).toContain('Compared with previous period');
    expect(html).toContain('Budget reference: week');
    expect(html).toContain('class="chart-current"');
    expect(html).toContain('class="chart-comparison"');
    expect(html).toContain('data-action="drillProject"');
    expect(html).toContain('data-action="drillModel"');
    expect(html).toContain('data-action="toggleSession"');
    expect(html).toContain('12.5% of estimated cost');
    for (const section of ['overview', 'sessions', 'projects', 'models']) {
      expect(html).toContain(`aria-controls="panel-${section}"`);
      expect(html).toContain(`id="panel-${section}"`);
    }
  });

  it('posts host-compatible discriminated messages and supports arrow-key tabs', () => {
    const script = buildCostCenterClientScript();

    expect(script).toContain("post({ type: 'setScope', value: target.value })");
    expect(script).toContain("post({ type: 'setSection', value: target.dataset.value })");
    expect(script).toContain("post({ type: 'clearFilter', value: target.dataset.value })");
    expect(script).toContain("post({ type: 'filterChartPoint', pointStart: target.dataset.start, pointEndExclusive: target.dataset.endExclusive })");
    expect(script).toContain("event.key !== 'ArrowRight' && event.key !== 'ArrowLeft'");
  });

  it('keeps empty and partial-cost states textual and exposes chart details to assistive technology', () => {
    const model = viewModel();
    model.report.summary.cost.partial = true;
    model.report.budget.partial = true;
    model.report.emptyState = { kind: 'no-period-data', message: 'No usage in this period.', action: 'clear-filters' };
    const html = buildCostCenterHtml(model, 'safe-nonce');

    expect(html).toContain('No usage in this period.');
    expect(html).toContain('Cost estimate is partial because some usage has no price.');
    expect(html).toContain('aria-describedby="chart-detail-2026-07-16"');
    expect(html).toContain('Current period');
    expect(html).toContain('Previous period');
  });
});

function viewModel(): CostCenterViewModel {
  return {
    report: {
      filters: { scope: 'workspace' as const, range: { kind: '7d' as const, compare: true }, section: 'overview' as const },
      rangeLabel: 'Last 7 days',
      summary: { cost: { value: 12.5, partial: false, comparisonPercent: 25 }, totalTokens: 1234, activeDays: 2, averageCostPerActiveDay: 6.25, sessionCount: 1 },
      budget: { period: 'week' as const, amount: 50, spent: 12.5, remaining: 37.5, projected: undefined, state: 'neutral' as const, explanation: 'Budget based on selected range.', partial: false },
      chart: [{ key: '2026-07-16', label: 'Jul 16', start: '2026-07-16T00:00:00.000Z', endExclusive: '2026-07-17T00:00:00.000Z', cost: 12.5, comparisonCost: 10, tokens: 1234, sessions: 1, partial: false }],
      drivers: { session: { key: 'session-1', label: 'Session 1', cost: 12.5, sharePercent: 12.5 }, project: { key: 'project-1', label: 'Project 1', cost: 12.5, sharePercent: 12.5 }, model: { key: 'model-1', label: 'Model 1', cost: 12.5, sharePercent: 12.5 } },
      sessions: [], projects: [], models: [], warnings: []
    },
    uiState: {
      filters: { scope: 'workspace' as const, range: { kind: '7d' as const, compare: true }, section: 'overview' as const },
      search: '',
      sort: { sessions: { column: 'estimatedCost' as const, direction: 'desc' as const }, projects: { column: 'estimatedCost' as const, direction: 'desc' as const }, models: { column: 'estimatedCost' as const, direction: 'desc' as const } }
    }
  };
}
