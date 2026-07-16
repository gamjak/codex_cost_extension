import type { CostCenterChartPoint, CostCenterReport } from '../domain/costCenterTypes';

import { formatCostUsd, formatTokensDe } from './costDisplay';
import { escapeHtml } from './costCenterPresentation';

function formatCost(value: number | undefined, partial = false): string {
  return formatCostUsd(value, { approximate: partial, unavailableLabel: 'Unavailable' });
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? 'No comparison' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function pointDescription(point: CostCenterChartPoint): string {
  return `${point.label}: current ${formatCost(point.cost, point.partial)}${point.comparisonCost === undefined ? '' : `, previous ${formatCost(point.comparisonCost)}`}; ${formatTokensDe(point.tokens)} tokens; ${point.sessions} ${point.sessions === 1 ? 'session' : 'sessions'}`;
}

function comparisonDescription(point: CostCenterChartPoint): string {
  const sessions = point.comparisonSessions ?? 0;
  return `${point.label} previous: ${formatCost(point.comparisonCost)}; ${formatTokensDe(point.comparisonTokens ?? 0)} tokens; ${sessions} ${sessions === 1 ? 'session' : 'sessions'}`;
}

function buildChart(report: CostCenterReport): string {
  const budgetAmount = report.budget.amount;
  const maximum = Math.max(0, budgetAmount ?? 0, ...report.chart.flatMap((point) => [point.cost ?? 0, point.comparisonCost ?? 0]));
  const bars = report.chart.map((point, index) => {
    const currentHeight = maximum === 0 ? 2 : Math.max(2, Math.round((point.cost ?? 0) / maximum * 72));
    const comparisonHeight = maximum === 0 ? 2 : Math.max(2, Math.round((point.comparisonCost ?? 0) / maximum * 72));
    const x = 12 + index * 38;
    const comparisonBar = point.comparisonCost === undefined ? '' : `<rect class="chart-comparison" x="${x}" y="${84 - comparisonHeight}" width="14" height="${comparisonHeight}" rx="2"><title>${escapeHtml(comparisonDescription(point))}</title></rect>`;
    return `<g>${comparisonBar}<rect class="chart-current" x="${x + 16}" y="${84 - currentHeight}" width="14" height="${currentHeight}" rx="2"><title>${escapeHtml(pointDescription(point))}</title></rect></g>`;
  }).join('');
  const controls = report.chart.map((point) => `<button type="button" class="chart-point" data-action="filterChartPoint" data-start="${escapeHtml(point.start)}" data-end-exclusive="${escapeHtml(point.endExclusive)}" data-tokens="${point.tokens}" data-sessions="${point.sessions}" aria-describedby="chart-detail-${escapeHtml(point.key)}">${escapeHtml(point.label)}</button><span id="chart-detail-${escapeHtml(point.key)}" class="sr-only">${escapeHtml(pointDescription(point))}</span>`).join('');
  const description = report.chart.length === 0 ? 'No chart points are available.' : report.chart.map(pointDescription).join('. ');
  const budgetLine = budgetAmount === undefined ? '' : `<line class="chart-budget-reference" data-budget-amount="${budgetAmount}" x1="0" y1="${84 - Math.round(budgetAmount / maximum * 72)}" x2="440" y2="${84 - Math.round(budgetAmount / maximum * 72)}"><title>${escapeHtml(`Budget reference: ${formatCost(budgetAmount)}`)}</title></line>`;
  const comparisonLegend = report.filters.range.compare && report.chart.some((point) => point.comparisonCost !== undefined) ? '<span class="legend-comparison">Previous period</span>' : '';
  return `<section aria-labelledby="trend-heading"><h2 id="trend-heading">Cost trend</h2><p class="chart-legend"><span class="legend-current">Current period</span>${comparisonLegend}<span class="legend-budget">Budget reference</span></p><svg data-testid="cost-trend-chart" viewBox="0 0 440 104" role="img" aria-label="Estimated cost trend"><desc>${escapeHtml(description)}</desc><line x1="0" y1="84" x2="440" y2="84" class="chart-axis" />${budgetLine}${bars}</svg><div class="chart-points" aria-label="Cost trend points">${controls}</div></section>`;
}

function driver(kind: 'session' | 'project' | 'model', value: CostCenterReport['drivers'][keyof CostCenterReport['drivers']]): string {
  const label = kind[0].toUpperCase() + kind.slice(1);
  if (!value) return `<article class="driver"><h3>${label}</h3><p>No usage data</p></article>`;
  const action = kind === 'session' ? 'toggleSession' : kind === 'project' ? 'drillProject' : 'drillModel';
  const share = value.sharePercent === undefined ? 'Share unavailable' : `${value.sharePercent.toFixed(1)}% of estimated cost`;
  return `<article class="driver"><h3>${label}</h3><button type="button" data-action="${action}" data-key="${escapeHtml(value.key)}">${escapeHtml(value.label)}</button><strong>${escapeHtml(formatCost(value.cost))}</strong><span>${escapeHtml(share)}</span><span>${escapeHtml(formatPercent(value.comparisonPercent))}</span></article>`;
}

export function buildOverview(report: CostCenterReport): string {
  const summary = report.summary;
  const empty = report.emptyState ? `<p class="notice">${escapeHtml(report.emptyState.message)}</p>` : '';
  return `<section class="overview" aria-labelledby="overview-heading"><h2 id="overview-heading">Overview</h2>${empty}<dl class="metrics"><div class="metric"><dt>Estimated cost</dt><dd>${escapeHtml(formatCost(summary.cost.value, summary.cost.partial))}</dd></div><div class="metric"><dt>Budget used</dt><dd>${escapeHtml(formatCost(report.budget.spent, report.budget.partial))}</dd></div><div class="metric"><dt>Budget remaining</dt><dd>${escapeHtml(formatCost(report.budget.remaining, report.budget.partial))}</dd></div><div class="metric"><dt>Compared with previous period</dt><dd>${escapeHtml(formatPercent(summary.cost.comparisonPercent))}</dd></div><div class="metric"><dt>Average per active day</dt><dd>${escapeHtml(formatCost(summary.averageCostPerActiveDay, summary.cost.partial))}</dd></div></dl>${buildChart(report)}<section aria-labelledby="drivers-heading"><h2 id="drivers-heading">Top cost drivers</h2><div class="drivers">${driver('session', report.drivers.session)}${driver('project', report.drivers.project)}${driver('model', report.drivers.model)}</div></section><section class="budget" aria-labelledby="budget-heading"><h2 id="budget-heading">Budget</h2><p>Budget reference: ${escapeHtml(report.budget.period)}</p><p>${escapeHtml(report.budget.explanation)}</p>${report.budget.partial ? '<p class="notice">Cost estimate is partial because some usage has no price.</p>' : ''}</section></section>`;
}
