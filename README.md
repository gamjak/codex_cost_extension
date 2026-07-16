# Codex Cost

Codex Cost is a local VS Code extension that estimates Codex usage cost from session logs stored on the current machine.

> Cost values are estimates, not invoices. Verify and override the bundled pricing when it changes.

## What it does

- Reads local Codex session JSONL files from VS Code, CLI, desktop, and other Codex sources
- Aggregates token usage by scope, model, and session
- Applies per-model prices from VS Code settings
- Shows the result in a dedicated sidebar
- Shows the latest workspace session cost and current workspace cost in the VS Code status bar
- Can hide older usage with a fixed start date
- Can track day, week, or month budgets in the VS Code status bar
- Shows one warning at the configured budget threshold and one when the budget is exceeded
- Shows today's workspace spend, daily budget, remaining budget, and end-of-day projection
- Opens a local Cost Center for period comparisons and drill-down by session, project, or model
- Offers direct actions to configure the daily budget and copy a cost summary
- Refreshes the sidebar and status bar automatically based on a configurable interval
- Caches unchanged session files so recurring refreshes only parse new or modified logs

## What it does not do

- It does not call Azure, OpenAI, or any billing API
- It does not require authentication
- It does not show billed cost

## Default log source

The extension scans:

```json
["%USERPROFILE%/.codex/sessions"]
```

## Pricing configuration

The extension ships with built-in default prices for the GPT-5.4, GPT-5.5, and GPT-5.6 families, including the `sol`, `terra`, and `luna` variants.

You can override them in VS Code settings:

```json
{
  "codexCost.autoRefreshSeconds": 60,
  "codexCost.sources.include": ["vscode", "cli"],
  "codexCost.pricing.models": {
    "gpt-5.4": {
      "inputPer1M": 2.5,
      "cachedInputPer1M": 0.25,
      "outputPer1M": 15
    }
  }
}
```

Any values you set in `codexCost.pricing.models` override the built-in defaults.
Model identifiers with dated or deployment suffixes inherit the longest matching configured family. For example, `gpt-5.4-2026-07-10` uses `gpt-5.4` pricing unless an exact override exists.
Cache-write prices shown by the provider are not applied because Codex session logs currently expose no separate cache-write token count.
Set `codexCost.autoRefreshSeconds` to `0` to disable automatic refresh. The toolbar refresh action still updates immediately.

## Filter and budget settings

You can configure the fixed filter, budgets, and visible status bar items in VS Code settings:

```json
{
  "codexCost.filter.startDate": "01.01.2000",
  "codexCost.budget.dayAmount": 25,
  "codexCost.budget.weekAmount": 100,
  "codexCost.budget.monthAmount": 500,
  "codexCost.budget.notifications.enabled": true,
  "codexCost.budget.notifications.everyAmount": 5,
  "codexCost.budget.warningPercent": 80,
  "codexCost.statusBar.showSession": true,
  "codexCost.statusBar.showWorkspace": true,
  "codexCost.statusBar.showBudget": true,
  "codexCost.statusBar.budgetPeriod": "month"
}
```

- `codexCost.filter.startDate` uses the `DD.MM.YYYY` format and stays fixed until you change it.
- `codexCost.sources.include` optionally restricts reports to normalized sources such as `vscode`, `cli`, or `desktop`. Leave it empty to include all sources.
- The budget settings are split into two parts:
  - `codexCost.budget.dayAmount`, `codexCost.budget.weekAmount`, and `codexCost.budget.monthAmount` define up to three separate budgets.
  - `codexCost.statusBar.budgetPeriod` only selects which of those configured budgets is shown in the status bar.
- Example: you can set `day = 25`, `week = 100`, and `month = 500`, then choose `month` to show `Month 154,00 $/500,00 $` in the status bar.
- This is intentional: daily, weekly, and monthly limits are usually different, so one single amount field would have to be changed every time you switch periods.
- `codexCost.statusBar.showBudget` only shows or hides the budget item. It does not enable or disable the budget values themselves.
- `codexCost.budget.notifications.enabled` is `true` by default. Set it to `false` to disable notifications.
- `codexCost.budget.notifications.everyAmount` optionally adds one notification whenever spend reaches another X USD in the active budget period. For example, `5` notifies at $5, $10, $15, and so on. Set it to `0` to disable these recurring spend notifications.
- Budget windows are calendar-based and ignore the fixed date filter, but respect the active report scope:
  - the status-bar budget covers the current workspace
  - the sidebar budget covers either the current workspace or all sessions, depending on the selected scope
  - `day` = today
  - `week` = current week starting on Monday
  - `month` = current month
- Budget notifications are enabled by default and are shown once per threshold and calendar period. Set `codexCost.budget.notifications.enabled` to `false` to disable them. The keys persist across VS Code restarts and reset automatically when the next day, week, or month begins. Notifications are skipped when pricing gaps prevent a reliable estimate.

## Cost Center workflow

The budget status item focuses on today's workspace estimate. With a daily budget configured, it shows spend, budget, and an `On track`, `Watch`, or `Over budget` state. The projection estimates end-of-day cost from usage so far; it is omitted when no priced usage is available. Values remain API-equivalent estimates, not billed cost.

Open the Cost Center by selecting a Codex Cost status-bar item, using the Cost Center button in the Codex Cost sidebar, or running **Codex Cost: Open Cost Center** from the Command Palette. It shares the sidebar's **Workspace** or **All Sessions** scope, so changing scope in either place updates the same local report.

Choose **Today**, **7 days**, **30 days**, or a custom inclusive date range. Enable comparison to place the selected period beside the immediately preceding period of the same length. The Overview summarizes the result; the **Sessions**, **Projects**, and **Models** sections provide analysis tables. Selecting a project or model opens the matching sessions, where the filter chip can be removed to return to the full list. Scope, range, comparison choice, and section are remembered between Cost Center visits.

Cost Center settings use a guided view for common choices such as the default scope, default range, comparison, refresh, budgets, notifications, and status-bar visibility. Use **Advanced settings** for the complete VS Code configuration, including log roots, source filters, and model pricing. Unsaved guided changes prompt you to save or discard them before the settings view closes.

A **partial** price means that token usage is known but at least one model has no matching price, so the displayed cost covers only priced usage and must not be treated as a complete total. Tokens and affected sessions remain visible; add an exact or family price in Advanced settings to complete the estimate.

Run **Codex Cost: Open Cost Control** for a compact action menu, or **Codex Cost: Configure Daily Budget** to set a positive USD value for `codexCost.budget.dayAmount`. **Codex Cost: Copy Cost Summary** copies the current local workspace summary to the clipboard.

## Installation from a VSIX

1. In VS Code, choose **Extensions: Install from VSIX...** from the Command Palette.
2. Select the Codex Cost `.vsix` file you received.

## Privacy and data access

- Session logs are read locally and are never uploaded by this extension.
- Cost Center aggregation, filtering, comparisons, and remembered preferences stay on the current machine.
- The extension does not make billing, authentication, telemetry, or pricing network requests.
- Configured log roots may point outside the current workspace. Only `.jsonl` files below those roots are inspected.
- Workspace paths can appear in local tooltips and the Codex Cost output channel, but are not transmitted.
- Copied summaries omit full local paths, prompts, and responses.

## Performance and diagnostics

- Overlapping log roots are deduplicated.
- Unchanged files are reused from an in-memory cache based on file size and modification time.
- Malformed or unreadable files are skipped individually; warnings appear in the sidebar while valid sessions remain available.
- Refresh requests are coalesced so a slow scan cannot overlap another scan.
- Detailed refresh failures are written to the **Codex Cost** output channel.

## Troubleshooting

- **No logs found:** check `codexCost.logRoots` and confirm that the directories contain `.jsonl` files.
- **Missing pricing:** add the reported model or a matching model family under `codexCost.pricing.models`.
- **Workspace total is empty:** verify that the session `cwd` is the workspace itself or one of its child directories.
- **Unexpected estimates:** compare the configured model prices with the current pricing applicable to your account and model.
