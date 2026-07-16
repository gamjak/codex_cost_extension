# Task 11 report

## Outcome

- Added a retained `CostDataSnapshot` to the tree provider and cached Cost Center re-aggregation.
- Integrated workspace preferences, global normalized pinned/excluded project paths, guided settings validation/allowlisted writes, per-root diagnostics, commands, localization, and compact sidebar entry points.
- Kept `codexCost.openDashboard` as an undocumented forwarding alias while contributing `codexCost.openCostCenter`.
- Removed the legacy `costDashboard`, `dashboardPresentation`, and their obsolete test after reference scans were clean except for the intentional alias and its manifest assertion.

## TDD evidence

- RED: `vitest run test/unit/costCenterIntegration.test.ts` failed because `src/view/costCenterController.ts` did not exist.
- GREEN: focused integration/tree/manifest run passed: 3 files, 12 tests.
- Final: `pnpm run check` passed TypeScript, ESLint, and Vitest: 29 files, 146 tests.

## Audit evidence

- `rg` found no remaining `costDashboard`, `dashboardPresentation`, `Cost Dashboard`, `setDashboardUpdater`, or `dashboardUpdater` references.
- The only `openDashboard` references are the intentional compatibility registration and the manifest test proving it is undocumented.
- `git diff --check` reported no whitespace errors.

## Review fixes

- Reproduced the listener defect with integration tests: ordinary budget/default-range events incorrectly caused rescans, and guided events delivered after `update()` settled caused duplicate rescans.
- Added the production `ConfigurationRefreshController` used by the real extension listener. It suppresses the full guided batch, consumes synchronous or delayed batch events, and publishes exactly once afterward: cached re-aggregation for ordinary settings or one refresh for `logRoots`/`sources.include`.
- Cost Center rebuilds now read current configuration while reusing the retained session snapshot, so budget, display, notification, pricing, and default-range changes do not scan logs.
- Added provider regression coverage proving a successful snapshot is published once and remains available after a later failed refresh.
- Review RED evidence: delayed guided event test observed two refreshes; provider injection test scanned real logs instead of the fake repository.
- Review GREEN evidence: focused suite passed 2 files / 9 tests; final `pnpm run check` passed 30 files / 150 tests.
