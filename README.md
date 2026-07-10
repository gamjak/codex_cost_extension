# Codex Cost

Codex Cost is a local VS Code extension that estimates Codex usage cost from session logs stored on the current machine.

> Cost values are estimates, not invoices. The bundled pricing snapshot was reviewed on 2026-07-10; verify and override it when pricing changes.

## What it does

- Reads local Codex session JSONL files from VS Code, CLI, desktop, and other Codex sources
- Aggregates token usage by scope, model, and session
- Applies per-model prices from VS Code settings
- Shows the result in a dedicated sidebar
- Shows the latest workspace session cost and current workspace cost in the VS Code status bar
- Can hide older usage with a fixed start date
- Can track day, week, or month budgets in the VS Code status bar
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

The extension ships with built-in default prices for the GPT-5.4 and GPT-5.5 families.

You can override them in VS Code settings:

```json
{
  "codexCost.autoRefreshSeconds": 60,
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
Set `codexCost.autoRefreshSeconds` to `0` to disable automatic refresh. The toolbar refresh action still updates immediately.

## Filter and budget settings

You can configure the fixed filter, budgets, and visible status bar items in VS Code settings:

```json
{
  "codexCost.filter.startDate": "01.01.2000",
  "codexCost.budget.dayAmount": 25,
  "codexCost.budget.weekAmount": 100,
  "codexCost.budget.monthAmount": 500,
  "codexCost.budget.warningPercent": 80,
  "codexCost.statusBar.showSession": true,
  "codexCost.statusBar.showWorkspace": true,
  "codexCost.statusBar.showBudget": true,
  "codexCost.statusBar.budgetPeriod": "month"
}
```

- `codexCost.filter.startDate` uses the `DD.MM.YYYY` format and stays fixed until you change it.
- The budget settings are split into two parts:
  - `codexCost.budget.dayAmount`, `codexCost.budget.weekAmount`, and `codexCost.budget.monthAmount` define up to three separate budgets.
  - `codexCost.statusBar.budgetPeriod` only selects which of those configured budgets is shown in the status bar.
- Example: you can set `day = 25`, `week = 100`, and `month = 500`, then choose `month` to show `Month 154,00 $/500,00 $` in the status bar.
- This is intentional: daily, weekly, and monthly limits are usually different, so one single amount field would have to be changed every time you switch periods.
- `codexCost.statusBar.showBudget` only shows or hides the budget item. It does not enable or disable the budget values themselves.
- Budget windows are calendar-based and ignore the fixed date filter, but respect the active report scope:
  - the status-bar budget covers the current workspace
  - the sidebar budget covers either the current workspace or all sessions, depending on the selected scope
  - `day` = today
  - `week` = current week starting on Monday
  - `month` = current month

## Local development

1. Run `pnpm install`
2. Run `pnpm run compile`
3. Press `F5` in VS Code
4. In the Extension Development Host, open the `Codex Cost` activity bar item

Before opening a pull request, run:

```sh
pnpm run check
pnpm run package
```

## Installation from a VSIX

1. Run `pnpm install --frozen-lockfile` and `pnpm run package`.
2. In VS Code, choose **Extensions: Install from VSIX...** from the Command Palette.
3. Select the generated `.vsix` file.

## Privacy and data access

- Session logs are read locally and are never uploaded by this extension.
- The extension does not make billing, authentication, telemetry, or pricing network requests.
- Configured log roots may point outside the current workspace. Only `.jsonl` files below those roots are inspected.
- Workspace paths can appear in local tooltips and the Codex Cost output channel, but are not transmitted.

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
