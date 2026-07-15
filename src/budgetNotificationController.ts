import type { BudgetStatus } from './domain/types';

type NotificationThreshold = 'warning' | 'exceeded';

export type PersistNotificationKeys = (keys: readonly string[]) => void;

function periodKey(status: BudgetStatus, now: Date): string {
  if (status.period === 'day') {
    return `${status.period}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  }
  if (status.period === 'month') {
    return `${status.period}:${now.getFullYear()}-${now.getMonth()}`;
  }
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  const distanceToMonday = monday.getDay() === 0 ? 6 : monday.getDay() - 1;
  monday.setDate(monday.getDate() - distanceToMonday);
  return `${status.period}:${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
}

function thresholdFor(status: BudgetStatus): NotificationThreshold | undefined {
  if (status.state === 'error') return 'exceeded';
  return status.state === 'warning' ? 'warning' : undefined;
}

export class BudgetNotificationController {
  private readonly notified: Set<string>;

  constructor(
    private readonly notifyUser: (message: string) => void,
    private readonly persistKeys: PersistNotificationKeys = () => undefined,
    initialKeys: readonly string[] = [],
    private readonly locale = 'en-US'
  ) {
    this.notified = new Set(initialKeys.slice(-100));
  }

  private formatMoney(value: number): string {
    try {
      return new Intl.NumberFormat(this.locale, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    } catch {
      return `$${value.toFixed(2)}`;
    }
  }

  private remember(key: string): boolean {
    if (this.notified.has(key)) return false;
    this.notified.add(key);
    while (this.notified.size > 100) {
      const oldest = this.notified.values().next().value;
      if (oldest === undefined) break;
      this.notified.delete(oldest);
    }
    this.persistKeys(Array.from(this.notified));
    return true;
  }

  notify(status: BudgetStatus, now: Date, everyAmount = 0): void {
    const threshold = thresholdFor(status);
    if (status.spentCost === undefined || status.hasEstimatedCostGaps) return;

    const periodKeyValue = periodKey(status, now);

    if (threshold && status.budgetAmount !== undefined && this.remember(`${periodKeyValue}:${threshold}`)) {
      const period = status.period.charAt(0).toUpperCase() + status.period.slice(1);
      const spent = this.formatMoney(status.spentCost);
      const budget = this.formatMoney(status.budgetAmount);
      this.notifyUser(threshold === 'warning'
        ? `Codex Cost: ${period} budget reached ${status.warningPercent}% — ${spent} of ${budget}.`
        : `Codex Cost: ${period} budget exceeded — ${spent} of ${budget}.`);
    }

    if (!Number.isFinite(everyAmount) || everyAmount <= 0) return;
    const checkpoint = Math.floor(status.spentCost / everyAmount) * everyAmount;
    if (checkpoint < everyAmount) return;
    if (this.remember(`${periodKeyValue}:spending:${everyAmount}:${checkpoint}`)) {
      const period = status.period.charAt(0).toUpperCase() + status.period.slice(1);
      this.notifyUser(`Codex Cost: ${period} spending reached ${this.formatMoney(checkpoint)}.`);
    }
  }
}
