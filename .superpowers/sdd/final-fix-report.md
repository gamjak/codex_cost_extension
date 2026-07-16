# Final Fix Wave Report

Date: 2026-07-16

## Scope completed

- Invalid or partial custom ranges no longer replace state or persisted preferences. The client keeps incomplete edits local, the controller independently validates before applying, and invalid submissions render an inline alert.
- Project drivers now expose their actual share of selected estimated cost.
- Resetting a guided settings group requires modal confirmation; dismissing or cancelling leaves the draft untouched.
- Copy Summary is reachable in the Cost Center and is built from the active Cost Center report. It includes selected scope/range totals and safe driver labels, strips full path prefixes, and never serializes session rows, prompts, or responses.
- Comparison SVG bars and legend markup are omitted when comparison data is unavailable/off.
- Comparison chart tooltips use comparison-specific tokens and session counts supplied by the analytics contract.
- Impossible-date and Europe/Berlin DST regressions are covered.

## TDD evidence

Initial focused RED run:

`pnpm run test -- test/unit/costCenterTimeRange.test.ts test/unit/costCenterAnalytics.test.ts test/unit/costCenterIntegration.test.ts test/unit/costCenterHost.test.ts test/unit/costCenterPresentation.test.ts test/unit/costCenterSummary.test.ts`

Observed 9 behavior failures plus the intentionally missing summary module, covering project share, comparison metadata, invalid range containment, reset confirmation, comparison presentation, inline range error, local custom editing, copy action, and summary privacy.

The strengthened path-label privacy test was also observed failing with `Top session: C:\secret\session` before path elision was implemented.

Focused GREEN result: 31 test files passed, 164 tests passed.

## Final verification

- `pnpm run check` — PASS; TypeScript, ESLint, 31 test files, 164 tests.
- `pnpm run compile` — PASS.
- `pnpm run package --out codex-cost-extension.vsix` — PASS; prepublish repeated lint and all 164 tests, produced 46-file VSIX.
- `pnpm run verify-package` — PASS; 46 paths verified.
- `git diff --check` — PASS (only Git line-ending notices on Windows).

The bundled runtime did not expose `npm.cmd`, while `vsce` invokes `npm run vscode:prepublish`. A temporary untracked forwarding shim was used only for packaging and removed immediately afterward.

## Self-review

- `engines.vscode` remains `^1.96.0`.
- No runtime dependency or network behavior was added.
- Custom range validation exists on both browser and host boundaries; only the host can persist preferences.
- The copied summary is derived solely from the current serialized report and includes no session detail collection or project path/key.
- Existing sidebar copy behavior remains unchanged; only the in-Cost-Center action uses the selected Cost Center filters.
- Comparison metadata is optional to preserve compatibility with session timelines and non-comparison charts.

No known remaining concerns in the reviewed scope.

## Follow-up review wave

Three final review findings were handled in a separate TDD cycle:

- Complete but impossible or inverted custom dates now update the persistent `role="alert"` element directly in the browser while posting no `setRange` action. Partial edits remain local and quiet; the next valid complete range clears the error and posts once.
- Copied driver labels now strip every directory prefix whenever either path separator is present. Tests cover drive, UNC, extended Windows, POSIX, and mixed-separator paths.
- `extension/out/src/view/costCenterSummary.js` is now a mandatory package-verifier path with an explicit missing-module regression.

RED evidence: the focused suite reported two browser-alert failures, UNC and extended-path disclosure failures, and acceptance of a package missing `costCenterSummary.js`.

Final follow-up verification:

- Focused tests: PASS; complete suite executed with 31 files and 172 tests.
- `pnpm run check`: PASS; TypeScript, ESLint, 31 files, 172 tests.
- `pnpm run compile`: PASS.
- `pnpm run package --out codex-cost-extension.vsix`: PASS; prepublish reran all 172 tests.
- `pnpm run verify-package`: PASS; 46 package paths verified, including the summary runtime.

## Malformed-date client follow-up

The final client distinction is now explicit and regression-tested:

- `input` events while a custom date is being typed remain DOM-local and silent.
- Once both date fields are non-empty, `change` and capture-phase `blur` treat malformed formats such as `2026-03-01`, `1.3.2026`, and arbitrary text as committed invalid input.
- Committed invalid input renders the exact accessible DD.MM.YYYY range message, posts zero `setRange` messages, and therefore cannot replace host state or preferences.
- A subsequent valid exact range clears the inline error and posts once.

RED evidence: all three malformed-format parameter cases failed because the client left the alert hidden.

Final verification after the runtime change:

- Focused client regression: PASS; full Vitest run reported 31 files and 175 tests.
- `pnpm run check`: PASS; TypeScript, ESLint, 31 files, 175 tests.
- Compile, VSIX package/prepublish, and package verification: PASS; package verifier accepted all 46 required paths.
