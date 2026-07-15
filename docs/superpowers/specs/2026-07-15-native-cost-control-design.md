# Native Cost Control Design

Date: 2026-07-15
Status: Approved for implementation

## Goal

Turn Codex Cost from a passive usage report into a local, action-oriented daily cost control tool in VS Code. Within a few seconds, a user must be able to see today's estimated workspace spend, the configured daily budget, whether the current pace is safe, and where the spend came from.

## Product Decisions

- The product remains local-only. It reads existing Codex session logs, sends no data, and does not use authentication or network requests at runtime.
- The primary control is the configured daily USD budget. Codex rate limits and subscription quotas are deliberately out of scope.
- The existing sidebar remains the explanation surface; the status bar is the immediate decision surface; an editor dashboard provides a deeper visual view.
- All monetary values remain API-equivalent estimates and must retain that wording in user-facing copy.
- No third-party charting or UI dependency is added. The dashboard uses a theme-aware VS Code webview with semantic HTML, CSS, and inline SVG.

## User Experience

### 1. Native control loop

The budget status-bar item is always about today's workspace usage. With a configured daily budget it reads, for example, `Today $4.20/$10.00 · On track`; at or above the warning threshold it becomes `Watch`; at or above the budget it becomes `Over budget`. Its tooltip explains spent amount, budget, remaining amount, elapsed-day projection, and whether pricing gaps make the value approximate.

Clicking any cost status-bar item opens the Cost Dashboard instead of merely refreshing. Refresh remains available from the sidebar title and Command Palette.

`Codex Cost: Open Cost Control` opens a native Quick Pick with the same current-state summary and these actions: open the dashboard, refresh, configure the daily budget, and open settings. The Quick Pick never changes settings without an explicit action.

### 2. Actionable sidebar and setup

The sidebar starts with a `Today` section containing spent/budget, remaining amount, projected end-of-day spend, and an on-track/watch/over-budget state. It continues to show the existing summary, per-model breakdown, recent sessions, and warnings.

The meaningful leaf rows offer at most one primary click action and context-menu actions:

- `Today` and any status value open the dashboard.
- A missing daily budget opens the daily-budget input flow.
- A missing-log state offers settings for log roots.
- Summary and model/session sections offer `Copy Cost Summary` from the view title or context menu.

`Configure Daily Budget` uses a VS Code input box, accepts a positive decimal USD amount, writes only `codexCost.budget.dayAmount`, and refreshes the report. Empty, invalid, or zero input leaves configuration unchanged and shows a clear validation message.

### 3. Editor dashboard

The dashboard opens in an editor tab. It shows a compact header for today's spend, daily budget, remaining amount, projection, and state; a seven-day spend chart; a per-model cost breakdown; and the most recent sessions. It uses the active VS Code theme and is keyboard accessible.

The dashboard offers `Refresh`, `Configure daily budget`, and `Copy summary` actions. It receives fresh data after a refresh when it is already open. A dashboard never exposes prompt or response content.

## Domain Design

Introduce a focused cost-control domain module. It consumes already parsed sessions and the existing pricing, scope, source-filter, and workspace-matching rules. It reuses session usage deltas so each token is attributed once.

The module returns:

- the current day summary;
- daily budget state and remaining amount;
- an end-of-day projection derived from elapsed local time, with `undefined` projection at local midnight or when no priced usage exists;
- seven calendar-day totals ending today;
- model and recent-session breakdowns for the selected workspace scope.

For an incomplete pricing map, known model usage contributes to money totals and unknown model usage marks all affected money summaries as approximate. Token counts and sessions continue to display.

## Commands and Contributions

Add these commands:

- `codexCost.openCostControl`
- `codexCost.openDashboard`
- `codexCost.configureDailyBudget`
- `codexCost.copySummary`

The existing refresh, scope, and settings commands stay unchanged. Add contextual view/item actions using VS Code tree-view menus; do not turn every tree item into a button.

## Error Handling

- No daily budget: show `Set daily budget` and a neutral state; do not calculate a safety claim.
- Missing pricing: show the existing estimate marker and explain that the projection is partial.
- No matching usage: show zero spend and no projection; preserve existing no-log guidance.
- Invalid budget input: keep the current setting untouched and ask for a positive number.
- A dashboard rendering failure must not prevent sidebar or status-bar refreshes; errors go to the existing output channel.

## Testing

Unit tests cover daily projection, state labels, budget edge cases, incomplete pricing, seven-day aggregation, dashboard HTML escaping/presentation, and sidebar action metadata. Extension-command integration is kept thin and manually exercised in an Extension Development Host after automated checks.

## Acceptance Criteria

1. The status bar answers whether today's configured local cost budget is safe, watch-level, or exceeded.
2. The status bar and sidebar can open a dashboard without losing existing refresh functionality.
3. The sidebar explains today’s projected spend and secondary cost drivers, and offers direct actions for the common missing-data cases.
4. The editor dashboard shows today, seven days, model costs, and recent sessions with no external dependency or runtime network traffic.
5. Invalid budget input and incomplete pricing retain safe, explicit behavior.
6. The complete automated check and package verification pass.
