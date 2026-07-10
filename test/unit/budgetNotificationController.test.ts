import { describe, expect, it } from 'vitest';

import { BudgetNotificationController } from '../../src/budgetNotificationController';
import type { BudgetStatus } from '../../src/domain/types';

function status(overrides: Partial<BudgetStatus> = {}): BudgetStatus {
  return {
    period: 'month',
    spentCost: 80,
    budgetAmount: 100,
    warningPercent: 80,
    hasEstimatedCostGaps: false,
    state: 'warning',
    ...overrides
  };
}

describe('BudgetNotificationController', () => {
  it('notifies once at warning and once at exceeded for a calendar period', () => {
    const messages: string[] = [];
    const controller = new BudgetNotificationController((message) => messages.push(message));

    controller.notify(status(), new Date(2026, 6, 10, 12));
    controller.notify(status(), new Date(2026, 6, 10, 12));
    controller.notify(status({ state: 'error', spentCost: 101 }), new Date(2026, 6, 10, 13));
    controller.notify(status({ state: 'error', spentCost: 101 }), new Date(2026, 6, 10, 14));

    expect(messages).toEqual([
      'Codex Cost: Month budget reached 80% — $80.00 of $100.00.',
      'Codex Cost: Month budget exceeded — $101.00 of $100.00.'
    ]);
  });

  it('resets notification state for the next calendar period', () => {
    const messages: string[] = [];
    const controller = new BudgetNotificationController((message) => messages.push(message));

    controller.notify(status(), new Date(2026, 6, 31, 23, 59));
    controller.notify(status(), new Date(2026, 7, 1, 0, 1));

    expect(messages).toHaveLength(2);
  });

  it('ignores unconfigured budgets and unreliable estimates', () => {
    const messages: string[] = [];
    const controller = new BudgetNotificationController((message) => messages.push(message));

    controller.notify(status({ budgetAmount: undefined }), new Date(2026, 6, 10));
    controller.notify(status({ hasEstimatedCostGaps: true }), new Date(2026, 6, 10));
    controller.notify(status({ state: 'neutral' }), new Date(2026, 6, 10));

    expect(messages).toEqual([]);
  });

  it('restores persisted notification keys after an extension restart', () => {
    const messages: string[] = [];
    let persisted: readonly string[] = [];
    const first = new BudgetNotificationController((message) => messages.push(message), (keys) => {
      persisted = keys;
    });
    first.notify(status(), new Date(2026, 6, 10, 12));

    const second = new BudgetNotificationController((message) => messages.push(message), undefined, persisted);
    second.notify(status(), new Date(2026, 6, 10, 13));

    expect(messages).toHaveLength(1);
  });
});
