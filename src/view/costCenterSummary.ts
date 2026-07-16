import type { CostCenterReport } from '../domain/costCenterTypes';

const number = new Intl.NumberFormat('en-US');
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function summaryLabel(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean);
  return value.includes('\\') || value.includes('/') ? (parts.at(-1) ?? 'Local item') : value;
}

export function buildCostCenterSummaryText(report: CostCenterReport): string {
  const cost = report.summary.cost.value === undefined
    ? 'Unavailable'
    : `${report.summary.cost.partial ? 'approximately ' : ''}${usd.format(report.summary.cost.value)}`;
  const lines = [
    'Codex Cost Center summary',
    `Period: ${report.rangeLabel}`,
    `Scope: ${report.filters.scope === 'workspace' ? 'Workspace' : 'All sessions'}`,
    `Estimated cost: ${cost}`,
    `Tokens: ${number.format(report.summary.totalTokens)} tokens`,
    `Sessions: ${number.format(report.summary.sessionCount)}`,
    `Budget: ${report.budget.explanation}`
  ];
  for (const [label, driver] of [['Session', report.drivers.session], ['Project', report.drivers.project], ['Model', report.drivers.model]] as const) {
    if (driver) lines.push(`Top ${label.toLowerCase()}: ${summaryLabel(driver.label)} (${driver.cost === undefined ? 'Unavailable' : usd.format(driver.cost)})`);
  }
  lines.push('Generated locally from the active Cost Center filters.');
  return lines.join('\n');
}
