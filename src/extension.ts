import * as vscode from 'vscode';

import { createAutoRefreshController } from './autoRefreshController';
import { BudgetNotificationController } from './budgetNotificationController';
import { readExtensionConfig } from './config';
import { saveDailyBudget } from './configureDailyBudget';
import { ConfigurationRefreshController } from './configurationRefreshController';
import { SessionRepository } from './data/sessionRepository';
import { createPeriodBoundaryController } from './periodBoundaryController';
import { CostCenter } from './view/costCenter';
import { CostCenterController } from './view/costCenterController';
import { buildCostControlQuickPickPlaceholder } from './view/costControlPresentation';
import { CodexCostTreeProvider } from './view/costTreeProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new CodexCostTreeProvider(context);
  const initialConfiguration = readExtensionConfig();
  const budgetNotifications = new BudgetNotificationController(
    (message) => { void vscode.window.showWarningMessage(message, 'Open Budget Settings', 'Refresh').then((action) => { if (action === 'Open Budget Settings') void vscode.commands.executeCommand('codexCost.openSettings'); else if (action === 'Refresh') void refreshAndNotify(); }); },
    (keys) => { void context.globalState.update('codexCost.budgetNotificationKeys', keys); },
    context.globalState.get<string[]>('codexCost.budgetNotificationKeys', []), vscode.env.language
  );
  const refreshAndNotify = async (): Promise<void> => {
    await provider.refresh();
    notifyLatestBudget();
  };
  const notifyLatestBudget = (): void => {
    const status = provider.getLatestBudgetStatus(); const configuration = readExtensionConfig();
    if (configuration.budgetNotificationsEnabled && status) budgetNotifications.notify(status, new Date(), configuration.budgetNotificationEveryAmount);
  };
  const publishCachedAndNotify = async (): Promise<void> => {
    await provider.publishCachedConsumers();
    notifyLatestBudget();
  };
  const autoRefreshController = createAutoRefreshController(() => refreshAndNotify());
  const periodBoundaryController = createPeriodBoundaryController(() => refreshAndNotify());
  const diagnosticsRepository = new SessionRepository();
  const configurationRefresh = new ConfigurationRefreshController(
    refreshAndNotify,
    publishCachedAndNotify
  );
  const controller = new CostCenterController({
    workspaceState: context.workspaceState, globalState: context.globalState,
    getSnapshot: () => provider.getLatestCostData(), refresh: refreshAndNotify, readConfiguration: readExtensionConfig,
    applySettingsBatch: (updates) => configurationRefresh.applyGuidedSettings(updates, (key, value) =>
      Promise.resolve(vscode.workspace.getConfiguration('codexCost').update(key, value, vscode.ConfigurationTarget.Global))),
    loadRoots: (roots) => diagnosticsRepository.load(roots),
    executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
    showInformationMessage: (message) => vscode.window.showInformationMessage(message),
    reportError: (message) => provider.reportError(message)
  });
  const costCenter = new CostCenter({
    handleMessage: async (message) => {
      if (message.type === 'copySummary') await provider.copySummary();
      return controller.handle(message);
    },
    reportError: (error) => controller.reportError(error)
  });

  context.subscriptions.push(vscode.window.registerTreeDataProvider('codexCost.usage', provider), autoRefreshController, periodBoundaryController, costCenter);
  register(context, 'codexCost.refresh', refreshAndNotify);
  register(context, 'codexCost.setScopeWorkspace', () => provider.setScope('workspace'));
  register(context, 'codexCost.setScopeAll', () => provider.setScope('all'));
  register(context, 'codexCost.openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', 'codexCost'));
  register(context, 'codexCost.openCostCenter', async () => costCenter.show(await controller.open()));
  register(context, 'codexCost.openDashboard', () => vscode.commands.executeCommand('codexCost.openCostCenter'));
  register(context, 'codexCost.openCostControl', async () => {
    const action = await vscode.window.showQuickPick([
      { label: 'Open Codex Cost Center', value: 'costCenter' }, { label: 'Refresh cost data', value: 'refresh' },
      { label: 'Configure daily budget', value: 'budget' }, { label: 'Open Codex Cost settings', value: 'settings' }
    ], { placeHolder: buildCostControlQuickPickPlaceholder(provider.getLatestCostControl()) });
    if (action?.value === 'costCenter') await vscode.commands.executeCommand('codexCost.openCostCenter');
    else if (action?.value === 'refresh') await refreshAndNotify();
    else if (action?.value === 'budget') await vscode.commands.executeCommand('codexCost.configureDailyBudget');
    else if (action?.value === 'settings') await vscode.commands.executeCommand('codexCost.openSettings');
  });
  register(context, 'codexCost.configureDailyBudget', async () => {
    const amountInput = await vscode.window.showInputBox({ prompt: 'Set a positive daily USD budget', placeHolder: 'For example: 10.00', validateInput: validateDailyBudgetInput });
    if (amountInput === undefined || validateDailyBudgetInput(amountInput)) return;
    await saveDailyBudget(
      configurationRefresh,
      Number(amountInput.trim()),
      (key, value) => Promise.resolve(vscode.workspace.getConfiguration('codexCost').update(key, value, vscode.ConfigurationTarget.Global))
    );
  });
  register(context, 'codexCost.copySummary', () => provider.copySummary());

  provider.setCostCenterUpdater(() => { const model = controller.getModel(); if (model) void controller.open().then((updated) => costCenter.update(updated)).catch((error) => controller.reportError(error)); });
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
    if (event.affectsConfiguration('codexCost.autoRefreshSeconds')) autoRefreshController.updateIntervalSeconds(readExtensionConfig().autoRefreshSeconds);
    await configurationRefresh.handleChange(event);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refreshAndNotify));
  autoRefreshController.updateIntervalSeconds(initialConfiguration.autoRefreshSeconds);
  void refreshAndNotify();
}

function register(context: vscode.ExtensionContext, command: string, callback: (...args: unknown[]) => unknown): void { context.subscriptions.push(vscode.commands.registerCommand(command, callback)); }
export function deactivate(): void {}
function validateDailyBudgetInput(value: string): string | undefined { const amount = Number(value.trim()); return Number.isFinite(amount) && amount > 0 ? undefined : 'Enter a positive USD amount.'; }
