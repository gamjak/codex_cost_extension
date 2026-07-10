# Changelog

All notable changes to Codex Cost are documented here.

## Unreleased

- Make budget alerts opt-in, persistent, localized, and actionable.
- Add source filtering, duplicate-session protection, locale-aware model matching, and period-boundary refreshes.
- Defer startup refresh work and expand tests for source selection, persistence, duplicate sessions, and day boundaries.

## 0.2.2

- Cache parsed session files and only re-read changed logs.
- Isolate unreadable or malformed logs instead of failing the complete report.
- Prevent overlapping refreshes and refresh when workspace folders change.
- Deduplicate overlapping log roots and handle cumulative token counter resets.
- Apply budgets to the active scope and include all Codex session sources.
- Match dated model variants to the longest configured pricing family.
- Improve cross-platform workspace matching and locale-aware formatting.
- Add release metadata, localization, linting, CI, and packaging checks.

## 0.2.0

- Added status-bar cost and budget tracking.
- Added fixed start-date filtering and automatic refresh.
