import * as vscode from 'vscode';

import { readExtensionConfig } from '../config';
import { parseSessionFile } from '../data/jsonlSessionParser';
import { findSessionFiles } from '../data/sessionScanner';
import { buildUsageReport } from '../domain/sessionAggregator';
import type { ParsedSession, UsageReport, ViewScope } from '../domain/types';
import { buildStatusBarEntries } from './statusBarPresentation';
import { buildUsageTree, type TreeNodeData } from './treePresentation';

const SCOPE_KEY = 'codexCost.scope';

interface TreeNode {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  iconId?: string;
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
  private nodes: TreeNode[] = [
    leafNode('loading', 'Loading Codex session data...', undefined, undefined, 'loading~spin')
  ];
  private scope: ViewScope;
  private lastRefreshAt?: Date;

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.scope = context.workspaceState.get<ViewScope>(SCOPE_KEY) ?? readExtensionConfig().scopeDefault;

    this.sessionStatusItem.command = 'codexCost.refresh';
    this.workspaceStatusItem.command = 'codexCost.refresh';
    this.budgetStatusItem.command = 'codexCost.refresh';

    context.subscriptions.push(this.sessionStatusItem, this.workspaceStatusItem, this.budgetStatusItem);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, element.collapsibleState);
    item.id = element.id;
    item.description = element.description;
    item.tooltip = element.tooltip;
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
    const configuration = readExtensionConfig();
    const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
    this.lastRefreshAt = new Date();

    try {
      const sessionFiles = await findSessionFiles(configuration.logRoots);
      const sessions: ParsedSession[] = [];
      for (const filePath of sessionFiles) {
        const session = await parseSessionFile(filePath);
        if (session) {
          sessions.push(session);
        }
      }

      const workspaceReport = buildUsageReport(sessions, configuration.pricingByModel, {
        scope: 'workspace',
        workspaceRoots,
        filterStartDateInput: configuration.filterStartDate,
        budgetSettings: configuration.budgetSettings,
        budgetPeriod: configuration.statusBarBudgetPeriod,
        now: this.lastRefreshAt
      });
      const report = buildUsageReport(sessions, configuration.pricingByModel, {
        scope: this.scope,
        workspaceRoots,
        filterStartDateInput: configuration.filterStartDate,
        budgetSettings: configuration.budgetSettings,
        budgetPeriod: configuration.statusBarBudgetPeriod,
        now: this.lastRefreshAt
      });
      const displayReport = sessionFiles.length === 0
        ? {
            ...report,
            warnings: [...report.warnings, 'No Codex logs found under configured log roots.']
          }
        : report;

      this.updateStatusBar(workspaceReport, configuration);
      this.nodes = buildUsageTree(this.scope, displayReport, {
        autoRefreshSeconds: configuration.autoRefreshSeconds,
        lastRefreshAt: this.lastRefreshAt
      }).map(toVscodeNode);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.updateStatusBar(emptyUsageReport(configuration), configuration);
      this.nodes = [
        leafNode('error', 'Failed to load Codex logs', message, message, 'error')
      ];
    }

    this.onDidChangeTreeDataEmitter.fire();
  }

  private updateStatusBar(report: UsageReport, configuration: ReturnType<typeof readExtensionConfig>): void {
    const entries = buildStatusBarEntries(report, {
      autoRefreshSeconds: configuration.autoRefreshSeconds,
      visibility: configuration.statusBarVisibility
    });

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
    filterStartDateInput: configuration.filterStartDate,
    budgetSettings: configuration.budgetSettings,
    budgetPeriod: configuration.statusBarBudgetPeriod,
    now: new Date()
  });
}
