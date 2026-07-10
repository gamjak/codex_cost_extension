import type { BudgetStatus } from './domain/types';

type NotificationThreshold = 'warning' | 'exceeded';

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
  private readonly notified = new Set<string>();

  constructor(private readonly notifyUser: (message: string) => void) {}

  notify(status: BudgetStatus, now: Date): void {
    const threshold = thresholdFor(status);
    if (!threshold || status.budgetAmount === undefined || status.spentCost === undefined || status.hasEstimatedCostGaps) return;

    const key = `${periodKey(status, now)}:${threshold}`;
    if (this.notified.has(key)) return;
    this.notified.add(key);

    const period = status.period.charAt(0).toUpperCase() + status.period.slice(1);
    const spent = `$${status.spentCost.toFixed(2)}`;
    const budget = `$${status.budgetAmount.toFixed(2)}`;
    this.notifyUser(threshold === 'warning'
      ? `Codex Cost: ${period} budget reached ${status.warningPercent}% — ${spent} of ${budget}.`
      : `Codex Cost: ${period} budget exceeded — ${spent} of ${budget}.`);
  }
}
