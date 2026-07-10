import * as vscode from 'vscode';

import { createAutoRefreshController } from './autoRefreshController';
import { readExtensionConfig } from './config';
import { CodexCostTreeProvider } from './view/costTreeProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const provider = new CodexCostTreeProvider(context);
  const autoRefreshController = createAutoRefreshController(() => provider.refresh());

  context.subscriptions.push(vscode.window.registerTreeDataProvider('codexCost.usage', provider));
  context.subscriptions.push(autoRefreshController);

  context.subscriptions.push(
    vscode.commands.registerCommand('codexCost.refresh', async () => {
      await provider.refresh();
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
        await provider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await provider.refresh();
    })
  );

  await provider.initialize();
  autoRefreshController.updateIntervalSeconds(readExtensionConfig().autoRefreshSeconds);
}

export function deactivate(): void {}
