const tokenFormatter = new Intl.NumberFormat('de-DE');
const costFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

interface FormatCostOptions {
  approximate?: boolean;
  unavailableLabel?: string;
}

export function formatTokensDe(value: number): string {
  return tokenFormatter.format(value);
}

export function formatCostUsd(value: number | undefined, options: FormatCostOptions = {}): string {
  if (value === undefined) {
    return options.unavailableLabel ?? 'Unavailable';
  }

  const formatted = costFormatter.format(value).replace(/\u00A0/g, ' ');
  return options.approximate ? `~${formatted}` : formatted;
}

export function formatRefreshDescription(autoRefreshSeconds: number): string {
  return autoRefreshSeconds > 0 ? `Every ${autoRefreshSeconds}s` : 'Off';
}

export function describeAutoRefresh(autoRefreshSeconds: number): string {
  return autoRefreshSeconds > 0 ? `Auto-refresh: every ${autoRefreshSeconds}s` : 'Auto-refresh: off';
}

export function formatRefreshTimestamp(timestamp: Date | undefined): string | undefined {
  if (!timestamp) {
    return undefined;
  }

  return timestamp.toLocaleString('de-DE');
}
