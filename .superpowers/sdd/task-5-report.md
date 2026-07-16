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

## Review-fix TDD wave

### RED

- Added regressions for deep mutation attempts against `RECOMMENDED_GUIDED_SETTINGS`, independent draft/reset arrays, and the absence of pricing from the public guided-settings input and output.
- Focused run: `pnpm vitest run test/unit/costCenterSettings.test.ts` — exit 1; 2 of 7 tests failed because the nested recommended log-root array accepted mutation and that mutation contaminated a later reset.

### GREEN

- Replaced the `ExtensionConfig` intersection with exported `GuidedSettingsConfig`, which declares only the fields consumed by this module.
- Deep-froze every nested recommended-default object and array. Draft creation and resets retain independent mutable copies for editing.
- Focused run: `pnpm vitest run test/unit/costCenterSettings.test.ts` — exit 0; 7 tests passed.
- Full verification: `pnpm check` — exit 0; TypeScript and ESLint passed, then Vitest reported 25 files and 103 tests passed.
