import type { CostCenterChartPoint, CostCenterReport } from '../domain/costCenterTypes';

import { formatCostUsd, formatTokensDe } from './costDisplay';
import { escapeHtml } from './costCenterPresentation';

function formatPercent(value: number | undefined): string {
  return value === undefined ? 'No comparison' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatMetricCost(value: number | undefined, partial: boolean): string {
  return formatCostUsd(value, { approximate: partial, unavailableLabel: 'Unavailable' });
}

function chartDescription(points: readonly CostCenterChartPoint[]): string {
  return points.map((point) => `${point.label}: ${formatMetricCost(point.cost, point.partial)}${point.comparisonCost === undefined ? '' : `; comparison ${formatMetricCost(point.comparisonCost, false)}`}`).join('. ');
}

function buildChart(report: CostCenterReport): string {
  const maximum = Math.max(0, ...report.chart.flatMap((point) => [point.cost ?? 0, point.comparisonCost ?? 0]));
  const bars = report.chart.map((point, index) => {
    const height = maximum === 0 ? 2 : Math.max(2, Math.round((point.cost ?? 0) / maximum * 72));
    const x = 12 + index * 36;
    return `<rect x="${x}" y="${84 - height}" width="20" height="${height}" rx="2" class="chart-bar"><title>${escapeHtml(`${point.label}: ${formatMetricCost(point.cost, point.partial)}`)}</title></rect>`;
  }).join('');
  const buttons = report.chart.map((point) => `<button type="button" class="chart-point" data-action="filterChartPoint" data-key="${escapeHtml(point.key)}" data-start="${escapeHtml(point.start)}" data-end-exclusive="${escapeHtml(point.endExclusive)}" aria-label="Filter to ${escapeHtml(point.label)}: ${escapeHtml(formatMetricCost(point.cost, point.partial))}">${escapeHtml(point.label)}</button>`).join('');

  return `<section aria-labelledby="trend-heading"><h2 id="trend-heading">Cost trend</h2><svg data-testid="cost-trend-chart" viewBox="0 0 420 104" role="img" aria-label="Estimated cost trend"><desc>${escapeHtml(chartDescription(report.chart) || 'No chart points are available.')}</desc><line x1="0" y1="84" x2="420" y2="84" class="chart-axis" />${bars}</svg><div class="chart-points" aria-label="Cost trend points">${buttons}</div></section>`;
}

function driver(label: string, value: CostCenterReport['drivers'][keyof CostCenterReport['drivers']]): string {
  if (!value) return `<article class="driver"><h3>${escapeHtml(label)}</h3><p>No usage data</p></article>`;
  return `<article class="driver"><h3>${escapeHtml(label)}</h3><p>${escapeHtml(value.label)}</p><strong>${escapeHtml(formatMetricCost(value.cost, false))}</strong><span>${escapeHtml(formatPercent(value.comparisonPercent))}</span></article>`;
}

export function buildOverview(report: CostCenterReport): string {
  const summary = report.summary;
  const empty = report.emptyState ? `<p class="notice">${escapeHtml(report.emptyState.message)}</p>` : '';
  return `<section class="overview" aria-labelledby="overview-heading"><h2 id="overview-heading">Overview</h2>${empty}<dl class="metrics"><div class="metric"><dt>Estimated cost</dt><dd>${escapeHtml(formatMetricCost(summary.cost.value, summary.cost.partial))}</dd><span>${escapeHtml(formatPercent(summary.cost.comparisonPercent))}</span></div><div class="metric"><dt>Total tokens</dt><dd>${escapeHtml(formatTokensDe(summary.totalTokens))}</dd></div><div class="metric"><dt>Active days</dt><dd>${summary.activeDays}</dd></div><div class="metric"><dt>Sessions</dt><dd>${summary.sessionCount}</dd></div></dl>${buildChart(report)}<section aria-labelledby="drivers-heading"><h2 id="drivers-heading">Top cost drivers</h2><div class="drivers">${driver('Session', report.drivers.session)}${driver('Project', report.drivers.project)}${driver('Model', report.drivers.model)}</div></section><section class="budget" aria-labelledby="budget-heading"><h2 id="budget-heading">Budget</h2><p>${escapeHtml(report.budget.explanation)}</p><dl><div><dt>Budget</dt><dd>${escapeHtml(formatMetricCost(report.budget.amount, false))}</dd></div><div><dt>Remaining</dt><dd>${escapeHtml(formatMetricCost(report.budget.remaining, report.budget.partial))}</dd></div></dl>${report.budget.partial ? '<p class="notice">Cost estimate is partial because some usage has no price.</p>' : ''}</section></section>`;
}
