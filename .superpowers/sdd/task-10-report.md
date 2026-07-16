# Task 10 report

Implemented `CostCenter`, its strict discriminated message parser, retained webview hosting, callback/render error containment, exclusion confirmation, and dirty close Save/Discard/Cancel handling.

Validation canonicalizes allowlisted fields, rejects unknown message types, wrong primitive/value types, non-allowlisted guided settings, non-finite numbers, oversized strings/lists, invalid sort columns, and unsafe chart bounds. Chart filtering accepts the Task 9 `pointStart` / `pointEndExclusive` shape.

TDD evidence: the focused message test first failed because `src/view/costCenter.ts` did not exist, then passed after implementation. Focused verification: 2 files, 18 tests passed. Full verification: TypeScript, ESLint, and 28 test files / 125 tests passed.

Review follow-up: chart bounds now require exact `Date#toISOString()` form, finite real dates, strict ordering, and a maximum 26-hour interval so hourly and 23/25-hour DST buckets remain valid while malformed, impossible, equal, reversed, overlong, and absurd spans are rejected. Added table-driven parser regressions and focused retained-host tests covering show/update, dirty-close Save/Discard/Cancel, invalid-save rendering, error containment, and exclusion confirmation.

Follow-up verification: focused Task 10 suite passed 3 files / 35 tests; full TypeScript, ESLint, and Vitest check passed 29 files / 142 tests.

Legacy dashboard deletion is intentionally deferred: `src/extension.ts` still imports and constructs `CostDashboard`, and Task 11 owns replacing that wiring. Deleting the files during Task 10 would break the extension. The old files can be removed immediately after Task 11 eliminates those references.
