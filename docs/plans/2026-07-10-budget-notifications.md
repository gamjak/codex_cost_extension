# Budget Notifications Implementation Plan

> **For agentic workers:** Implement task-by-task with TDD and verify each checkpoint.

**Goal:** Show one VS Code warning at the configured warning threshold and once at 100% for each calendar budget period.

**Architecture:** Add a VS Code-independent controller that consumes `BudgetStatus`, derives a calendar period key, and remembers emitted threshold keys in memory. Wire it after successful refreshes in `extension.ts`; keep existing report and status-bar behavior unchanged.

**Tech Stack:** TypeScript, VS Code extension API, Vitest.

---

### Task 1: Budget notification controller

**Files:**
- Create: `src/budgetNotificationController.ts`
- Test: `test/unit/budgetNotificationController.test.ts`

- [ ] Write tests for warning/exceeded thresholds, duplicate suppression, period reset, and ignored statuses.
- [ ] Run the focused test and confirm it fails because the controller does not exist.
- [ ] Implement `BudgetNotificationController.notify(status, now)` with an injected `(message: string) => void` callback, keys based on budget period plus calendar window, and threshold states `warning` and `error`.
- [ ] Run the focused test and confirm it passes.

### Task 2: Integrate notifications after refresh

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/view/costTreeProvider.ts`
- Test: existing provider/extension-adjacent unit coverage where applicable.

- [ ] Expose the latest successfully calculated `BudgetStatus` from the provider through a small callback or result property without changing tree rendering.
- [ ] Instantiate the controller in `activate` using `vscode.window.showWarningMessage`.
- [ ] Invoke it only after successful refresh completion, using the active status-bar budget period and current budget status.
- [ ] Ensure refresh failures do not produce notifications.
- [ ] Add or update tests for the integration boundary if the existing provider design permits isolated coverage.

### Task 3: Documentation and verification

**Files:**
- Modify: `README.md`
- Modify: `package.json` only if a test command needs adjustment.

- [ ] Document one-time warning behavior, threshold configuration, and in-memory reset behavior.
- [ ] Run TypeScript compilation and ESLint.
- [ ] Run the complete Vitest suite; if the sandbox blocks worker creation, record the exact limitation and run the narrowest available verification.
- [ ] Review the final diff for scope, generated files, and accidental changes.

