import * as vscode from 'vscode';

import type { CostControlReport } from '../domain/types';
import { buildDashboardHtml } from './dashboardPresentation';

type DashboardMessage = { type: 'refresh' | 'configureDailyBudget' | 'copySummary' };

export interface CostDashboardActions {
  refresh(): Promise<void>;
  configureDailyBudget(): Promise<void>;
  copySummary(): Promise<void>;
}

function isDashboardMessage(value: unknown): value is DashboardMessage {
  return typeof value === 'object' && value !== null && 'type' in value && (
    value.type === 'refresh' || value.type === 'configureDailyBudget' || value.type === 'copySummary'
  );
}

function createNonce(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

export class CostDashboard implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly actions: CostDashboardActions) {}

  show(control: CostControlReport): void {
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn);
      this.render(control);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'codexCost.dashboard',
      'Codex Cost Dashboard',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel = panel;
    panel.onDidDispose(() => {
      if (this.panel === panel) this.panel = undefined;
    });
    panel.webview.onDidReceiveMessage(async (message: unknown) => this.handleMessage(message));
    this.render(control);
  }

  update(control: CostControlReport): void {
    if (this.panel) this.render(control);
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private render(control: CostControlReport): void {
    if (this.panel) this.panel.webview.html = buildDashboardHtml(control, createNonce());
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isDashboardMessage(message)) return;
    if (message.type === 'refresh') await this.actions.refresh();
    else if (message.type === 'configureDailyBudget') await this.actions.configureDailyBudget();
    else await this.actions.copySummary();
  }
}
