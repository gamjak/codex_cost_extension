# Native Cost Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, daily budget control loop with a native VS Code sidebar and an editor dashboard.

**Architecture:** Keep token parsing and pricing in the existing domain. Add a range-aware cost-control report that composes `buildUsageReport` for today and the last seven local calendar days. Feed that report into the status bar, the tree presentation, and a small theme-aware dashboard webview; command handlers only coordinate VS Code APIs.

**Tech Stack:** TypeScript, VS Code Extension API 1.96, Vitest 4, native Tree View, WebviewPanel, pnpm.

## Global Constraints

- All runtime usage remains local-only: no authentication, telemetry, or runtime network request.
- The only primary safety limit is `codexCost.budget.dayAmount` in USD; do not add Codex rate limits or subscription quotas.
- All money figures are API-equivalent estimates and must visibly preserve approximate/missing-pricing states.
- Add no UI, chart, or date library; dashboard charts use semantic HTML, CSS, and inline SVG.
- Keep existing workspace/source filters and token-delta accounting intact.
- Use test-first red/green cycles for every production behavior.

---

### Task 1: Range-aware cost-control domain

**Files:**
- Create: `src/domain/costControl.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/domain/sessionAggregator.ts`
- Test: `test/unit/costControl.test.ts`
- Test: `test/unit/sessionAggregator.test.ts`

**Interfaces:**
- Consumes: `buildUsageReport(sessions, pricingByModel, BuildUsageReportOptions)` and `formatFixedDate(date)`.
- Produces: `buildCostControlReport(sessions, pricingByModel, options): CostControlReport`.
- `CostControlReport` contains `today: UsageReport`, `remainingCost?: number`, `projectedCost?: number`, and `daily: readonly DailyCostPoint[]` where every point has `date`, `estimatedCost?`, and `hasEstimatedCostGaps`.

- [ ] **Step 1: Write the failing range and projection tests**

```ts
it('returns only deltas inside an explicit end boundary', () => {
  const report = buildUsageReport(sessions, pricing, {
    ...options,
    filterStartDateInput: '05.06.2026',
    filterEndAt: new Date('2026-06-06T00:00:00.000Z')
  });
  expect(report.summary.estimatedCost).toBeCloseTo(0.5);
});

it('projects today from elapsed local time and builds seven daily points', () => {
  const control = buildCostControlReport(sessions, pricing, {
    ...options,
    now: new Date('2026-06-05T12:00:00.000Z')
  });
  expect(control.remainingCost).toBeCloseTo(0.5);
  expect(control.projectedCost).toBeCloseTo(1);
  expect(control.daily).toHaveLength(7);
  expect(control.daily.at(-1)).toMatchObject({ date: '05.06.2026', estimatedCost: 0.5 });
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `pnpm exec vitest run test/unit/costControl.test.ts test/unit/sessionAggregator.test.ts`

Expected: test compilation fails because `filterEndAt` and `buildCostControlReport` do not exist.

- [ ] **Step 3: Add the smallest range-aware report contract**

```ts
export interface BuildUsageReportOptions {
  // existing members
  filterEndAt?: Date;
}

const filterEndAtMs = options.filterEndAt?.getTime();
const matchesFilterWindow =
  (filterStartAtMs === undefined || deltaTimestampMs >= filterStartAtMs) &&
  (filterEndAtMs === undefined || deltaTimestampMs < filterEndAtMs) &&
  matchesScope;
```

Add `CostControlReport` and `DailyCostPoint` to `src/domain/types.ts`. In `costControl.ts`, call `buildUsageReport` once for today and once for each of the seven local date boundaries. Derive projection only when today has a priced non-zero estimate and elapsed milliseconds are positive; calculate remaining only when both daily budget and spent cost are known.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `pnpm exec vitest run test/unit/costControl.test.ts test/unit/sessionAggregator.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit the domain slice**

```bash
git add src/domain/types.ts src/domain/sessionAggregator.ts src/domain/costControl.ts test/unit/costControl.test.ts test/unit/sessionAggregator.test.ts
git commit -m "feat: add daily cost control report"
```

### Task 2: Native control loop and actionable sidebar

**Files:**
- Create: `src/view/costControlPresentation.ts`
- Modify: `src/view/statusBarPresentation.ts`
- Modify: `src/view/treePresentation.ts`
- Modify: `src/view/costTreeProvider.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`
- Test: `test/unit/costControlPresentation.test.ts`
- Test: `test/unit/statusBarPresentation.test.ts`
- Test: `test/unit/costTreePresentation.test.ts`

**Interfaces:**
- Consumes: `CostControlReport` from Task 1 and `formatCostUsd`.
- Produces: `buildCostControlText(control): CostControlText`, `buildCostSummaryText(control): string`, and tree-node command/context metadata.
- The provider exposes `getLatestCostControl(): CostControlReport | undefined`, `setDashboardUpdater(callback)`, and `copySummary(): Promise<void>`.

- [ ] **Step 1: Write failing native-presentation tests**

```ts
it('labels an under-budget daily control as on track with a projection', () => {
  expect(buildCostControlText(control)).toMatchObject({
    label: 'On track',
    text: 'Today 0,50 $/1,00 $ · On track',
    tone: 'default'
  });
});

it('places the Today control before the existing report sections with dashboard actions', () => {
  const nodes = buildUsageTree('workspace', report, refreshInfo, control);
  expect(nodes[0]).toMatchObject({ id: 'today', label: 'Today', command: 'codexCost.openDashboard' });
});
```

- [ ] **Step 2: Run focused presentation tests and confirm RED**

Run: `pnpm exec vitest run test/unit/costControlPresentation.test.ts test/unit/statusBarPresentation.test.ts test/unit/costTreePresentation.test.ts`

Expected: imports and `Today` node are missing.

- [ ] **Step 3: Implement native control and sidebar actions**

```ts
this.sessionStatusItem.command = 'codexCost.openDashboard';
this.workspaceStatusItem.command = 'codexCost.openDashboard';
this.budgetStatusItem.command = 'codexCost.openDashboard';

vscode.commands.registerCommand('codexCost.openCostControl', async () => {
  const action = await vscode.window.showQuickPick([
    { label: 'Open Cost Dashboard', value: 'dashboard' },
    { label: 'Refresh cost data', value: 'refresh' },
    { label: 'Configure daily budget', value: 'budget' },
    { label: 'Open Codex Cost settings', value: 'settings' }
  ]);
  // dispatch the selected value without changing settings implicitly
});
```

Build the `Today` tree section from the control presenter. Add `openCostControl`, `configureDailyBudget`, and `copySummary` commands and view menus. Parse budget input as a positive finite number; use `workspace.getConfiguration('codexCost').update('budget.dayAmount', amount, vscode.ConfigurationTarget.Global)` only after validation. Retain Refresh in the title menu and Command Palette.

- [ ] **Step 4: Run focused presentation tests and confirm GREEN**

Run: `pnpm exec vitest run test/unit/costControlPresentation.test.ts test/unit/statusBarPresentation.test.ts test/unit/costTreePresentation.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit the native UI slice**

```bash
git add src/view/costControlPresentation.ts src/view/statusBarPresentation.ts src/view/treePresentation.ts src/view/costTreeProvider.ts src/extension.ts package.json test/unit/costControlPresentation.test.ts test/unit/statusBarPresentation.test.ts test/unit/costTreePresentation.test.ts
git commit -m "feat: add native daily cost controls"
```

### Task 3: Theme-aware editor dashboard

**Files:**
- Create: `src/view/dashboardPresentation.ts`
- Create: `src/view/costDashboard.ts`
- Modify: `src/extension.ts`
- Test: `test/unit/dashboardPresentation.test.ts`

**Interfaces:**
- Consumes: `CostControlReport`, `buildCostControlText(control)`, and `buildCostSummaryText(control)`.
- Produces: `buildDashboardHtml(control, nonce): string` and `CostDashboard.show(control)`, `CostDashboard.update(control)`.
- Dashboard messages use `{ type: 'refresh' | 'configureDailyBudget' | 'copySummary' }` and are handled by injected async callbacks.

- [ ] **Step 1: Write failing dashboard HTML tests**

```ts
it('renders today, seven daily points, model costs, and no raw HTML from session labels', () => {
  const html = buildDashboardHtml(controlWithUnsafeLabel, 'test-nonce');
  expect(html).toContain('Today');
  expect(html).toContain('gpt-5.4');
  expect(html).toContain('data-testid="seven-day-chart"');
  expect(html).not.toContain('<script>alert(1)</script>');
});
```

- [ ] **Step 2: Run dashboard tests and confirm RED**

Run: `pnpm exec vitest run test/unit/dashboardPresentation.test.ts`

Expected: module `dashboardPresentation` cannot be resolved.

- [ ] **Step 3: Implement the focused webview dashboard**

```ts
export function buildDashboardHtml(control: CostControlReport, nonce: string): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"></head><body>...</body></html>`;
}
```

Escape every dynamic string, build seven SVG bars with accessible text labels, and use VS Code CSS variables for colors. `CostDashboard` keeps one `WebviewPanel`, replaces HTML on `show`/`update`, and disposes its reference when the panel closes. Register the dashboard command and attach the provider's dashboard updater after commands are created.

- [ ] **Step 4: Run dashboard tests and confirm GREEN**

Run: `pnpm exec vitest run test/unit/dashboardPresentation.test.ts`

Expected: dashboard presentation tests pass.

- [ ] **Step 5: Commit the dashboard slice**

```bash
git add src/view/dashboardPresentation.ts src/view/costDashboard.ts src/extension.ts test/unit/dashboardPresentation.test.ts
git commit -m "feat: add cost dashboard"
```

### Task 4: Documentation, full verification, and extension packaging

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-07-15-native-cost-control-design.md`
- Modify: `docs/superpowers/plans/2026-07-15-native-cost-control.md`

**Interfaces:**
- Consumes: final command names and settings from Tasks 1–3.
- Produces: accurate user-facing setup and feature documentation.

- [ ] **Step 1: Write the release-documentation assertions by checking command and setting names**

```powershell
rg -n 'codexCost\.openCostControl|codexCost\.openDashboard|codexCost\.configureDailyBudget|codexCost\.copySummary' package.json README.md
rg -n 'budget\.dayAmount|daily budget|dashboard' README.md CHANGELOG.md
```

- [ ] **Step 2: Run the assertions and confirm documentation is incomplete**

Run: the two `rg` commands above.

Expected: current README and changelog do not describe all four commands or the dashboard.

- [ ] **Step 3: Document the released behavior**

Add concise README sections for daily control, dashboard, commands, estimate/privacy limits, and daily-budget setup. Add one unreleased changelog section listing the control loop, sidebar actions, and dashboard.

- [ ] **Step 4: Run full verification**

Run: `pnpm run check && pnpm run package && pnpm run verify-package`

Expected: type checking, linting, all tests, VSIX package creation, and package contract verification pass.

- [ ] **Step 5: Commit the completed feature**

```bash
git add README.md CHANGELOG.md docs/superpowers/specs/2026-07-15-native-cost-control-design.md docs/superpowers/plans/2026-07-15-native-cost-control.md
git commit -m "docs: describe native cost control"
```
