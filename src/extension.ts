import * as vscode from 'vscode';

import { createAutoRefreshController } from './autoRefreshController';
import { BudgetNotificationController } from './budgetNotificationController';
import { readExtensionConfig } from './config';
import { CodexCostTreeProvider } from './view/costTreeProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const provider = new CodexCostTreeProvider(context);
  const budgetNotifications = new BudgetNotificationController((message) => {
    void vscode.window.showWarningMessage(message);
  });
  const refreshAndNotify = async (): Promise<void> => {
    await provider.refresh();
    const status = provider.getLatestBudgetStatus();
    if (status) budgetNotifications.notify(status, new Date());
  };
  const autoRefreshController = createAutoRefreshController(() => refreshAndNotify());

  context.subscriptions.push(vscode.window.registerTreeDataProvider('codexCost.usage', provider));
  context.subscriptions.push(autoRefreshController);

  context.subscriptions.push(
    vscode.commands.registerCommand('codexCost.refresh', async () => {
      await refreshAndNotify();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexCost.setScopeWorkspace', async () => {
      await provider.setScope('workspace');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexCost.setScopeAll', async () => {
      await provider.setScope('all');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexCost.openSettings', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'codexCost');
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('codexCost')) {
        autoRefreshController.updateIntervalSeconds(readExtensionConfig().autoRefreshSeconds);
        await refreshAndNotify();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await refreshAndNotify();
    })
  );

  await refreshAndNotify();
  autoRefreshController.updateIntervalSeconds(readExtensionConfig().autoRefreshSeconds);
}

export function deactivate(): void {}
