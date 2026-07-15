import type { BudgetState, CostControlReport } from '../domain/types';
import { formatCostUsd } from './costDisplay';

export interface CostControlText {
  label: 'On track' | 'Watch' | 'Over budget' | 'Set daily budget';
  text: string;
  tooltip: string;
  spentText: string;
  budgetText?: string;
  remainingText?: string;
  projectedText?: string;
  tone: 'default' | 'warning' | 'error';
}

function controlLabel(state: BudgetState): CostControlText['label'] {
  if (state === 'error') return 'Over budget';
  if (state === 'warning') return 'Watch';
  if (state === 'none') return 'Set daily budget';
  return 'On track';
}

function controlTone(state: BudgetState): CostControlText['tone'] {
  if (state === 'error') return 'error';
  if (state === 'warning') return 'warning';
  return 'default';
}

export function buildCostControlText(control: CostControlReport): CostControlText {
  const { budget } = control.today;
  const approximate = control.today.hasEstimatedCostGaps || budget.hasEstimatedCostGaps;
  const spentText = formatCostUsd(budget.spentCost, { approximate, unavailableLabel: 'n/a' });
  const budgetText = budget.budgetAmount === undefined ? undefined : formatCostUsd(budget.budgetAmount);
  const remainingText = control.remainingCost === undefined
    ? undefined
    : `Remaining: ${formatCostUsd(control.remainingCost, { approximate })}`;
  const projectedText = control.projectedCost === undefined
    ? undefined
    : `Projected end of day: ${formatCostUsd(control.projectedCost, { approximate })}`;
  const label = controlLabel(budget.state);
  const text = `Today ${spentText}${budgetText ? `/${budgetText}` : ''} · ${label}`;
  const tooltip = [
    text,
    remainingText,
    projectedText,
    approximate ? 'Estimate is partial because pricing is missing for some usage.' : undefined,
    'Estimated local Codex cost; pricing may differ from billed usage.'
  ].filter((line): line is string => Boolean(line)).join('\n');

  return {
    label,
    text,
    tooltip,
    spentText,
    budgetText,
    remainingText,
    projectedText,
    tone: controlTone(budget.state)
  };
}

export function buildCostSummaryText(control: CostControlReport): string {
  const text = buildCostControlText(control);
  return [
    text.text,
    text.remainingText,
    text.projectedText,
    'Estimated local Codex cost; pricing may differ from billed usage.'
  ].filter((line): line is string => Boolean(line)).join('\n');
}
