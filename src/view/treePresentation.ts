import type { CostControlReport, SessionReportItem, UsageReport, ViewScope } from '../domain/types';
import { budgetPeriodLabel } from '../domain/timeWindows';
import {
  describeAutoRefresh,
  formatCostUsd,
  formatRefreshDescription,
  formatRefreshTimestamp,
  formatTokensDe
} from './costDisplay';
import { buildCostControlText } from './costControlPresentation';

export interface TreeNodeData {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  iconId?: string;
  command?: string;
  contextValue?: string;
  collapsibleState: 'none' | 'expanded';
  children?: TreeNodeData[];
}

export interface RefreshInfo {
  autoRefreshSeconds: number;
  lastRefreshAt?: Date;
}

export { formatCostUsd, formatTokensDe } from './costDisplay';

function leafNode(
  id: string,
  label: string,
  description?: string,
  tooltip?: string,
  iconId?: string,
  command?: string,
  contextValue?: string
): TreeNodeData {
  return {
    id,
    label,
    description,
    tooltip,
    iconId,
    command,
    contextValue,
    collapsibleState: 'none'
  };
}

function sectionNode(
  id: string,
  label: string,
  children: TreeNodeData[],
  description?: string,
  tooltip?: string,
  iconId?: string,
  command?: string,
  contextValue?: string
): TreeNodeData {
  return {
    id,
    label,
    description,
    tooltip,
    iconId,
    command,
    contextValue,
    collapsibleState: 'expanded',
    children
  };
}

function buildSessionTooltip(session: SessionReportItem): string {
  return [
    `Model: ${session.model ?? 'Unknown model'}`,
    `Updated: ${session.updatedAt}`,
    `Total tokens: ${formatTokensDe(session.tokens.totalTokens)}`,
    `Input: ${formatTokensDe(session.tokens.inputTokens)}`,
    `Cached input: ${formatTokensDe(session.tokens.cachedInputTokens)}`,
    `Output: ${formatTokensDe(session.tokens.outputTokens)}`,
    `Path: ${session.cwd ?? session.sessionId}`
  ].join('\n');
}

function buildRefreshTooltip(refreshInfo: RefreshInfo): string {
  const lines = [
    describeAutoRefresh(refreshInfo.autoRefreshSeconds),
    refreshInfo.lastRefreshAt ? `Last refreshed: ${formatRefreshTimestamp(refreshInfo.lastRefreshAt)}` : undefined,
    'Manual refresh updates immediately.'
  ];

  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

function buildFilterDescription(report: UsageReport): string {
  if (report.filter.state === 'active') {
    return report.filter.appliedStartDate ?? report.filter.rawStartDate ?? 'Active';
  }

  if (report.filter.state === 'invalid') {
    return 'Ignored';
  }

  return 'Off';
}

function buildFilterTooltip(report: UsageReport): string {
  if (report.filter.state === 'active') {
    return `Usage before ${report.filter.appliedStartDate} is hidden from the sidebar and workspace status items.`;
  }

  if (report.filter.state === 'invalid') {
    return `Invalid filter start date: ${report.filter.rawStartDate}. The filter is ignored.`;
  }

  return 'No fixed start-date filter is active.';
}

function buildBudgetDescription(report: UsageReport): string {
  const label = budgetPeriodLabel(report.budget.period);

  if (!report.budget.budgetAmount) {
    return `${label} no budget`;
  }

  return `${label} ${formatCostUsd(report.budget.spentCost, {
    approximate: report.budget.hasEstimatedCostGaps && report.budget.spentCost !== undefined,
    unavailableLabel: 'n/a'
  })}/${formatCostUsd(report.budget.budgetAmount)}`;
}

function buildBudgetTooltip(report: UsageReport, scope: ViewScope): string {
  const label = budgetPeriodLabel(report.budget.period);
  const lines = [
    `${label} budget for ${scope === 'workspace' ? 'the current workspace' : 'all sessions'}.`,
    report.budget.budgetAmount
      ? `Budget: ${formatCostUsd(report.budget.budgetAmount)}`
      : 'Budget: not configured',
    `Spent: ${formatCostUsd(report.budget.spentCost, {
      approximate: report.budget.hasEstimatedCostGaps && report.budget.spentCost !== undefined,
      unavailableLabel: 'n/a'
    })}`,
    `Warning threshold: ${report.budget.warningPercent}%`,
    report.budget.state === 'error'
      ? 'Status: over budget'
      : report.budget.state === 'warning'
        ? 'Status: warning threshold reached'
        : report.budget.state === 'none'
          ? 'Status: no budget configured'
          : 'Status: within budget',
    'Budget windows ignore the fixed filter.'
  ];

  return lines.join('\n');
}

function buildTodayNode(control: CostControlReport): TreeNodeData {
  const text = buildCostControlText(control);
  return sectionNode(
    'today',
    'Today',
    [
      leafNode('today-spent', 'Estimated spend', text.spentText, text.tooltip, 'dashboard', 'codexCost.openDashboard', 'codexCost.today'),
      leafNode(
        'today-budget',
        'Daily budget',
        text.budgetText ?? 'Not configured',
        text.budgetText ? 'Configured daily USD budget.' : 'Configure a positive daily USD budget.',
        text.budgetText ? 'dashboard' : 'gear',
        text.budgetText ? 'codexCost.openDashboard' : 'codexCost.configureDailyBudget',
        text.budgetText ? 'codexCost.today' : 'codexCost.dailyBudget'
      ),
      ...(text.remainingText ? [leafNode('today-remaining', 'Remaining', text.remainingText.replace('Remaining: ', ''), text.remainingText, 'check')] : []),
      ...(text.projectedText ? [leafNode('today-projected', 'Projection', text.projectedText.replace('Projected end of day: ', ''), text.projectedText, 'graph-line')] : []),
      leafNode('today-state', 'Status', text.label, text.tooltip, text.tone === 'error' ? 'error' : text.tone === 'warning' ? 'warning' : 'check', 'codexCost.openDashboard', 'codexCost.today')
    ],
    text.text.replace('Today ', ''),
    text.tooltip,
    text.tone === 'error' ? 'error' : text.tone === 'warning' ? 'warning' : 'dashboard',
    'codexCost.openDashboard',
    'codexCost.today'
  );
}

export function buildUsageTree(
  scope: ViewScope,
  report: UsageReport,
  refreshInfo: RefreshInfo,
  control: CostControlReport
): TreeNodeData[] {
  const nodes: TreeNodeData[] = [
    buildTodayNode(control),
    leafNode(
      'scope',
      'Scope',
      scope === 'workspace' ? 'Workspace' : 'All Sessions',
      'Current report scope',
      scope === 'workspace' ? 'folder-opened' : 'globe'
    ),
    leafNode(
      'filter',
      'Filter start',
      buildFilterDescription(report),
      buildFilterTooltip(report),
      report.filter.state === 'invalid' ? 'warning' : 'calendar'
    ),
    leafNode(
      'refresh',
      'Refresh',
      formatRefreshDescription(refreshInfo.autoRefreshSeconds),
      buildRefreshTooltip(refreshInfo),
      'history'
    ),
    leafNode(
      'budget',
      'Budget',
      buildBudgetDescription(report),
      buildBudgetTooltip(report, scope),
      report.budget.state === 'error'
        ? 'error'
        : report.budget.state === 'warning'
          ? 'warning'
          : 'dashboard'
    ),
    sectionNode('summary', 'Summary', [
      leafNode(
        'summary-cost',
        'Estimated cost',
        formatCostUsd(report.summary.estimatedCost, {
          approximate: report.hasEstimatedCostGaps && report.summary.estimatedCost !== undefined
        })
      ),
      leafNode('summary-total', 'Total tokens', formatTokensDe(report.summary.totalTokens)),
      leafNode('summary-input', 'Input', formatTokensDe(report.summary.inputTokens)),
      leafNode('summary-cached', 'Cached input', formatTokensDe(report.summary.cachedInputTokens)),
      leafNode('summary-output', 'Output', formatTokensDe(report.summary.outputTokens)),
      leafNode('summary-sessions', 'Sessions', formatTokensDe(report.summary.sessionsCount))
    ], undefined, undefined, undefined, undefined, 'codexCost.copyable')
  ];

  if (report.models.length > 0) {
    nodes.push(
      sectionNode(
        'models',
        'Per-model breakdown',
        report.models.map((model) =>
          sectionNode(
            `model-${model.model}`,
            model.model,
            [
              leafNode(`model-${model.model}-total`, 'Total', formatTokensDe(model.totalTokens)),
              leafNode(`model-${model.model}-input`, 'Input', formatTokensDe(model.inputTokens)),
              leafNode(`model-${model.model}-cached`, 'Cached input', formatTokensDe(model.cachedInputTokens)),
              leafNode(`model-${model.model}-output`, 'Output', formatTokensDe(model.outputTokens)),
              leafNode(`model-${model.model}-sessions`, 'Sessions', formatTokensDe(model.sessionCount))
            ],
            formatCostUsd(model.estimatedCost, {
              approximate: !model.hasPricing && model.estimatedCost !== undefined
            }),
            `${formatTokensDe(model.totalTokens)} total tokens`,
            'hubot',
            undefined,
            'codexCost.copyable'
          )
        )
      )
    );
  }

  if (report.sessions.length > 0) {
    nodes.push(
      sectionNode(
        'sessions',
        'Recent sessions',
        report.sessions.map((session, index) =>
          leafNode(
            `session-${session.sessionId}-${index}`,
            session.label,
            formatCostUsd(session.estimatedCost, {
              approximate: !session.hasPricing && session.estimatedCost !== undefined
            }),
            buildSessionTooltip(session),
            'history',
            undefined,
            'codexCost.copyable'
          )
        )
      )
    );
  }

  if (report.warnings.length > 0) {
    nodes.push(
      sectionNode(
        'warnings',
        'Warnings',
        report.warnings.map((warning, index) =>
          leafNode(`warning-${index}`, warning, undefined, warning, 'warning')
        )
      )
    );
  }

  if (report.summary.sessionsCount === 0) {
    nodes.push(
      leafNode(
        'no-data',
        'No matching Codex usage found',
        scope === 'workspace' ? 'Switch to All Sessions to inspect machine-wide data' : 'No token_count records were parsed',
        undefined,
        'info'
      )
    );
  }

  return nodes;
}
