let tokenFormatter: Intl.NumberFormat;
let costFormatter: Intl.NumberFormat;

export function configureDisplay(locale = 'de-DE'): void {
  let normalizedLocale = locale;
  try {
    Intl.getCanonicalLocales(locale);
  } catch {
    normalizedLocale = 'en-US';
  }

  tokenFormatter = new Intl.NumberFormat(normalizedLocale);
  costFormatter = new Intl.NumberFormat(normalizedLocale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

configureDisplay();

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
