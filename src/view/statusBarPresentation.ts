import type { SessionReportItem, StatusBarVisibility, UsageReport } from '../domain/types';
import { budgetPeriodLabel } from '../domain/timeWindows';
import { describeAutoRefresh, formatCostUsd, formatRefreshTimestamp, formatTokensDe } from './costDisplay';

export interface StatusBarEntry {
  text: string;
  tooltip: string;
  visible: boolean;
  tone: 'default' | 'warning' | 'error';
}

export interface StatusBarEntries {
  session: StatusBarEntry;
  workspace: StatusBarEntry;
  budget: StatusBarEntry;
}

export interface StatusBarPresentationOptions {
  autoRefreshSeconds: number;
  visibility: StatusBarVisibility;
}

function describeFilter(report: UsageReport): string {
  if (report.filter.state === 'active') {
    return `Filter start: ${report.filter.appliedStartDate}`;
  }

  if (report.filter.state === 'invalid') {
    return `Filter start: ignored (${report.filter.rawStartDate})`;
  }

  return 'Filter start: off';
}

function formatSessionCost(session: SessionReportItem | undefined): string {
  if (!session) {
    return 'n/a';
  }

  return formatCostUsd(session.estimatedCost, {
    approximate: !session.hasPricing && session.estimatedCost !== undefined,
    unavailableLabel: 'n/a'
  });
}

function buildSessionTooltip(session: SessionReportItem, report: UsageReport, autoRefreshSeconds: number): string {
  return [
    `Latest workspace session: ${session.label}`,
    describeFilter(report),
    `Updated: ${session.updatedAt}`,
    `Model: ${session.model ?? 'Unknown model'}`,
    `Total tokens: ${formatTokensDe(session.tokens.totalTokens)}`,
    session.estimatedCost === undefined
      ? 'Estimated cost: n/a (missing pricing)'
      : `Estimated cost: ${formatCostUsd(session.estimatedCost, {
          approximate: !session.hasPricing
        })}`,
    describeAutoRefresh(autoRefreshSeconds),
    'Click to refresh now.'
  ].join('\n');
}

function buildEmptySessionEntry(visible: boolean, report: UsageReport, autoRefreshSeconds: number): StatusBarEntry {
  return {
    text: '$(history) Session n/a',
    tooltip: [
      'No workspace session with filtered token usage found.',
      describeFilter(report),
      describeAutoRefresh(autoRefreshSeconds),
      'Click to refresh now.'
    ].join('\n'),
    visible,
    tone: 'default'
  };
}

function buildWorkspaceTooltip(report: UsageReport, autoRefreshSeconds: number): string {
  const lines = [
    describeFilter(report),
    `Workspace sessions: ${formatTokensDe(report.summary.sessionsCount)}`,
    `Total tokens: ${formatTokensDe(report.summary.totalTokens)}`,
    report.summary.estimatedCost === undefined
      ? 'Estimated cost: n/a (missing pricing)'
      : `Estimated cost: ${formatCostUsd(report.summary.estimatedCost, {
          approximate: report.hasEstimatedCostGaps
        })}`,
    report.hasEstimatedCostGaps
      ? `Sessions with estimate: ${formatTokensDe(report.sessions.filter((session) => session.estimatedCost !== undefined).length)}`
      : undefined,
    describeAutoRefresh(autoRefreshSeconds),
    'Click to refresh now.'
  ];

  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

function buildBudgetText(report: UsageReport): string {
  const label = budgetPeriodLabel(report.budget.period);

  if (!report.budget.budgetAmount) {
    return `$(dashboard) ${label} no budget`;
  }

  return `$(dashboard) ${label} ${formatCostUsd(report.budget.spentCost, {
    approximate: report.budget.hasEstimatedCostGaps && report.budget.spentCost !== undefined,
    unavailableLabel: 'n/a'
  })}/${formatCostUsd(report.budget.budgetAmount)}`;
}

function buildBudgetTooltip(report: UsageReport, autoRefreshSeconds: number): string {
  const label = budgetPeriodLabel(report.budget.period);
  const lines = [
    `${label} budget window`,
    report.budget.budgetAmount
      ? `Budget: ${formatCostUsd(report.budget.budgetAmount)}`
      : 'Budget: not configured',
    `Spent: ${formatCostUsd(report.budget.spentCost, {
      approximate: report.budget.hasEstimatedCostGaps && report.budget.spentCost !== undefined,
      unavailableLabel: 'n/a'
    })}`,
    `Warning threshold: ${report.budget.warningPercent}%`,
    'Budget windows ignore the fixed filter.',
    describeAutoRefresh(autoRefreshSeconds),
    'Click to refresh now.'
  ];

  return lines.join('\n');
}

function budgetTone(report: UsageReport): 'default' | 'warning' | 'error' {
  if (report.budget.state === 'error') {
    return 'error';
  }

  if (report.budget.state === 'warning') {
    return 'warning';
  }

  return 'default';
}

export function buildStatusBarEntries(
  report: UsageReport,
  options: StatusBarPresentationOptions
): StatusBarEntries {
  const currentSession = report.sessions[0];

  const session = currentSession
    ? {
        text: `$(history) Session ${formatSessionCost(currentSession)}`,
        tooltip: buildSessionTooltip(currentSession, report, options.autoRefreshSeconds),
        visible: options.visibility.showSession,
        tone: 'default' as const
      }
    : buildEmptySessionEntry(options.visibility.showSession, report, options.autoRefreshSeconds);

  const workspace: StatusBarEntry = report.summary.sessionsCount === 0
    ? {
        text: '$(folder-opened) Workspace n/a',
        tooltip: [
          'No workspace usage matched the active filter.',
          describeFilter(report),
          describeAutoRefresh(options.autoRefreshSeconds),
          'Click to refresh now.'
        ].join('\n'),
        visible: options.visibility.showWorkspace,
        tone: 'default'
      }
    : {
        text: `$(folder-opened) Workspace ${formatCostUsd(report.summary.estimatedCost, {
          approximate: report.hasEstimatedCostGaps && report.summary.estimatedCost !== undefined,
          unavailableLabel: 'n/a'
        })}`,
        tooltip: buildWorkspaceTooltip(report, options.autoRefreshSeconds),
        visible: options.visibility.showWorkspace,
        tone: 'default'
      };

  const budget: StatusBarEntry = {
    text: buildBudgetText(report),
    tooltip: buildBudgetTooltip(report, options.autoRefreshSeconds),
    visible: options.visibility.showBudget,
    tone: budgetTone(report)
  };

  if (!currentSession) {
    return { session, workspace, budget };
  }

  const refreshTimestamp = formatRefreshTimestamp(new Date(currentSession.updatedAt));
  if (refreshTimestamp) {
    session.tooltip = `${session.tooltip}\nLatest session timestamp: ${refreshTimestamp}`;
  }

  return { session, workspace, budget };
}
