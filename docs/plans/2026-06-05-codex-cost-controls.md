# Codex Cost Controls Implementation Plan

## Goal

Implement the approved cost-controls spec with minimal scope:

- fixed `startDate` filtering for sidebar and session/workspace status items
- calendar-based day/week/month budgets
- configurable status bar visibility for session/workspace/budget
- native warning/error budget states in the status bar

## Plan

- [ ] Extend the domain model and parser to retain cumulative token snapshot history per session while preserving current latest-snapshot behavior.
- [ ] Add focused time-window and budget aggregation helpers, then update the report builder to produce:
  - filtered session/workspace totals
  - current filtered session selection
  - budget period usage and budget state
  - sidebar warnings for invalid filter dates and missing pricing
- [ ] Extend config and manifest settings for filter, budgets, and status bar visibility/period.
- [ ] Update tree and status bar presentation to surface filter/budget state without adding new UI surfaces.
- [ ] Verify with targeted and full Vitest runs plus `npm run compile`.

## Notes

- Budget windows ignore the fixed filter and always use calendar periods.
- Delta attribution follows the approved rule: each incremental delta belongs to the newer cumulative snapshot timestamp.
- Keep ordering fixed for status bar items: Session, Workspace, Budget.
