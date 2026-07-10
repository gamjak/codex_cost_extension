# Codex Cost

Codex Cost is a local VS Code extension that estimates Codex usage cost from session logs stored on the current machine.

## What it does

- Reads local Codex session JSONL files
- Aggregates token usage by scope, model, and session
- Applies per-model prices from VS Code settings
- Shows the result in a dedicated sidebar
- Shows the latest workspace session cost and current workspace cost in the VS Code status bar
- Can hide older usage with a fixed start date
- Can track day, week, or month budgets in the VS Code status bar
- Refreshes the sidebar and status bar automatically based on a configurable interval

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
- Budget windows are calendar-based and ignore the fixed filter:
  - `day` = today
  - `week` = current week starting on Monday
  - `month` = current month

## Local development

1. Run `npm install`
2. Run `npm run compile`
3. Press `F5` in VS Code
4. In the Extension Development Host, open the `Codex Cost` activity bar item
