import * as os from 'node:os';
import * as path from 'node:path';

import * as vscode from 'vscode';

import type { BudgetPeriod, BudgetSettings, PricingByModel, StatusBarVisibility, ViewScope } from './domain/types';

export interface ExtensionConfig {
  logRoots: string[];
  pricingByModel: PricingByModel;
  scopeDefault: ViewScope;
  autoRefreshSeconds: number;
  filterStartDate: string;
  budgetSettings: BudgetSettings;
  statusBarVisibility: StatusBarVisibility;
  statusBarBudgetPeriod: BudgetPeriod;
}

function resolveHomePath(input: string): string {
  const homeDirectory = process.env.USERPROFILE ?? os.homedir();

  return path.resolve(
    input
      .replace(/^~(?=$|[\\/])/, homeDirectory)
      .replace(/%USERPROFILE%/gi, homeDirectory)
  );
}

function normalizePricing(value: unknown): PricingByModel {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const pricing: PricingByModel = {};

  for (const [model, candidate] of entries) {
    if (typeof candidate !== 'object' || candidate === null) {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const validPrice = (candidateValue: unknown): candidateValue is number =>
      typeof candidateValue === 'number' && Number.isFinite(candidateValue) && candidateValue >= 0;
    const inputPer1M = validPrice(record.inputPer1M) ? record.inputPer1M : undefined;
    const cachedInputPer1M = validPrice(record.cachedInputPer1M) ? record.cachedInputPer1M : undefined;
    const outputPer1M = validPrice(record.outputPer1M) ? record.outputPer1M : undefined;

    if (inputPer1M === undefined || cachedInputPer1M === undefined || outputPer1M === undefined) {
      continue;
    }

    pricing[model] = {
      inputPer1M,
      cachedInputPer1M,
      outputPer1M
    };
  }

  return pricing;
}

function normalizeAutoRefreshSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 60;
  }

  return Math.min(86_400, Math.max(0, Math.floor(value)));
}

function normalizePositiveNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function normalizeWarningPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 80;
  }

  return Math.min(100, Math.max(0, value));
}

function normalizeFilterStartDate(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBudgetPeriod(value: unknown): BudgetPeriod {
  return value === 'day' || value === 'week' || value === 'month' ? value : 'month';
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function readExtensionConfig(): ExtensionConfig {
  const configuration = vscode.workspace.getConfiguration('codexCost');

  const configuredRoots = configuration.get<unknown>('logRoots');
  const rawRoots = Array.isArray(configuredRoots)
    ? configuredRoots.filter((root): root is string => typeof root === 'string')
    : ['%USERPROFILE%/.codex/sessions'];
  const rawScopeDefault = configuration.get<string>('scopeDefault', 'workspace');
  const scopeDefault: ViewScope = rawScopeDefault === 'all' ? 'all' : 'workspace';
  const rawPricing = configuration.get<Record<string, unknown>>('pricing.models', {});
  const autoRefreshSeconds = normalizeAutoRefreshSeconds(configuration.get<number>('autoRefreshSeconds', 60));
  const filterStartDate = normalizeFilterStartDate(configuration.get<string>('filter.startDate', ''));
  const budgetSettings: BudgetSettings = {
    dayAmount: normalizePositiveNumber(configuration.get<number>('budget.dayAmount', 0)),
    weekAmount: normalizePositiveNumber(configuration.get<number>('budget.weekAmount', 0)),
    monthAmount: normalizePositiveNumber(configuration.get<number>('budget.monthAmount', 0)),
    warningPercent: normalizeWarningPercent(configuration.get<number>('budget.warningPercent', 80))
  };
  const statusBarVisibility: StatusBarVisibility = {
    showSession: normalizeBoolean(configuration.get<boolean>('statusBar.showSession', true), true),
    showWorkspace: normalizeBoolean(configuration.get<boolean>('statusBar.showWorkspace', true), true),
    showBudget: normalizeBoolean(configuration.get<boolean>('statusBar.showBudget', true), true)
  };
  const statusBarBudgetPeriod = normalizeBudgetPeriod(configuration.get<string>('statusBar.budgetPeriod', 'month'));

  return {
    logRoots: Array.from(new Set(rawRoots.filter((root) => root.trim()).map(resolveHomePath))),
    pricingByModel: normalizePricing(rawPricing),
    scopeDefault,
    autoRefreshSeconds,
    filterStartDate,
    budgetSettings,
    statusBarVisibility,
    statusBarBudgetPeriod
  };
}
