import type { ExtensionConfig } from '../config';
import type { LoadSessionsResult } from '../data/sessionRepository';
import { buildCostCenterReport } from '../domain/costCenterAnalytics';
import {
  createGuidedSettingsDraft, resetSettingsGroup, settingsUpdates, validateGuidedSettings,
  type GuidedSettingField, type GuidedSettingsDraft, type GuidedSettingsGroup, type GuidedSettingsUpdate
} from '../domain/costCenterSettings';
import {
  preferencesFromState, readCostCenterPreferences, reduceCostCenterState,
  type CostCenterPreferences, type CostCenterUiState
} from '../domain/costCenterState';
import type { CostCenterMessage } from './costCenter';
import type { CostCenterViewModel, LogRootDiagnostic } from './costCenterPresentation';
import type { CostDataSnapshot } from './costTreeProvider';

export const PREFERENCES_KEY = 'codexCost.costCenter.preferences';
export const PINNED_PROJECTS_KEY = 'codexCost.costCenter.pinnedProjects';
export const EXCLUDED_PROJECTS_KEY = 'codexCost.costCenter.excludedProjects';

interface Memory { get<T>(key: string, fallback?: T): T | undefined; update(key: string, value: unknown): PromiseLike<void>; }

export interface CostCenterControllerDependencies {
  workspaceState: Memory;
  globalState: Memory;
  getSnapshot(): CostDataSnapshot | undefined;
  refresh(): Promise<void>;
  readConfiguration(): ExtensionConfig;
  updateConfiguration(key: string, value: unknown): Promise<void>;
  loadRoots(roots: readonly string[]): Promise<LoadSessionsResult>;
  executeCommand(command: string, ...args: unknown[]): PromiseLike<unknown>;
  showInformationMessage(message: string): PromiseLike<unknown>;
  reportError(message: string): void;
}

const CONFIG_KEYS: Record<GuidedSettingField, string> = {
  'budget.dayAmount': 'budget.dayAmount', 'budget.weekAmount': 'budget.weekAmount',
  'budget.monthAmount': 'budget.monthAmount', 'budget.warningPercent': 'budget.warningPercent',
  'display.showSession': 'statusBar.showSession', 'display.showWorkspace': 'statusBar.showWorkspace',
  'display.showBudget': 'statusBar.showBudget', 'display.budgetPeriod': 'statusBar.budgetPeriod',
  'display.defaultRange': 'costCenter.defaultRange', 'display.compareByDefault': 'costCenter.compareByDefault',
  'dataSources.logRoots': 'logRoots', 'dataSources.include': 'sources.include',
  'notifications.enabled': 'budget.notifications.enabled', 'notifications.everyAmount': 'budget.notifications.everyAmount',
  'notifications.thresholdSummary': 'budget.notifications.thresholdSummary'
};

export class CostCenterController {
  private state?: CostCenterUiState;
  private model?: CostCenterViewModel;
  private settings?: { open: true; group: GuidedSettingsGroup; draft: GuidedSettingsDraft; original: GuidedSettingsDraft; errors: Record<string, string>; diagnostics: LogRootDiagnostic[] };

  constructor(private readonly deps: CostCenterControllerDependencies) {}

  getModel(): CostCenterViewModel | undefined { return this.model; }

  async open(): Promise<CostCenterViewModel> {
    if (!this.deps.getSnapshot()) await this.deps.refresh();
    if (!this.state) this.state = initialState(this.preferences());
    return this.rebuild();
  }

  async handle(message: CostCenterMessage): Promise<CostCenterViewModel> {
    if (!this.state) await this.open();
    switch (message.type) {
      case 'refresh': await this.deps.refresh(); break;
      case 'setScope': this.state = reduceCostCenterState(this.state!, { type: 'setScope', scope: message.value }); await this.savePreferences(); break;
      case 'setRange': this.state = reduceCostCenterState(this.state!, { type: 'setRange', range: message.value }); await this.savePreferences(); break;
      case 'setSection': this.state = reduceCostCenterState(this.state!, { type: 'setSection', section: message.value }); await this.savePreferences(); break;
      case 'setSearch': this.state = reduceCostCenterState(this.state!, { type: 'setSearch', value: message.value }); break;
      case 'toggleSession': this.state = reduceCostCenterState(this.state!, { type: 'toggleSession', sessionKey: message.key }); break;
      case 'drillProject': this.state = reduceCostCenterState(this.state!, { type: 'drillToSessions', projectKey: message.key }); break;
      case 'drillModel': this.state = reduceCostCenterState(this.state!, { type: 'drillToSessions', model: message.key }); break;
      case 'filterChartPoint': this.state = reduceCostCenterState(this.state!, { type: 'filterChartPoint', pointStart: message.pointStart, pointEndExclusive: message.pointEndExclusive }); break;
      case 'clearFilter': this.state = reduceCostCenterState(this.state!, { type: 'clearFilter', filter: message.value }); break;
      case 'toggleProjectPin': await this.togglePath(PINNED_PROJECTS_KEY, message.key); break;
      case 'excludeProject': await this.togglePath(EXCLUDED_PROJECTS_KEY, message.key); break;
      case 'openSettings': this.openSettings(); break;
      case 'setSettingsGroup': this.requireSettings().group = message.value; break;
      case 'updateSettingField': setDraftValue(this.requireSettings().draft, message.key, message.value); break;
      case 'resetSettingsGroup': this.requireSettings().draft = resetSettingsGroup(this.requireSettings().draft, message.value); break;
      case 'discardSettings': this.settings = undefined; break;
      case 'saveSettings': await this.saveSettings(); break;
      case 'checkData': await this.checkData(); break;
      case 'openAdvancedPricing': await this.deps.executeCommand('workbench.action.openSettings', '@ext:gamjak.codex-cost-extension codexCost.pricing.models'); break;
      case 'openAdvancedSettings': await this.deps.executeCommand('workbench.action.openSettings', '@ext:gamjak.codex-cost-extension'); break;
      case 'testNotification': await this.deps.showInformationMessage('Codex Cost notifications are working.'); break;
      case 'copySummary': break;
      case 'setSort': this.setSort(message.key, message.value); break;
    }
    return this.rebuild();
  }

  reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.deps.reportError(`[${new Date().toISOString()}] Cost Center render failed: ${message}`);
  }

  private preferences(): CostCenterPreferences {
    const saved = this.deps.workspaceState.get<unknown>(PREFERENCES_KEY);
    if (saved !== undefined) return readCostCenterPreferences(saved);
    const config = this.deps.readConfiguration();
    return { scope: config.scopeDefault, range: { kind: config.costCenterDefaults.range, compare: config.costCenterDefaults.compare }, section: 'overview' };
  }

  private async savePreferences(): Promise<void> { await this.deps.workspaceState.update(PREFERENCES_KEY, preferencesFromState(this.state!)); }
  private openSettings(): void { const original = createGuidedSettingsDraft(this.deps.readConfiguration()); this.settings = { open: true, group: 'budget', original, draft: structuredClone(original), errors: {}, diagnostics: [] }; }
  private requireSettings() { if (!this.settings) this.openSettings(); return this.settings!; }

  private async saveSettings(): Promise<void> {
    const settings = this.requireSettings(); settings.errors = validateGuidedSettings(settings.draft);
    if (Object.keys(settings.errors).length) return;
    const updates = settingsUpdates(this.deps.readConfiguration(), settings.draft);
    for (const update of updates) await this.applyUpdate(update);
    settings.original = structuredClone(settings.draft);
    if (updates.some(({ key }) => key === 'dataSources.logRoots' || key === 'dataSources.include')) await this.deps.refresh();
  }

  private applyUpdate(update: GuidedSettingsUpdate): Promise<void> { return this.deps.updateConfiguration(CONFIG_KEYS[update.key], update.value); }
  private async checkData(): Promise<void> {
    const settings = this.requireSettings();
    settings.diagnostics = await Promise.all(settings.draft.dataSources.logRoots.map(async (root) => {
      try { const loaded = await this.deps.loadRoots([root]); return { root, status: loaded.filesCount ? 'ok' : 'missing', filesCount: loaded.filesCount, sessionsCount: loaded.sessions.length, latestActivity: latestActivity(loaded.sessions), warnings: loaded.warnings }; }
      catch (error) { return { root, status: 'unreadable', filesCount: 0, sessionsCount: 0, warnings: [error instanceof Error ? error.message : String(error)] }; }
    }));
  }

  private async togglePath(key: string, value: string): Promise<void> { const normalized = normalizeProjectPath(value); const values = new Set((this.deps.globalState.get<string[]>(key, []) ?? []).map(normalizeProjectPath)); if (values.has(normalized)) values.delete(normalized); else values.add(normalized); await this.deps.globalState.update(key, [...values]); }
  private setSort(table: 'sessions' | 'projects' | 'models', column: string): void { const current = this.state!.sort[table]; this.state = reduceCostCenterState(this.state!, { type: 'setSort', table, column, direction: current.column === column && current.direction === 'desc' ? 'asc' : 'desc' } as Parameters<typeof reduceCostCenterState>[1]); }

  private rebuild(): CostCenterViewModel {
    const snapshot = this.deps.getSnapshot(); if (!snapshot) throw new Error('Cost data is unavailable.');
    const config = snapshot.configuration; const filters = this.state!.filters;
    const report = buildCostCenterReport({ sessions: snapshot.sessions, filesCount: snapshot.filesCount, pricingByModel: config.pricingByModel, customPricingModels: config.customPricingModels, repositoryWarnings: snapshot.warnings, workspaceRoots: snapshot.workspaceRoots, sessionSources: config.sessionSources, budgetSettings: config.budgetSettings, filters, pinnedProjects: normalizedPaths(this.deps.globalState.get<string[]>(PINNED_PROJECTS_KEY, []) ?? []), excludedProjects: normalizedPaths(this.deps.globalState.get<string[]>(EXCLUDED_PROJECTS_KEY, []) ?? []), now: snapshot.refreshedAt });
    const settings = this.settings && { open: true as const, group: this.settings.group, draft: this.settings.draft, errors: this.settings.errors, diagnostics: this.settings.diagnostics, dirty: JSON.stringify(this.settings.draft) !== JSON.stringify(this.settings.original) };
    this.model = { report, uiState: this.state!, settings }; return this.model;
  }
}

function initialState(preferences: CostCenterPreferences): CostCenterUiState { return { filters: { ...preferences }, search: '', sort: { sessions: { column: 'estimatedCost', direction: 'desc' }, projects: { column: 'estimatedCost', direction: 'desc' }, models: { column: 'estimatedCost', direction: 'desc' } } }; }
function setDraftValue(draft: GuidedSettingsDraft, key: GuidedSettingField, value: string | number | boolean | string[]): void { const [group, field] = key.split('.') as [keyof GuidedSettingsDraft, string]; (draft[group] as unknown as Record<string, unknown>)[field] = value; }
function latestActivity(sessions: readonly { updatedAt: string }[]): string | undefined { return sessions.map((session) => session.updatedAt).sort().at(-1); }
function normalizeProjectPath(value: string): string { return value.trim().replaceAll('/', '\\').toLowerCase(); }
function normalizedPaths(values: readonly string[]): Set<string> { return new Set(values.map(normalizeProjectPath)); }
