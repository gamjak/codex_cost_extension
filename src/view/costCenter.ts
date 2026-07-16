import * as vscode from 'vscode';

import type { GuidedSettingField, GuidedSettingsGroup } from '../domain/costCenterSettings';
import type { CostCenterRangeSelection, CostCenterSection } from '../domain/costCenterTypes';
import type { ViewScope } from '../domain/types';
import { buildCostCenterHtml, type CostCenterViewModel } from './costCenterPresentation';

const MAX_TEXT = 4096;
const MAX_LIST_ITEMS = 256;
const settingsGroups = ['budget', 'display', 'dataSources', 'notifications'] as const;
const settingKinds = {
  'budget.dayAmount': 'number', 'budget.weekAmount': 'number', 'budget.monthAmount': 'number',
  'budget.warningPercent': 'number', 'display.showSession': 'boolean', 'display.showWorkspace': 'boolean',
  'display.showBudget': 'boolean', 'display.budgetPeriod': 'string', 'display.defaultRange': 'string',
  'display.compareByDefault': 'boolean', 'dataSources.logRoots': 'string[]', 'dataSources.include': 'string[]',
  'notifications.enabled': 'boolean', 'notifications.everyAmount': 'number',
  'notifications.thresholdSummary': 'boolean'
} as const satisfies Record<GuidedSettingField, 'number' | 'boolean' | 'string' | 'string[]'>;

type SimpleMessageType = 'refresh' | 'copySummary' | 'openSettings' | 'saveSettings' |
  'discardSettings' | 'checkData' | 'testNotification' | 'openAdvancedSettings' | 'openAdvancedPricing';

export type CostCenterMessage =
  | { type: SimpleMessageType }
  | { type: 'setScope'; value: ViewScope }
  | { type: 'setRange'; value: CostCenterRangeSelection }
  | { type: 'setSection'; value: CostCenterSection }
  | { type: 'setSettingsGroup' | 'resetSettingsGroup'; value: GuidedSettingsGroup }
  | { type: 'clearFilter'; value: 'project' | 'model' | 'point' }
  | { type: 'drillProject' | 'drillModel' | 'excludeProject' | 'toggleProjectPin' | 'toggleSession'; key: string }
  | { type: 'filterChartPoint'; pointStart: string; pointEndExclusive: string }
  | { type: 'setSearch'; value: string }
  | { type: 'setSort'; key: 'sessions' | 'projects' | 'models'; value: string }
  | { type: 'updateSettingField'; key: GuidedSettingField; value: string | number | boolean | string[] };

export interface CostCenterActions {
  handleMessage?(message: CostCenterMessage): void | CostCenterViewModel | Promise<void | CostCenterViewModel>;
  reportError(error: unknown): void | Promise<void>;
  refresh?(message: CostCenterMessage): void | Promise<void>;
  copySummary?(message: CostCenterMessage): void | Promise<void>;
  openSettings?(message: CostCenterMessage): void | Promise<void>;
  saveSettings?(message: CostCenterMessage): void | CostCenterViewModel | Promise<void | CostCenterViewModel>;
  discardSettings?(message: CostCenterMessage): void | Promise<void>;
  [action: string]: unknown;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT;
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function parseRange(value: unknown): CostCenterRangeSelection | undefined {
  if (!record(value) || typeof value.compare !== 'boolean') return undefined;
  if (oneOf(value.kind, ['today', '7d', '30d'])) return { kind: value.kind, compare: value.compare };
  if (value.kind !== 'custom' || !text(value.startDate) || !text(value.endDate)) return undefined;
  return { kind: 'custom', startDate: value.startDate, endDate: value.endDate, compare: value.compare };
}

function validSettingValue(key: GuidedSettingField, value: unknown): value is string | number | boolean | string[] {
  const kind = settingKinds[key];
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (kind === 'boolean') return typeof value === 'boolean';
  if (kind === 'string') return text(value);
  return Array.isArray(value) && value.length <= MAX_LIST_ITEMS && value.every(text);
}

export function parseCostCenterMessage(value: unknown): CostCenterMessage | undefined {
  if (!record(value) || typeof value.type !== 'string') return undefined;
  const type = value.type;
  if (oneOf(type, ['refresh', 'copySummary', 'openSettings', 'saveSettings', 'discardSettings', 'checkData', 'testNotification', 'openAdvancedSettings', 'openAdvancedPricing'])) return { type };
  if (type === 'setScope' && oneOf(value.value, ['workspace', 'all'])) return { type, value: value.value };
  if (type === 'setRange') { const range = parseRange(value.value); return range && { type, value: range }; }
  if (type === 'setSection' && oneOf(value.value, ['overview', 'sessions', 'projects', 'models'])) return { type, value: value.value };
  if ((type === 'setSettingsGroup' || type === 'resetSettingsGroup') && oneOf(value.value, settingsGroups)) return { type, value: value.value };
  if (type === 'clearFilter' && oneOf(value.value, ['project', 'model', 'point'])) return { type, value: value.value };
  if (oneOf(type, ['drillProject', 'drillModel', 'excludeProject', 'toggleProjectPin', 'toggleSession']) && text(value.key)) return { type, key: value.key };
  if (type === 'filterChartPoint' && hasValidChartBounds(value)) return { type, pointStart: value.pointStart, pointEndExclusive: value.pointEndExclusive };
  if (type === 'setSearch' && text(value.value)) return { type, value: value.value };
  if (type === 'setSort' && oneOf(value.key, ['sessions', 'projects', 'models']) && validSort(value.key, value.value)) return { type, key: value.key, value: value.value };
  if (type === 'updateSettingField' && oneOf(value.key, Object.keys(settingKinds) as GuidedSettingField[]) && validSettingValue(value.key, value.value)) return { type, key: value.key, value: value.value };
  return undefined;
}

function hasValidChartBounds(value: Record<string, unknown>): value is Record<string, unknown> & { pointStart: string; pointEndExclusive: string } {
  const start = value.pointStart;
  const end = value.pointEndExclusive;
  const canonicalIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  if (!text(start) || !text(end) || !canonicalIso.test(start) || !canonicalIso.test(end)) return false;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const duration = endMs - startMs;
  return Number.isFinite(startMs) && Number.isFinite(endMs) &&
    new Date(startMs).toISOString() === start && new Date(endMs).toISOString() === end &&
    duration > 0 && duration <= 26 * 60 * 60 * 1000;
}

function validSort(table: 'sessions' | 'projects' | 'models', value: unknown): value is string {
  const columns = table === 'sessions'
    ? ['estimatedCost', 'updatedAt', 'durationMs']
    : table === 'projects'
      ? ['estimatedCost', 'sessionCount', 'activeDays']
      : ['estimatedCost', 'sessionCount', 'totalTokens'];
  return oneOf(value, columns);
}

function nonce(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

export class CostCenter implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private model: CostCenterViewModel | undefined;
  private closing = false;

  constructor(private readonly actions: CostCenterActions) {}

  show(model: CostCenterViewModel): void {
    this.model = model;
    if (this.panel) { this.panel.reveal(this.panel.viewColumn); this.render(); return; }
    const panel = vscode.window.createWebviewPanel('codexCost.costCenter', 'Codex Cost Center', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
    this.panel = panel;
    panel.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message));
    panel.onDidDispose(() => { if (this.panel === panel) { this.panel = undefined; void this.handleClose(); } });
    this.render();
  }

  update(model: CostCenterViewModel): void { this.model = model; if (this.panel) this.render(); }

  dispose(): void { this.closing = true; this.panel?.dispose(); this.panel = undefined; }

  private render(): void {
    if (!this.panel || !this.model) return;
    try { this.panel.webview.html = buildCostCenterHtml(this.model, nonce()); }
    catch (error) { void this.safeReport(error); }
  }

  private async handleMessage(value: unknown): Promise<void> {
    const message = parseCostCenterMessage(value);
    if (!message) return;
    try {
      if (message.type === 'excludeProject') {
        const choice = await vscode.window.showWarningMessage('Exclude this project from Cost Center totals?', { modal: true }, 'Exclude');
        if (choice !== 'Exclude') return;
      }
      const result = await this.dispatch(message);
      if (result) this.update(result);
    }
    catch (error) { await this.safeReport(error); }
  }

  private async handleClose(): Promise<void> {
    if (this.closing || !this.model?.settings?.dirty) return;
    try {
      const choice = await vscode.window.showWarningMessage('You have unsaved Cost Center settings.', { modal: true }, 'Save', 'Discard');
      if (!choice) { this.show(this.model); return; }
      const result = await this.dispatch({ type: choice === 'Save' ? 'saveSettings' : 'discardSettings' });
      if (result) this.model = result;
      if (choice === 'Save' && this.model.settings?.errors && Object.keys(this.model.settings.errors).length > 0) this.show(this.model);
    } catch (error) { await this.safeReport(error); this.show(this.model); }
  }

  private async safeReport(error: unknown): Promise<void> {
    try { await this.actions.reportError(error); } catch { /* reporting must never break refresh */ }
  }

  private async dispatch(message: CostCenterMessage): Promise<CostCenterViewModel | undefined> {
    if (this.actions.handleMessage) return (await this.actions.handleMessage(message)) || undefined;
    const candidate: unknown = this.actions[message.type];
    if (typeof candidate === 'function') {
      const callback = candidate as (value: CostCenterMessage) => void | CostCenterViewModel | Promise<void | CostCenterViewModel>;
      return (await callback(message)) || undefined;
    }
    return undefined;
  }
}
