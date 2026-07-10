# Codex Cost Controls Design

Date: 2026-06-05
Status: Drafted for review

## Goal

Extend the existing Codex Cost VS Code extension with:

- a fixed start-date filter for displayed usage
- configurable day/week/month budgets
- budget warning states in the status bar
- configurable visibility of status bar entries

All interaction stays inside standard VS Code surfaces:

- extension settings
- the existing Codex Cost sidebar
- the VS Code status bar

No extra webview or external UI is introduced.

## User Intent

The user wants the extension to remain native to VS Code while becoming more useful for day-to-day cost control:

- hide very old sessions from the main display
- define spending limits for day, week, and month
- see budget usage directly in the status bar
- get yellow/red visual warning states for budgets
- choose which status bar entries are shown

## Scope

### In Scope

- Fixed start-date filtering for displayed usage
- Budget calculation for current day, week, and month
- Budget status bar item with warning/error background states
- Settings to enable or disable session/workspace/budget status bar items
- Sidebar info/warning nodes for filter and budget state
- Parser and aggregation changes required to support time-window calculations

### Out of Scope

- Webviews, dashboards, charts, or custom UI panels
- External APIs or billed-cost reconciliation
- Arbitrary end dates for filters in v1 of this feature
- Custom ordering of status bar items
- Notifications beyond status bar warning/error visual state

## Product Shape

The extension continues to use the current architecture:

- `TreeDataProvider` sidebar for detailed breakdown
- `StatusBarItem` entries for quick-glance values
- VS Code settings for all configuration

The new capability adds one more status bar category, richer period-aware aggregation, and filter-aware sidebar/status content.

## Functional Requirements

### 1. Fixed Start-Date Filter

Add a new setting:

- `codexCost.filter.startDate`

Behavior:

- type is `string`
- format is `DD.MM.YYYY`
- example in setting description: `01.01.2000`
- empty or unset means no filter
- when valid, the display window is:
  - `start date at 00:00 local time`
  - through `now`

This filter affects:

- sidebar totals
- sidebar session list
- session status bar item
- workspace status bar item

This filter does not affect:

- budget calculations

If the configured date is invalid:

- no crash
- filter is ignored
- a warning appears in the sidebar

### 2. Budget Settings

Add these settings:

- `codexCost.budget.dayAmount`
- `codexCost.budget.weekAmount`
- `codexCost.budget.monthAmount`
- `codexCost.budget.warningPercent`

Behavior:

- amounts are numeric USD values
- unset, missing, or `0` means "no budget configured" for that period
- `warningPercent` is numeric and defaults to `80`

### 3. Budget Period Display

Add setting:

- `codexCost.statusBar.budgetPeriod`

Allowed values:

- `day`
- `week`
- `month`

This selects which budget period is shown in the budget status bar item.

### 4. Status Bar Visibility

Add settings:

- `codexCost.statusBar.showSession`
- `codexCost.statusBar.showWorkspace`
- `codexCost.statusBar.showBudget`

Behavior:

- each setting independently shows or hides its status bar item
- ordering remains fixed:
  - Session
  - Workspace
  - Budget

### 5. Budget Status States

Budget status bar item should show:

- neutral state below warning threshold
- warning state at or above warning threshold
- error state at or above 100 percent of budget

Example text:

- `Month 154,00 $/500,00 $`
- `Week 35,00 $/100,00 $`
- `Day no budget`

Background colors should use native VS Code status bar theme colors only:

- warning: `statusBarItem.warningBackground`
- error: `statusBarItem.errorBackground`

### 6. Sidebar Info

The sidebar should include visible context for:

- active filter start date
- auto-refresh state
- budget period shown in the status bar
- budget warning or exceeded state
- invalid filter configuration warnings

## Data Model and Aggregation Changes

### Current Limitation

The existing parser keeps only the latest cumulative `token_count` snapshot per session. That is enough for total session estimates but not for:

- fixed time-window filtering
- day/week/month budget calculations
- filtered "current session" behavior

### Required Change

The parser must retain a small per-session time series of cumulative token snapshots:

- snapshot timestamp
- cumulative input tokens
- cumulative cached input tokens
- cumulative output tokens
- cumulative total tokens

From that series, the extension derives token deltas between snapshots.

### Delta Rule

Each delta is computed between two consecutive cumulative snapshots:

- `newer cumulative snapshot - older cumulative snapshot`

That delta is attributed to the timestamp of the newer snapshot.

This rule is used for:

- filtered usage calculations
- budget period calculations
- filtered current-session selection

This is the simplest defensible rule with the available local data.

### Filtered Session and Workspace Semantics

### Session Status Bar Item

The session item should represent:

- the newest workspace-matching session
- that has non-zero usage within the active filtered window

If no session matches:

- show `Session n/a`

### Workspace Status Bar Item

The workspace item should represent:

- total filtered workspace usage from the configured start date through now

If no matching usage exists:

- show `Workspace n/a`

### Budget Period Semantics

Budgets ignore the fixed start-date filter and always use calendar-based windows:

- `day`: today 00:00 local time through now
- `week`: Monday 00:00 local time through now
- `month`: first day of current month 00:00 local time through now

These windows are evaluated from the same session delta stream used elsewhere.

## Settings Design

### Filter

`codexCost.filter.startDate`

- type: `string`
- default: `""`
- description example includes `01.01.2000`

### Budgets

`codexCost.budget.dayAmount`

- type: `number`
- default: `0`

`codexCost.budget.weekAmount`

- type: `number`
- default: `0`

`codexCost.budget.monthAmount`

- type: `number`
- default: `0`

`codexCost.budget.warningPercent`

- type: `number`
- default: `80`
- expected range: `0` to `100`

### Status Bar

`codexCost.statusBar.showSession`

- type: `boolean`
- default: `true`

`codexCost.statusBar.showWorkspace`

- type: `boolean`
- default: `true`

`codexCost.statusBar.showBudget`

- type: `boolean`
- default: `true`

`codexCost.statusBar.budgetPeriod`

- type: `string`
- values:
  - `day`
  - `week`
  - `month`
- default: `month`

## UI Behavior

### Status Bar

The extension should keep separate status bar items rather than combining them into one string.

Session item examples:

- `Session 12,40 $`
- `Session n/a`

Workspace item examples:

- `Workspace 154,00 $`
- `Workspace ~154,00 $`
- `Workspace n/a`

Budget item examples:

- `Month 154,00 $/500,00 $`
- `Week 91,00 $/100,00 $`
- `Day no budget`

Approximate marker `~` continues to mean:

- cost is based only on sessions with known pricing
- some matching sessions were missing pricing

### Sidebar

The sidebar remains the detailed surface.

Add or extend informational leaf nodes for:

- filter start date or "no filter"
- auto-refresh interval
- budget period currently shown in the status bar
- budget health state
- invalid filter date warnings

## Error Handling

### Invalid Filter Date

If `codexCost.filter.startDate` does not match the expected format or cannot be parsed:

- ignore the filter
- warn in the sidebar
- do not throw

### Missing Budget

If the selected budget period has no configured positive amount:

- budget item shows `no budget`
- no warning or error background is applied

### Missing Pricing

Existing missing-pricing behavior remains:

- costs may still be partial estimates
- partial estimates are marked as approximate where shown

## Architecture Changes

Expected modules to extend:

- `src/config.ts`
  - read new filter, budget, and status bar settings
- `src/data/jsonlSessionParser.ts`
  - retain cumulative token snapshot history per session
- `src/domain/types.ts`
  - add token snapshot series, delta-based window summaries, budget state types
- `src/domain/sessionAggregator.ts`
  - compute filtered usage
  - compute day/week/month budget usage
  - compute current filtered session
- `src/view/costTreeProvider.ts`
  - update sidebar nodes and status bar entries from richer report data
- `src/view/treePresentation.ts`
  - render filter and budget info
- `src/view/statusBarPresentation.ts`
  - render budget item and status bar visibility rules

New helper modules are acceptable if they keep responsibilities clearer, especially for:

- date parsing and period calculations
- budget-state evaluation
- token delta calculation

## Testing Strategy

### Automated

Add or extend tests for:

- parsing a valid fixed start date
- invalid filter date handling
- token delta generation from cumulative snapshots
- filtered session and workspace totals
- day/week/month budget totals
- budget warning threshold behavior
- budget exceeded behavior
- status bar visibility settings
- budget text rendering
- budget color state selection

### Manual

Verify in the VS Code Extension Development Host:

- old sessions disappear when filter start date excludes them
- session/workspace status bar items react to the filter
- budget item matches current day/week/month selection
- yellow state appears at the warning threshold
- red state appears when budget is exceeded
- disabling any status bar item hides only that item
- invalid `startDate` shows a warning without breaking the extension

## Risks and Mitigations

### Risk: More parser state increases complexity

Mitigation:

- keep stored history narrow
- retain only fields needed for token deltas
- isolate delta logic in focused helpers

### Risk: Boundary accuracy near the filter start date

Mitigation:

- use a documented delta attribution rule
- keep behavior deterministic and test-covered

### Risk: Too many settings become confusing

Mitigation:

- keep names explicit
- use safe defaults
- surface active state clearly in the sidebar

## Acceptance Criteria

1. Users can configure a fixed `startDate` in settings to hide older usage from the sidebar and session/workspace status bar items.
2. The filter start date remains fixed until the user changes it.
3. Invalid filter dates do not break the extension and are surfaced as warnings.
4. Users can configure day, week, and month budgets in settings.
5. The budget status bar item can show day, week, or month budget progress based on settings.
6. The budget item turns yellow at the configured warning threshold.
7. The budget item turns red when the selected budget is exceeded.
8. Users can independently show or hide session, workspace, and budget status bar items.
9. Everything remains inside existing VS Code surfaces without adding an extra UI.
