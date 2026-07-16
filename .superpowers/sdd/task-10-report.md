# Task 10 report

Implemented `CostCenter`, its strict discriminated message parser, retained webview hosting, callback/render error containment, exclusion confirmation, and dirty close Save/Discard/Cancel handling.

Validation canonicalizes allowlisted fields, rejects unknown message types, wrong primitive/value types, non-allowlisted guided settings, non-finite numbers, oversized strings/lists, invalid sort columns, and unsafe chart bounds. Chart filtering accepts the Task 9 `pointStart` / `pointEndExclusive` shape.

TDD evidence: the focused message test first failed because `src/view/costCenter.ts` did not exist, then passed after implementation. Focused verification: 2 files, 18 tests passed. Full verification: TypeScript, ESLint, and 28 test files / 125 tests passed.

Legacy dashboard deletion is intentionally deferred: `src/extension.ts` still imports and constructs `CostDashboard`, and Task 11 owns replacing that wiring. Deleting the files during Task 10 would break the extension. The old files can be removed immediately after Task 11 eliminates those references.
