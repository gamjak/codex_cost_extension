# Budget notifications design

## Goal

Notify the user when a configured day, week, or month budget reaches its warning threshold and when it reaches 100%.

## Behavior

- Notifications are emitted once per threshold (`warning` and `exceeded`) per budget period.
- The period key includes the budget type and its current calendar window, so state resets automatically at the next day, Monday, or month.
- No notification is emitted when the period has no configured budget.
- No notification is emitted when the budget status has no reliable estimated cost because of pricing gaps.
- Existing status-bar and sidebar behavior remains unchanged.
- Notification text includes period, spent amount, budget amount, and percentage.

## Design

Add a small `BudgetNotificationController` with an injected notification callback. It receives the already calculated `BudgetStatus` after each refresh and tracks notified period/threshold keys in memory. The extension activation wires it to `vscode.window.showWarningMessage` and calls it after a successful provider refresh. Refresh failures do not produce budget notifications.

The controller is deliberately independent of VS Code so threshold transitions and period resets can be unit-tested without an extension host.

## Testing

Tests cover:

- warning notification at the configured threshold
- exceeded notification at 100%
- no duplicate notification on repeated refreshes
- separate notifications for separate budget periods
- reset when the calendar period changes
- no notification for unconfigured budgets or unreliable estimates

