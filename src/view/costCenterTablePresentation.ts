import type { CostCenterReport } from '../domain/costCenterTypes';
import type { CostCenterUiState } from '../domain/costCenterState';
import { formatCostUsd, formatTokensDe } from './costDisplay';

const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
const cost = (value: number | undefined): string => formatCostUsd(value, { unavailableLabel: 'Unavailable' });
const percent = (value: number | undefined, suffix = ''): string => value === undefined ? 'Unavailable' : `${value.toFixed(1)}%${suffix}`;
const partial = (value: boolean): string => value ? '<span class="notice">Partial estimate: some usage has no price.</span>' : '';
const sortButton = (table: string, value: string, label: string): string => `<button type="button" class="table-sort" data-action="setSort" data-key="${table}" data-value="${value}">${label}</button>`;
const searchControl = (search: string, section: string): string => `<label>Search ${section} <input type="search" data-action="setSearch" value="${escapeHtml(search)}"></label>`;
const matches = (search: string, values: Array<string | undefined>): boolean => !search.trim() || values.some((value) => value?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
const direction = (state: CostCenterUiState, table: keyof CostCenterUiState['sort']): number => state.sort[table].direction === 'asc' ? 1 : -1;
const compare = (left: string | number | undefined, right: string | number | undefined): number => (left ?? 0) > (right ?? 0) ? 1 : (left ?? 0) < (right ?? 0) ? -1 : 0;

function duration(value: number): string {
  if (value < 60_000) return `${Math.max(1, Math.ceil(value / 1_000))} s`;
  if (value < 3_600_000) return `${Math.max(1, Math.ceil(value / 60_000))} min`;
  return `${Math.max(0.1, value / 3_600_000).toFixed(1)} h`;
}

function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('en-GB');
}

function sessionDetails(report: CostCenterReport, key: string): string {
  const row = report.sessions.find((session) => session.key === key);
  if (!row) return '';
  const timeline = row.timeline.length ? `<ol>${row.timeline.map((point) => `<li>${escapeHtml(point.label)}: ${escapeHtml(cost(point.cost))}, ${formatTokensDe(point.tokens)} tokens${point.partial ? ' — partial estimate' : ''}</li>`).join('')}</ol>` : 'No cost timeline is available.';
  return `<div class="session-details"><h4>Cost timeline</h4>${timeline}<h4>Token composition</h4><p>Input ${formatTokensDe(row.tokens.inputTokens)}; cached input ${formatTokensDe(row.tokens.cachedInputTokens)}; output ${formatTokensDe(row.tokens.outputTokens)}</p><p>Project: ${escapeHtml(row.projectLabel)}</p>${row.projectPath ? `<p>Path: ${escapeHtml(row.projectPath)}</p>` : ''}<p>Source: ${escapeHtml(row.source)}</p></div>`;
}

export function buildSessionsTable(report: CostCenterReport, state: CostCenterUiState): string {
  const sort = state.sort.sessions;
  const rows = report.sessions.filter((row) => matches(state.search, [row.label, row.projectLabel, row.projectPath, row.source, ...row.models])).sort((a, b) => direction(state, 'sessions') * compare(a[sort.column], b[sort.column]));
  const body = rows.map((row) => `<tr><th scope="row"><button type="button" data-action="toggleSession" data-key="${escapeHtml(row.key)}" aria-expanded="${state.expandedSessionKey === row.key}">${escapeHtml(row.label)}</button></th><td>${escapeHtml(dateTime(row.startedAt))}</td><td>${escapeHtml(dateTime(row.updatedAt))}</td><td>${duration(row.durationMs)}</td><td>${row.models.map(escapeHtml).join(', ')}</td><td>${formatTokensDe(row.tokens.inputTokens)}</td><td>${formatTokensDe(row.tokens.cachedInputTokens)}</td><td>${formatTokensDe(row.tokens.outputTokens)}</td><td>${escapeHtml(cost(row.estimatedCost))} ${partial(row.partial)}</td><td>${percent(row.sharePercent, ' of selected period')}</td><td>${row.partial ? 'Missing price' : 'Priced'}</td></tr>${state.expandedSessionKey === row.key ? `<tr><td colspan="11">${sessionDetails(report, row.key)}</td></tr>` : ''}`).join('');
  const content = rows.length ? `<div class="table-scroll"><table><caption>Sessions</caption><thead><tr><th scope="col">Session</th><th scope="col">Start</th><th scope="col">${sortButton('sessions', 'updatedAt', 'Last activity')}</th><th scope="col">${sortButton('sessions', 'durationMs', 'Duration')}</th><th scope="col">Models</th><th scope="col">Input tokens</th><th scope="col">Cached-input tokens</th><th scope="col">Output tokens</th><th scope="col">${sortButton('sessions', 'estimatedCost', 'Estimated cost')}</th><th scope="col">Share</th><th scope="col">Pricing</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="notice">No sessions match the active filters.</p>';
  return `<div class="analysis"><h2>Sessions</h2>${searchControl(state.search, 'sessions')}${content}</div>`;
}

export function buildProjectsTable(report: CostCenterReport, state: CostCenterUiState): string {
  const sort = state.sort.projects;
  const rows = report.projects.filter((row) => matches(state.search, [row.label, row.path, row.topModel])).sort((a, b) => direction(state, 'projects') * compare(a[sort.column], b[sort.column]));
  const body = rows.map((row) => `<tr><th scope="row"><button type="button" data-action="drillProject" data-key="${escapeHtml(row.key)}">${escapeHtml(row.path ? row.label : 'No project')}</button>${row.path ? `<div class="path">${escapeHtml(row.path)}</div>` : ''}${row.pinned ? '<span aria-label="Pinned">★ Pinned</span>' : ''}</th><td>${escapeHtml(cost(row.estimatedCost))} ${partial(row.partial)}</td><td>${percent(row.comparisonPercent)}</td><td>${row.sessionCount}</td><td>${row.activeDays}</td><td>${escapeHtml(row.topModel ?? 'Unavailable')}</td><td>${escapeHtml(cost(row.averageCostPerSession))}</td><td><button type="button" data-action="toggleProjectPin" data-key="${escapeHtml(row.key)}">${row.pinned ? 'Unpin' : 'Pin'}</button> <button type="button" data-action="excludeProject" data-key="${escapeHtml(row.key)}">Exclude</button> <button type="button" data-action="drillProject" data-key="${escapeHtml(row.key)}">Drill to Sessions</button></td></tr>`).join('');
  const content = rows.length ? `<div class="table-scroll"><table><caption>Projects</caption><thead><tr><th scope="col">Project</th><th scope="col">${sortButton('projects', 'estimatedCost', 'Estimated cost')}</th><th scope="col">Previous-period change</th><th scope="col">${sortButton('projects', 'sessionCount', 'Sessions')}</th><th scope="col">${sortButton('projects', 'activeDays', 'Active days')}</th><th scope="col">Most expensive model</th><th scope="col">Average per session</th><th scope="col">Actions</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="notice">No projects match the active filters.</p>';
  return `<div class="analysis"><h2>Projects</h2>${searchControl(state.search, 'projects')}${content}</div>`;
}

export function buildModelsTable(report: CostCenterReport, state: CostCenterUiState): string {
  const sort = state.sort.models;
  const rows = report.models.filter((row) => matches(state.search, [row.model])).sort((a, b) => direction(state, 'models') * compare(sort.column === 'totalTokens' ? a.tokens.totalTokens : a[sort.column], sort.column === 'totalTokens' ? b.tokens.totalTokens : b[sort.column]));
  const pricing = { bundled: 'Bundled price', custom: 'Custom price', missing: 'Missing price' } as const;
  const body = rows.map((row) => `<tr><th scope="row"><button type="button" data-action="drillModel" data-key="${escapeHtml(row.model)}">${escapeHtml(row.model)}</button></th><td>${escapeHtml(cost(row.estimatedCost))} ${partial(row.partial)}</td><td>${formatTokensDe(row.tokens.inputTokens)}</td><td>${formatTokensDe(row.tokens.cachedInputTokens)}</td><td>${formatTokensDe(row.tokens.outputTokens)}</td><td>${row.sessionCount}</td><td>${row.projectCount}</td><td>${escapeHtml(cost(row.averageCostPerSession))}</td><td>${percent(row.sharePercent, ' of total cost')}</td><td>${pricing[row.pricingState]}${row.pricingState === 'missing' ? ` <button type="button" data-action="openAdvancedPricing" data-key="${escapeHtml(row.model)}">Advanced pricing</button>` : ''}</td></tr>`).join('');
  const content = rows.length ? `<div class="table-scroll"><table><caption>Models</caption><thead><tr><th scope="col">Model family</th><th scope="col">${sortButton('models', 'estimatedCost', 'Estimated cost')}</th><th scope="col">Input tokens</th><th scope="col">Cached-input tokens</th><th scope="col">Output tokens</th><th scope="col">${sortButton('models', 'sessionCount', 'Sessions')}</th><th scope="col">Projects</th><th scope="col">Average per session</th><th scope="col">Share</th><th scope="col">Pricing</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="notice">No models match the active filters.</p>';
  return `<div class="analysis"><h2>Models</h2>${searchControl(state.search, 'models')}${content}</div>`;
}
