# Task 5 — Guided settings drafts

## RED

- Added `test/unit/costCenterSettings.test.ts` before implementation.
- Ran `pnpm vitest run test/unit/costCenterSettings.test.ts` with the bundled Node runtime available on `PATH`.
- Result: exit 1; Vitest reported `Cannot find module '../../src/domain/costCenterSettings'` from the new test file.

## GREEN

- Added the minimal allowlisted guided-settings draft, validation, group-reset, and diff implementation in `src/domain/costCenterSettings.ts`.
- Focused test: `pnpm vitest run test/unit/costCenterSettings.test.ts` — exit 0, 1 file and 4 tests passed.
- Full verification: `pnpm check` — exit 0; TypeScript and ESLint passed, then Vitest reported 25 files and 100 tests passed.

## Notes

- `settingsUpdates` contains only the explicit `GuidedSettingField` allowlist; pricing values are not read or emitted.
- Reset and draft creation clone arrays, so recommended defaults and input configuration are not mutated.
