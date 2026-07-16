import type { GuidedSettingsDraft, GuidedSettingsGroup } from '../domain/costCenterSettings';
import type { CostCenterReport } from '../domain/costCenterTypes';
import type { CostCenterUiState } from '../domain/costCenterState';

import { buildCostCenterClientScript } from './costCenterClient';
import { buildOverview } from './costCenterOverviewPresentation';
import { buildModelsTable, buildProjectsTable, buildSessionsTable } from './costCenterTablePresentation';

export interface LogRootDiagnostic {
  root: string;
  status: 'ok' | 'missing' | 'unreadable';
  filesCount: number;
  sessionsCount: number;
  latestActivity?: string;
  warnings: string[];
}

export interface CostCenterSettingsView {
  open: boolean;
  group: GuidedSettingsGroup;
  draft: GuidedSettingsDraft;
  errors: Record<string, string>;
  dirty: boolean;
  diagnostics: LogRootDiagnostic[];
}

export interface CostCenterViewModel {
  report: CostCenterReport;
  uiState: CostCenterUiState;
  settings?: CostCenterSettingsView;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function option(value: string, label: string, selected: boolean): string {
  return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function filters(report: CostCenterReport): string {
  const chips = [
    report.filters.projectKey && ['project', report.filters.projectKey],
    report.filters.model && ['model', report.filters.model],
    report.filters.pointStart && ['point', 'Selected chart point']
  ].filter((chip): chip is [string, string] => Boolean(chip));
  return chips.length === 0 ? '' : `<div class="filter-chips" aria-label="Active filters">${chips.map(([kind, label]) => `<button type="button" data-action="clearFilter" data-value="${escapeHtml(kind)}">${escapeHtml(label)} <span aria-label="Clear filter">×</span></button>`).join('')}</div>`;
}

function tabs(section: CostCenterReport['filters']['section']): string {
  const sections: Array<[CostCenterReport['filters']['section'], string]> = [['overview', 'Overview'], ['sessions', 'Sessions'], ['projects', 'Projects'], ['models', 'Models']];
  return `<div role="tablist" aria-label="Cost Center sections">${sections.map(([key, label]) => `<button type="button" role="tab" tabindex="${key === section ? '0' : '-1'}" id="tab-${key}" aria-selected="${key === section}" aria-controls="panel-${key}" data-action="setSection" data-value="${key}">${label}</button>`).join('')}</div>`;
}

function panels(model: CostCenterViewModel): string {
  const selected = model.report.filters.section;
  const sections: Array<[CostCenterReport['filters']['section'], string]> = [
    ['overview', buildOverview(model.report)],
    ['sessions', buildSessionsTable(model.report, model.uiState)],
    ['projects', buildProjectsTable(model.report, model.uiState)],
    ['models', buildModelsTable(model.report, model.uiState)]
  ];
  return sections.map(([section, content]) => `<section id="panel-${section}" role="tabpanel" aria-labelledby="tab-${section}"${section === selected ? '' : ' hidden'}>${content}</section>`).join('');
}

function styles(): string {
  return `:root { color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); } body { max-width: 1100px; margin: 0 auto; padding: 20px; line-height: 1.45; } button, select, input { font: inherit; } button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; padding: 6px 10px; cursor: pointer; } select, input { color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 5px; } .lede, .notice { color: var(--vscode-descriptionForeground); } .controls, .filter-chips, [role="tablist"], .chart-points, .chart-legend { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; align-items: center; } .metrics, .drivers { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } .drivers { grid-template-columns: repeat(3, minmax(0, 1fr)); } .metric, .driver, .budget { border: 1px solid var(--vscode-widget-border); background: var(--vscode-editorWidget-background); padding: 12px; border-radius: 4px; } dt { color: var(--vscode-descriptionForeground); } dd { font-size: 1.2rem; font-weight: 600; margin: 4px 0; } .chart-current { fill: var(--vscode-charts-blue); } .chart-comparison { fill: var(--vscode-charts-orange); } .chart-budget-reference { stroke: var(--vscode-charts-yellow); stroke-dasharray: 4 2; } .chart-axis { stroke: var(--vscode-widget-border); } .legend-current::before, .legend-comparison::before, .legend-budget::before { content: ''; display: inline-block; width: 0.8em; height: 0.8em; margin-right: 0.3em; } .legend-current::before { background: var(--vscode-charts-blue); } .legend-comparison::before { background: var(--vscode-charts-orange); } .legend-budget::before { background: var(--vscode-charts-yellow); } .chart-point { background: transparent; color: var(--vscode-textLink-foreground); padding: 2px; } .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; } :focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; } @media (max-width: 700px) { .metrics, .drivers { grid-template-columns: 1fr; } }`;
}

export function buildCostCenterHtml(model: CostCenterViewModel, nonce: string): string {
  const report = model.report;
  const range = report.filters.range;
  const custom = range.kind === 'custom' ? range : undefined;
  const safeNonce = escapeHtml(nonce);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${safeNonce}'"><title>Codex Cost Center</title><style>${styles()}</style></head><body><main><header><h1>Codex Cost Center</h1><p class="lede">Local estimated usage cost. Prices may differ from billed usage.</p></header><div class="controls" aria-label="Cost Center controls"><label>Scope <select data-action="setScope"><option value="workspace"${report.filters.scope === 'workspace' ? ' selected' : ''}>Workspace</option><option value="all"${report.filters.scope === 'all' ? ' selected' : ''}>All sessions</option></select></label><label>Range <select data-action="setRange" data-control="range">${option('today', 'Today', range.kind === 'today')}${option('7d', 'Last 7 days', range.kind === '7d')}${option('30d', 'Last 30 days', range.kind === '30d')}${option('custom', 'Custom range', range.kind === 'custom')}</select></label><label>Compare <input type="checkbox" data-action="setRange" data-control="compare"${range.compare ? ' checked' : ''}></label><label>Start <input type="text" data-action="setRange" data-control="start-date" value="${escapeHtml(custom?.startDate ?? '')}"></label><label>End <input type="text" data-action="setRange" data-control="end-date" value="${escapeHtml(custom?.endDate ?? '')}"></label><button type="button" data-action="refresh">Refresh</button><button type="button" data-action="openSettings">Settings</button></div>${filters(report)}${tabs(report.filters.section)}${panels(model)}</main><script nonce="${safeNonce}">${buildCostCenterClientScript()}</script></body></html>`;
}
