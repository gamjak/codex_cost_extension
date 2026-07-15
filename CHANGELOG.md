# Changelog

All notable changes to Codex Cost are documented here.

## Unreleased

## 0.3.0 - 2026-07-15

- Make cross-platform CI and extension-package validation reliable and explicit.
- Verify that Marketplace artifacts exclude development and repository-only files.
- Pin GitHub Actions to immutable revisions and add bounded weekly Dependabot updates.
- Prepare a manual, approval-gated VS Code Marketplace publishing workflow; this repository does not automatically publish to the VS Code Marketplace.

- Enable configured budget warnings by default; set `codexCost.budget.notifications.enabled` to `false` to disable them.
- Make budget alerts persistent, localized, and actionable.
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
