import * as vscode from 'vscode';

import { createAutoRefreshController } from './autoRefreshController';
import { BudgetNotificationController } from './budgetNotificationController';
import { readExtensionConfig } from './config';
import { createPeriodBoundaryController } from './periodBoundaryController';
import { CostDashboard } from './view/costDashboard';
import { buildCostControlQuickPickPlaceholder } from './view/costControlPresentation';
import { CodexCostTreeProvider } from './view/costTreeProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new CodexCostTreeProvider(context);
  const initialConfiguration = readExtensionConfig();
  const budgetNotifications = new BudgetNotificationController(
    (message) => {
      void vscode.window.showWarningMessage(message, 'Open Budget Settings', 'Refresh').then((action) => {
        if (action === 'Open Budget Settings') {
          void vscode.commands.executeCommand('codexCost.openSettings');
        } else if (action === 'Refresh') {
          void refreshAndNotify();
        }
      });
    },
    (keys) => {
      void context.globalState.update('codexCost.budgetNotificationKeys', keys);
    },
    context.globalState.get<string[]>('codexCost.budgetNotificationKeys', []),
    vscode.env.language
  );
  const refreshAndNotify = async (): Promise<void> => {
    await provider.refresh();
    const status = provider.getLatestBudgetStatus();
    if (readExtensionConfig().budgetNotificationsEnabled && status) budgetNotifications.notify(status, new Date());
  };
  const autoRefreshController = createAutoRefreshController(() => refreshAndNotify());
  const periodBoundaryController = createPeriodBoundaryController(() => refreshAndNotify());
  const dashboard = new CostDashboard({
    refresh: refreshAndNotify,
    configureDailyBudget: async () => {
      await vscode.commands.executeCommand('codexCost.configureDailyBudget');
    },
    copySummary: async () => {
      await vscode.commands.executeCommand('codexCost.copySummary');
    }
  });

  context.subscriptions.push(vscode.window.registerTreeDataProvider('codexCost.usage', provider));
  context.subscriptions.push(autoRefreshController);
  context.subscriptions.push(periodBoundaryController);
  context.subscriptions.push(dashboard);

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
    vscode.commands.registerCommand('codexCost.openCostControl', async () => {
      const action = await vscode.window.showQuickPick([
        { label: 'Open Cost Dashboard', value: 'dashboard' },
        { label: 'Refresh cost data', value: 'refresh' },
        { label: 'Configure daily budget', value: 'budget' },
        { label: 'Open Codex Cost settings', value: 'settings' }
      ], { placeHolder: buildCostControlQuickPickPlaceholder(provider.getLatestCostControl()) });

      if (action?.value === 'dashboard') {
        await vscode.commands.executeCommand('codexCost.openDashboard');
      } else if (action?.value === 'refresh') {
        await refreshAndNotify();
      } else if (action?.value === 'budget') {
        await vscode.commands.executeCommand('codexCost.configureDailyBudget');
      } else if (action?.value === 'settings') {
        await vscode.commands.executeCommand('codexCost.openSettings');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexCost.configureDailyBudget', async () => {
      const amountInput = await vscode.window.showInputBox({
        prompt: 'Set a positive daily USD budget',
        placeHolder: 'For example: 10.00',
        validateInput: validateDailyBudgetInput
      });
      if (amountInput === undefined || validateDailyBudgetInput(amountInput)) return;

      await vscode.workspace.getConfiguration('codexCost').update(
        'budget.dayAmount',
        Number(amountInput.trim()),
        vscode.ConfigurationTarget.Global
      );
      await refreshAndNotify();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexCost.copySummary', async () => {
      await provider.copySummary();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexCost.openDashboard', async () => {
      let control = provider.getLatestCostControl();
      if (!control) {
        await refreshAndNotify();
        control = provider.getLatestCostControl();
      }
      if (control) dashboard.show(control);
    })
  );

  provider.setDashboardUpdater((control) => dashboard.update(control));

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

  autoRefreshController.updateIntervalSeconds(initialConfiguration.autoRefreshSeconds);
  void refreshAndNotify();
}

export function deactivate(): void {}

function validateDailyBudgetInput(value: string): string | undefined {
  const amount = Number(value.trim());
  return Number.isFinite(amount) && amount > 0 ? undefined : 'Enter a positive USD amount.';
}
