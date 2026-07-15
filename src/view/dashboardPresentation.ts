import type { CostControlReport, DailyCostPoint, ModelReportItem, SessionReportItem } from '../domain/types';
import { formatCostUsd } from './costDisplay';
import { buildCostControlText, buildCostSummaryText } from './costControlPresentation';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character] ?? character);
}

function formatEstimate(value: number | undefined, approximate = false): string {
  return formatCostUsd(value, { approximate, unavailableLabel: 'Unavailable' });
}

function formatDailyCost(point: DailyCostPoint): string {
  return formatEstimate(point.estimatedCost, point.hasEstimatedCostGaps);
}

function chartBar(point: DailyCostPoint, maximum: number, index: number): string {
  const cost = point.estimatedCost ?? 0;
  const height = maximum > 0 ? Math.max(2, Math.round(cost / maximum * 72)) : 2;
  const x = 8 + index * 42;
  const label = `${point.date}: ${formatDailyCost(point)}`;

  return `<g><title>${escapeHtml(label)}</title><rect x="${x}" y="${80 - height}" width="24" height="${height}" rx="2" class="bar" /><text x="${x + 12}" y="94" text-anchor="middle" class="chart-label">${escapeHtml(point.date)}</text></g>`;
}

function buildChart(points: readonly DailyCostPoint[]): string {
  const sevenPoints = points.slice(-7);
  const maximum = Math.max(0, ...sevenPoints.map((point) => point.estimatedCost ?? 0));
  const bars = sevenPoints.map((point, index) => chartBar(point, maximum, index)).join('');
  const description = sevenPoints.map((point) => `${point.date}: ${formatDailyCost(point)}`).join('; ');

  return `<section aria-labelledby="seven-day-heading"><h2 id="seven-day-heading">Last 7 days</h2><svg data-testid="seven-day-chart" viewBox="0 0 310 102" role="img" aria-label="7 day estimated cost chart"><desc>${escapeHtml(description)}</desc><line x1="0" y1="80" x2="310" y2="80" class="axis" />${bars}</svg></section>`;
}

function buildModelRows(models: readonly ModelReportItem[]): string {
  if (models.length === 0) return '<p>No model cost data is available for today.</p>';

  return `<table><thead><tr><th scope="col">Model</th><th scope="col">Estimated cost</th><th scope="col">Sessions</th></tr></thead><tbody>${models.map((model) => `<tr><th scope="row">${escapeHtml(model.model)}</th><td>${escapeHtml(formatEstimate(model.estimatedCost, !model.hasPricing))}</td><td>${model.sessionCount}</td></tr>`).join('')}</tbody></table>`;
}

function buildSessionRows(sessions: readonly SessionReportItem[]): string {
  if (sessions.length === 0) return '<p>No recent sessions are available for today.</p>';

  return `<ul class="sessions">${sessions.map((session) => `<li><strong>${escapeHtml(session.label)}</strong><span>${escapeHtml(session.model ?? 'Unknown model')} · ${escapeHtml(formatEstimate(session.estimatedCost, !session.hasPricing))}</span></li>`).join('')}</ul>`;
}

export function buildDashboardHtml(control: CostControlReport, nonce: string): string {
  const text = buildCostControlText(control);
  const approximate = control.today.hasEstimatedCostGaps || control.today.budget.hasEstimatedCostGaps;
  const budget = text.budgetText ?? 'Not configured';
  const remaining = text.remainingText ?? 'Remaining: unavailable';
  const projection = text.projectedText ?? 'Projected end of day: unavailable';
  const summary = buildCostSummaryText(control);
  const safeNonce = escapeHtml(nonce);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${safeNonce}'">
<title>Codex Cost Dashboard</title><style>
:root { color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
body { max-width: 960px; margin: 0 auto; padding: 24px; line-height: 1.45; }
h1, h2 { margin: 0 0 12px; } h2 { font-size: 1.1rem; } .lede { color: var(--vscode-descriptionForeground); margin-top: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0; } button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; padding: 6px 12px; cursor: pointer; } button:hover, button:focus-visible { background: var(--vscode-button-hoverBackground); outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 20px 0; } .metric { border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 12px; } .metric dt { color: var(--vscode-descriptionForeground); } .metric dd { font-size: 1.2rem; font-weight: 600; margin: 4px 0 0; }
section { margin-top: 28px; } svg { display: block; max-width: 100%; height: auto; } .bar { fill: var(--vscode-charts-blue); } .axis { stroke: var(--vscode-widget-border); } .chart-label { fill: var(--vscode-descriptionForeground); font-size: 7px; } table { border-collapse: collapse; width: 100%; } th, td { border-bottom: 1px solid var(--vscode-widget-border); padding: 8px; text-align: left; } .sessions { list-style: none; margin: 0; padding: 0; } .sessions li { border-bottom: 1px solid var(--vscode-widget-border); padding: 8px 0; } .sessions span { color: var(--vscode-descriptionForeground); display: block; } .notice { color: var(--vscode-descriptionForeground); }
</style></head><body>
<main><header><h1>Codex Cost Dashboard</h1><p class="lede">Local estimated workspace cost. Pricing may differ from billed usage.</p></header>
<div class="actions" aria-label="Dashboard actions"><button type="button" data-action="refresh">Refresh</button><button type="button" data-action="configureDailyBudget">Configure daily budget</button><button type="button" data-action="copySummary">Copy summary</button></div>
<section aria-labelledby="today-heading"><h2 id="today-heading">Today</h2><p class="notice">${escapeHtml(text.text)}</p><dl class="metrics"><div class="metric"><dt>Spent</dt><dd>${escapeHtml(text.spentText)}</dd></div><div class="metric"><dt>Daily budget</dt><dd>${escapeHtml(budget)}</dd></div><div class="metric"><dt>Remaining</dt><dd>${escapeHtml(remaining)}</dd></div><div class="metric"><dt>Projection</dt><dd>${escapeHtml(projection)}</dd></div></dl>${approximate ? '<p class="notice">Estimate is partial because pricing is missing for some usage.</p>' : ''}</section>
${buildChart(control.daily)}
<section aria-labelledby="models-heading"><h2 id="models-heading">Cost by model</h2>${buildModelRows(control.today.models)}</section>
<section aria-labelledby="sessions-heading"><h2 id="sessions-heading">Recent sessions</h2>${buildSessionRows(control.today.sessions)}</section>
<section aria-labelledby="summary-heading"><h2 id="summary-heading">Summary</h2><pre>${escapeHtml(summary)}</pre></section>
</main><script nonce="${safeNonce}">const vscode = acquireVsCodeApi(); document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => vscode.postMessage({ type: button.dataset.action })));</script></body></html>`;
}
