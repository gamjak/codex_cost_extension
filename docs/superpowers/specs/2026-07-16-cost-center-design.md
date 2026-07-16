# Codex Cost Center Design

Date: 2026-07-16
Status: Approved for specification review

## Goal

Turn the existing editor dashboard into a cohesive Cost Center that helps a VS Code user answer three questions within at most three interactions:

1. How much did Codex usage cost during the selected period?
2. Which sessions, projects, and models caused that cost?
3. Which budget or configuration action is appropriate?

The Cost Center remains a local estimator. It reads local Codex session logs and does not call a billing service, upload usage data, or display prompt and response content.

## Product Direction

The product uses one editor-based Cost Center rather than separate pages or an expanded tree view. A shared scope and time filter keeps the overview, session analysis, project analysis, and model analysis comparable.

The existing sidebar remains the compact entry point for today's budget state, important totals, and an explicit `Open Cost Center` action. Detailed analysis and guided configuration belong in the Cost Center.

On the first open, the Cost Center uses the current workspace. On subsequent opens, it restores the last used scope. It also restores the last selected time range, comparison preference, and analysis section.

## Information Architecture

### Persistent controls

The top control bar remains visible while navigating the Cost Center and contains:

- scope: current workspace or all sessions;
- time range: Today, 7 days, 30 days, or custom;
- previous-period comparison toggle;
- refresh action;
- guided settings action.

The four primary sections are compact tabs:

- **Overview** for totals, budget health, trends, and cost drivers;
- **Sessions** for individual session analysis;
- **Projects** for workspace comparison;
- **Models** for model usage and pricing analysis.

Drill-downs stay within the Cost Center. Selecting a project or model switches to Sessions with a corresponding visible filter. Active filters appear as removable filter chips. Removing a drill-down filter preserves the global scope and time range.

## Overview

The overview begins with four compact metrics:

- estimated cost for the selected period;
- budget used and budget remaining;
- change from the previous equivalent period when comparison is enabled;
- average cost per active day.

The primary chart plots cost by day. The Today range uses hourly points. When comparison is enabled, a comparison series shows the preceding period. A budget reference line appears when a matching budget is configured. Hover details include estimated cost, tokens, and session count. Selecting a point applies a day or hour filter to the analysis sections.

Three driver cards identify the most expensive session, project, and model. Each card shows estimated cost, share of total cost, and previous-period change when available. Selecting a card opens the corresponding analysis or drill-down.

The budget block presents state, remaining budget, and projection in plain language. Example states include `On track`, `At the current pace, 18% over daily budget`, and `No reliable projection because two models have no price`.

The existing raw summary is removed from the default visible layout. `Copy summary` remains available as an action.

## Analysis Sections

All analysis sections use the same interaction model: sortable columns, search, visible active filters, a clear empty state, and descending estimated cost as the default sort.

Table sort, column, and expansion state lasts for the current VS Code session. Global scope, time range, comparison preference, and selected section persist across restarts.

### Sessions

The session table shows:

- session or workspace label;
- start and last activity;
- duration;
- model or models used;
- input, cached-input, and output tokens;
- estimated cost;
- share of the selected period;
- missing-price state.

Expanding a session shows its cost timeline, token composition, associated project, and normalized source. It never displays prompts or responses.

### Projects

The project table shows:

- workspace name and local path;
- estimated cost;
- previous-period change;
- session count;
- active days;
- most expensive model;
- average cost per session.

A project can be pinned or excluded from analysis. Exclusions are a presentation preference and do not delete or modify logs. Selecting a project opens Sessions with the project filter applied.

Project identity is based on the normalized workspace path. Sessions that cannot be associated with a workspace appear under `No project`.

### Models

The model table shows:

- model family;
- estimated cost;
- input, cached-input, and output tokens;
- session and project counts;
- average cost per session;
- share of total cost;
- pricing state: bundled price, custom price, or missing price.

Selecting a model opens Sessions with the model filter applied. A missing-price action opens the advanced pricing settings.

## Guided Settings

The Cost Center contains guided settings for common product decisions. Editing uses a draft state. Values are written to VS Code configuration only after the user selects `Save` and all visible fields validate. `Discard` restores the persisted configuration.

Closing a dirty settings view asks the user to Save, Discard, or return to editing.

### Budget

- daily, weekly, and monthly budget;
- warning threshold percentage;
- recurring notification amount;
- live preview of the resulting state and warning.

### Display

- visible status bar items;
- preferred status bar budget period;
- default Cost Center time range;
- previous-period comparison default;
- currency and number-format presentation.

Cost calculation remains USD-based in this version. A display currency other than USD is not offered until a reliable conversion design exists; locale-aware number formatting may vary independently of currency.

### Data Sources

- detected log directories and their status;
- source selection for VS Code, CLI, Desktop, and unknown sources;
- add another log directory;
- `Check data` action showing file count, session count, latest activity, and warnings.

### Notifications

- enable or disable budget notifications;
- warning threshold and recurring amount;
- summary on the first threshold crossing;
- local test notification.

Rare technical controls remain in native VS Code settings:

- model prices;
- raw log-root editing;
- automatic refresh interval;
- diagnostic controls introduced in the future.

The guided settings link to `Advanced settings`. `Restore recommended settings` affects only the visible group and requires confirmation before replacing draft values.

## Domain and Component Design

### Analytics domain

A focused analytics module consumes normalized usage deltas and produces current-period and previous-period aggregates. It owns time buckets, comparisons, project grouping, model grouping, session detail, driver ranking, and active-day averages.

The module has no VS Code or webview dependency. Given the same normalized events, pricing, filters, and clock, it returns the same result.

### Filter state

A separate filter state represents scope, time range, comparison, selected section, and drill-down filters. Global and drill-down filters are distinct so navigation can remove a project, model, or point filter without resetting the chosen period.

### Settings draft

A settings-draft component converts persisted VS Code configuration into editable values, validates the draft, reports field errors, and creates the minimal configuration update set. It does not write configuration itself.

### Cost Center webview

The webview renders a complete, serializable view model and emits a small set of validated actions. It does not read files or VS Code configuration directly. It uses VS Code theme variables, semantic HTML, keyboard-accessible controls, and no third-party UI or chart dependency.

### Extension controller

The controller coordinates refreshes, filter actions, persisted preferences, settings writes, and updates to the sidebar, status bar, and webview. Changing a drill-down filter re-aggregates cached normalized events without rescanning unchanged files.

## Data Flow

1. Existing scanners discover and cache local JSONL files.
2. Parsers produce normalized sessions and usage deltas.
3. Session normalization supplies explicit start time, last activity, project key, normalized source, and the models used.
4. The analytics domain applies the selected scope and period.
5. It computes the current period and, when requested, the immediately preceding equivalent period under identical scope and pricing rules.
6. The controller creates a Cost Center view model and sends it to the webview.
7. UI actions update filters or settings drafts; only data-source changes require a rescan.

Custom time ranges are inclusive local-calendar ranges. The comparison range has the same number of calendar days and ends immediately before the selected range begins. Today compares with yesterday by equivalent elapsed local time where a projection or percentage comparison would otherwise be misleading.

## Error Handling

- Missing model prices mark affected money totals and comparisons as partial. Tokens, sessions, projects, and known-price cost remain visible.
- An invalid custom range is not applied and receives a field-level explanation.
- An unavailable log directory is marked in guided settings while other roots continue to contribute data.
- Empty states distinguish no logs, no sessions in the period, and filters that exclude all matching data.
- Malformed logs do not block valid sessions. A compact warning links to local diagnostics.
- Invalid settings never replace persisted values.
- A Cost Center rendering or message failure does not prevent sidebar and status-bar refresh. Technical details go to the existing Codex Cost output channel.

## Privacy

- No runtime network requests, authentication, billing calls, or telemetry are introduced.
- Prompt and response content is never placed in the view model.
- Full local paths appear only where needed in project/session detail and data-source settings.
- The standard copied summary excludes full paths.
- Export is outside this design.

## Accessibility and Responsive Behavior

The Cost Center supports keyboard navigation, visible focus, semantic tables, chart descriptions, and VS Code high-contrast themes. At narrow editor widths, metrics and driver cards stack, the control bar wraps, and tables use horizontal scrolling rather than hiding required columns. Color is never the only indication of budget or pricing state.

## Testing

### Domain tests

- local-calendar and custom ranges;
- equal previous-period boundaries;
- hourly Today comparison;
- session, project, and model aggregates;
- project identity and `No project` fallback;
- partial pricing propagation;
- ranking and active-day averages.

### State tests

- global versus drill-down filters;
- remembered scope, period, comparison, and section;
- temporary table state;
- settings draft validation, discard, group reset, and minimal updates.

### Presentation tests

- HTML escaping and message validation;
- empty, partial, warning, and error states;
- filter-chip and drill-down behavior;
- semantic labels and chart descriptions;
- responsive structure and theme-token usage.

### Controller tests

- messages route only to allowed actions;
- cached data is re-aggregated without unnecessary rescans;
- settings are written only after validation and confirmation;
- webview failures remain isolated from sidebar and status bar.

Manual verification uses the VS Code Extension Development Host with light, dark, and high-contrast themes; keyboard-only navigation; a narrow editor; custom periods; missing pricing; an unavailable log root; and a realistically large local log set.

## Acceptance Criteria

1. The Cost Center uses one shared scope and time range across Overview, Sessions, Projects, and Models.
2. First open defaults to the current workspace; later opens restore the last global Cost Center preferences.
3. Today, 7-day, 30-day, and custom ranges work, with an optional equivalent previous-period comparison.
4. The overview explains total cost, budget condition, trend, and the leading session, project, and model cost drivers.
5. Users can drill from a project, model, or chart point into filtered sessions without losing global filters.
6. Guided settings safely configure budgets, display, data sources, and notifications, while advanced pricing remains in native VS Code settings.
7. Missing prices, malformed logs, unavailable roots, and empty filtered results remain explicit without preventing valid analysis.
8. No prompt content, response content, telemetry, or runtime network access is introduced.
9. The primary cost, cost driver, and relevant action are reachable within at most three interactions.
10. Automated checks, package verification, and the documented manual UI matrix pass before release.

## Explicitly Out of Scope

- billed-cost reconciliation or subscription/rate-limit integration;
- hard stopping Codex execution when a budget is reached;
- cloud synchronization or team dashboards;
- prompt or response inspection;
- CSV, JSON, or image export;
- currency conversion;
- third-party charting or UI frameworks.
