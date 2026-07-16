import * as vscode from 'vscode';

import { readExtensionConfig } from '../config';
import { SessionRepository } from '../data/sessionRepository';
import { buildCostControlReport } from '../domain/costControl';
import { buildUsageReport } from '../domain/sessionAggregator';
import type { BudgetStatus, CostControlReport, ParsedSession, UsageReport, ViewScope } from '../domain/types';
import type { ExtensionConfig } from '../config';
import { RefreshCoordinator } from '../refreshCoordinator';
import { configureDisplay } from './costDisplay';
import { buildCostSummaryText } from './costControlPresentation';
import { buildStatusBarEntries } from './statusBarPresentation';
import { buildUsageTree, type TreeNodeData } from './treePresentation';

const SCOPE_KEY = 'codexCost.scope';

export interface CostDataSnapshot {
  sessions: readonly ParsedSession[];
  filesCount: number;
  warnings: readonly string[];
  refreshedAt: Date;
  workspaceRoots: readonly string[];
  configuration: ExtensionConfig;
}

interface TreeNode {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  iconId?: string;
  contextValue?: string;
  command?: vscode.Command;
  collapsibleState: vscode.TreeItemCollapsibleState;
  children?: TreeNode[];
}

function leafNode(id: string, label: string, description?: string, tooltip?: string, iconId?: string): TreeNode {
  return {
    id,
    label,
    description,
    tooltip,
    iconId,
    contextValue: undefined,
    collapsibleState: vscode.TreeItemCollapsibleState.None
  };
}

function toVscodeNode(node: TreeNodeData): TreeNode {
  return {
    id: node.id,
    label: node.label,
    description: node.description,
    tooltip: node.tooltip,
    iconId: node.iconId,
    contextValue: node.contextValue,
    command: node.command ? { command: node.command, title: node.label } : undefined,
    collapsibleState:
      node.collapsibleState === 'expanded'
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    children: node.children?.map(toVscodeNode)
  };
}

export class CodexCostTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeNode | undefined | void>();
  private readonly sessionStatusItem = vscode.window.createStatusBarItem(
    'codexCost.currentSession',
    vscode.StatusBarAlignment.Left,
    110
  );
  private readonly workspaceStatusItem = vscode.window.createStatusBarItem(
    'codexCost.currentWorkspace',
    vscode.StatusBarAlignment.Left,
    109
  );
  private readonly budgetStatusItem = vscode.window.createStatusBarItem(
    'codexCost.currentBudget',
    vscode.StatusBarAlignment.Left,
    108
  );
  private readonly output = vscode.window.createOutputChannel('Codex Cost');
  private readonly sessionRepository: Pick<SessionRepository, 'load'>;
  private readonly refreshCoordinator = new RefreshCoordinator(() => this.performRefresh());
  private nodes: TreeNode[] = [
    leafNode('loading', 'Loading Codex session data...', undefined, undefined, 'loading~spin')
  ];
  private scope: ViewScope;
  private lastRefreshAt?: Date;
  private latestBudgetStatus?: BudgetStatus;
  private latestCostControl?: CostControlReport;
  private costCenterUpdater?: (snapshot: CostDataSnapshot) => void;
  private latestCostData?: CostDataSnapshot;
  private lastRefreshSucceeded = false;

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext, sessionRepository: Pick<SessionRepository, 'load'> = new SessionRepository()) {
    this.sessionRepository = sessionRepository;
    this.scope = context.workspaceState.get<ViewScope>(SCOPE_KEY) ?? readExtensionConfig().scopeDefault;

    this.sessionStatusItem.command = 'codexCost.openCostCenter';
    this.workspaceStatusItem.command = 'codexCost.openCostCenter';
    this.budgetStatusItem.command = 'codexCost.openCostCenter';

    context.subscriptions.push(this.sessionStatusItem, this.workspaceStatusItem, this.budgetStatusItem, this.output);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, element.collapsibleState);
    item.id = element.id;
    item.description = element.description;
    item.tooltip = element.tooltip;
    item.contextValue = element.contextValue;
    item.command = element.command;
    item.iconPath = element.iconId ? new vscode.ThemeIcon(element.iconId) : undefined;
    return item;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.nodes;
    }

    return element.children ?? [];
  }

  async initialize(): Promise<void> {
    await this.refresh();
  }

  async setScope(scope: ViewScope): Promise<void> {
    this.scope = scope;
    await this.context.workspaceState.update(SCOPE_KEY, scope);
    await this.refresh();
  }

  async refresh(): Promise<void> {
    return this.refreshCoordinator.request();
  }

  getLatestBudgetStatus(): BudgetStatus | undefined {
    return this.lastRefreshSucceeded ? this.latestBudgetStatus : undefined;
  }

  getLatestCostControl(): CostControlReport | undefined {
    return this.lastRefreshSucceeded ? this.latestCostControl : undefined;
  }

  getLatestCostData(): CostDataSnapshot | undefined {
    return this.latestCostData;
  }

  setCostCenterUpdater(callback: (snapshot: CostDataSnapshot) => void): void {
    this.costCenterUpdater = callback;
  }

  async copySummary(): Promise<void> {
    const control = this.getLatestCostControl();
    if (!control) {
      await vscode.window.showInformationMessage('No cost summary is available yet. Refresh cost data first.');
      return;
    }

    await vscode.env.clipboard.writeText(buildCostSummaryText(control));
    await vscode.window.showInformationMessage('Cost summary copied to the clipboard.');
  }

  reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.output.appendLine(`[${new Date().toISOString()}] Cost Center render failed: ${message}`);
  }

  publishCachedConsumers(): Promise<void> {
    const snapshot = this.latestCostData;
    if (!snapshot) return Promise.resolve();
    this.publishSnapshot({ ...snapshot, configuration: readExtensionConfig() });
    this.onDidChangeTreeDataEmitter.fire();
    return Promise.resolve();
  }

  private async performRefresh(): Promise<void> {
    this.lastRefreshSucceeded = false;
    this.latestCostControl = undefined;
    const configuration = readExtensionConfig();
    configureDisplay(vscode.env.language);
    const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
    const refreshedAt = new Date();
    this.lastRefreshAt = refreshedAt;

    try {
      const loaded = await this.sessionRepository.load(configuration.logRoots);

      const snapshot: CostDataSnapshot = {
        sessions: loaded.sessions,
        filesCount: loaded.filesCount,
        warnings: loaded.warnings,
        refreshedAt,
        workspaceRoots,
        configuration
      };
      this.publishSnapshot(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.output.appendLine(`[${new Date().toISOString()}] Refresh failed: ${message}`);
      const emptyControl = emptyCostControlReport(configuration);
      this.updateStatusBar(emptyUsageReport(configuration), configuration, emptyControl);
      this.nodes = [
        leafNode('error', 'Failed to load Codex logs', message, message, 'error')
      ];
    }

    this.onDidChangeTreeDataEmitter.fire();
  }

  private publishSnapshot(snapshot: CostDataSnapshot): void {
      const { sessions, filesCount, warnings, refreshedAt, workspaceRoots, configuration } = snapshot;
      configureDisplay(vscode.env.language);
      this.lastRefreshAt = refreshedAt;
      const workspaceReport = buildUsageReport(sessions, configuration.pricingByModel, {
        scope: 'workspace',
        workspaceRoots,
        sessionSources: configuration.sessionSources,
        filterStartDateInput: configuration.filterStartDate,
        budgetSettings: configuration.budgetSettings,
        budgetPeriod: configuration.statusBarBudgetPeriod,
        now: refreshedAt
      });
      const control = buildCostControlReport(sessions, configuration.pricingByModel, {
        scope: 'workspace',
        workspaceRoots,
        sessionSources: configuration.sessionSources,
        filterStartDateInput: configuration.filterStartDate,
        budgetSettings: configuration.budgetSettings,
        budgetPeriod: 'day',
        now: refreshedAt
      });
      const report = buildUsageReport(sessions, configuration.pricingByModel, {
        scope: this.scope,
        workspaceRoots,
        sessionSources: configuration.sessionSources,
        filterStartDateInput: configuration.filterStartDate,
        budgetSettings: configuration.budgetSettings,
        budgetPeriod: configuration.statusBarBudgetPeriod,
        now: refreshedAt
      });
      const displayReport = filesCount === 0
        ? {
            ...report,
            warnings: [...report.warnings, ...warnings, 'No Codex logs found under configured log roots.']
          }
        : {
            ...report,
            warnings: [...report.warnings, ...warnings]
          };

      this.updateStatusBar(workspaceReport, configuration, control);
      this.latestBudgetStatus = workspaceReport.budget;
      this.latestCostControl = control;
      this.latestCostData = snapshot;
      this.lastRefreshSucceeded = true;
      this.nodes = buildUsageTree(this.scope, displayReport, {
        autoRefreshSeconds: configuration.autoRefreshSeconds,
        lastRefreshAt: this.lastRefreshAt
      }, control).map(toVscodeNode);
      if (this.costCenterUpdater) {
        try {
          this.costCenterUpdater(snapshot);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.output.appendLine(`[${new Date().toISOString()}] Cost Center update failed: ${message}`);
        }
      }
  }

  private updateStatusBar(
    report: UsageReport,
    configuration: ReturnType<typeof readExtensionConfig>,
    control: CostControlReport
  ): void {
    const entries = buildStatusBarEntries(report, {
      autoRefreshSeconds: configuration.autoRefreshSeconds,
      visibility: configuration.statusBarVisibility
    }, control);

    this.applyStatusBarEntry(this.sessionStatusItem, entries.session);
    this.applyStatusBarEntry(this.workspaceStatusItem, entries.workspace);
    this.applyStatusBarEntry(this.budgetStatusItem, entries.budget);
  }

  private applyStatusBarEntry(item: vscode.StatusBarItem, entry: ReturnType<typeof buildStatusBarEntries>['session']): void {
    item.text = entry.text;
    item.tooltip = entry.tooltip;
    item.backgroundColor = entry.tone === 'warning'
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : entry.tone === 'error'
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : undefined;

    if (entry.visible) {
      item.show();
      return;
    }

    item.hide();
  }
}

function emptyUsageReport(configuration: ReturnType<typeof readExtensionConfig>): UsageReport {
  return buildUsageReport([], configuration.pricingByModel, {
    scope: 'workspace',
    workspaceRoots: [],
    sessionSources: configuration.sessionSources,
    filterStartDateInput: configuration.filterStartDate,
    budgetSettings: configuration.budgetSettings,
    budgetPeriod: configuration.statusBarBudgetPeriod,
    now: new Date()
  });
}

function emptyCostControlReport(configuration: ReturnType<typeof readExtensionConfig>): CostControlReport {
  return buildCostControlReport([], configuration.pricingByModel, {
    scope: 'workspace',
    workspaceRoots: [],
    sessionSources: configuration.sessionSources,
    filterStartDateInput: configuration.filterStartDate,
    budgetSettings: configuration.budgetSettings,
    budgetPeriod: 'day',
    now: new Date()
  });
}
