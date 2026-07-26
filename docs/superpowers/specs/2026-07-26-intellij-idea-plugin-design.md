# IntelliJ IDEA Plugin Design

## Goal

Add a native IntelliJ IDEA plugin to the existing Codex Cost repository. The
plugin must support IntelliJ IDEA Community and Ultimate and provide the same
user-visible functionality, configuration semantics, cost calculations, and
local-only privacy model as the VS Code extension.

The most important interaction requirement is that current session, current
project, and selected budget costs remain visible in the IntelliJ IDEA status
bar without opening a menu or tool window.

## Repository Strategy

The existing repository becomes a monorepo. The VS Code extension remains in
its current root structure. The IntelliJ implementation lives in an independent
Kotlin/Gradle project under `intellij/`.

```text
codex_cost_extension/
├── src/
├── test/
├── intellij/
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   └── src/
│       ├── main/kotlin/
│       ├── main/resources/
│       └── test/kotlin/
├── shared/
│   └── conformance/
└── docs/
```

The implementations do not call one another at runtime. The IntelliJ plugin
does not start Node.js and does not require the VS Code extension. Shared JSONL
fixtures and normalized expected results under `shared/conformance/` enforce
behavioral parity between the TypeScript and Kotlin implementations.

## Supported IDEs and Toolchain

The initial compatibility range is IntelliJ IDEA 2024.2 and newer, in both
Community and Ultimate editions. The plugin uses:

- Kotlin and Java 21
- Gradle 9 or newer through the checked-in Gradle wrapper
- IntelliJ Platform Gradle Plugin 2.x
- public IntelliJ Platform APIs only

The build targets the Community platform API and declares only dependencies
available in both editions. Plugin Verifier checks the built plugin against the
oldest supported IntelliJ IDEA Community and Ultimate releases and current
stable Community and Ultimate releases.

## Functional Parity

The IntelliJ plugin implements every user-facing capability documented by the
VS Code extension at the time this design is implemented:

- Scan local Codex session JSONL files from configurable roots.
- Normalize and optionally filter Codex sources.
- Aggregate token usage by scope, model, project, and session.
- Apply built-in model-family prices and exact or family-level overrides.
- Apply a fixed inclusive start-date filter.
- Show current-session, current-project, and selected-budget values in the
  status bar.
- Show a Codex Cost tool window with project and all-sessions scopes.
- Track separate day, week, and month budgets.
- Select which budget period appears in the status bar.
- Emit warning, exceeded-budget, and recurring spend notifications once per
  threshold and calendar period.
- Open a Cost Center with overview, session, project, and model sections.
- Select Today, 7 days, 30 days, or a custom inclusive range.
- Compare the selected period with the immediately preceding period of equal
  length.
- Drill down from projects or models to matching sessions and remove the
  resulting filter.
- Configure common settings through a guided native settings page and expose
  all advanced settings.
- Refresh manually and automatically.
- Configure the daily budget directly.
- Copy a path-free cost summary to the clipboard.
- Preserve scope, range, comparison, and Cost Center section selections.
- Display warnings and partial-price states without hiding valid usage.

When the VS Code extension gains or loses a documented user-facing feature,
feature parity is not implicit. A follow-up change must deliberately update
both the conformance contract and the IntelliJ implementation.

## IntelliJ User Interface

### Status Bar

Three independent `StatusBarWidgetFactory` extensions provide:

1. Current Codex session cost
2. Current IntelliJ project cost
3. Selected day, week, or month budget status

Each widget has its own visibility setting matching the VS Code settings. The
widgets display text continuously while a project is open. Clicking a cost
widget opens the Cost Center. Tooltips explain scope, partial pricing, budget,
remaining amount, and projection where applicable.

The IntelliJ project directory is the equivalent of a VS Code workspace.
Multiple open IntelliJ projects receive separate project-scoped services,
snapshots, widgets, and Cost Center state.

### Tool Window

A project-level `Codex Cost` tool window is the IntelliJ equivalent of the VS
Code sidebar. It provides:

- Project and All Sessions scope selection
- Refresh
- Settings
- Cost Center
- Daily-budget configuration
- Summary copy
- Summary, model, session, budget, filter, and warning rows

The tool window uses native IntelliJ Swing components and actions.

### Cost Center

The Cost Center is a native IntelliJ panel shown from the tool window or status
bar. It contains Overview, Sessions, Projects, Models, and Settings sections.
The tables, filter chips, range selectors, comparison control, drill-down
behavior, guided settings, unsaved-change handling, and partial-pricing
explanations match the VS Code behavior.

### Settings and Localization

A native IntelliJ configurable stores global plugin settings. Project-specific
view state is stored separately from global configuration. English and German
resource bundles are included. Currency, dates, and numbers use the active IDE
locale while stored dates and conformance results use stable machine formats.

## Internal Architecture

The Kotlin project is divided by responsibility:

- `domain`: immutable types and pure rules for prices, aggregation, time
  windows, scopes, budgets, projections, filters, and presentation state.
- `data`: file discovery, JSONL parsing, parse checkpoints, incremental reads,
  and the session repository cache.
- `settings`: persistent global configuration and project-level view state.
- `refresh`: refresh coalescing, automatic intervals, and period-boundary
  scheduling.
- `statusbar`: three widget factories and their presentations.
- `toolwindow`: tool-window factory, model, controller, actions, and renderer.
- `costcenter`: Cost Center model, controller, tables, settings form, and
  navigation.
- `notifications`: persisted notification keys and budget threshold logic.
- `integration`: project service that owns the repository, current snapshot,
  refresh lifecycle, and UI subscriptions.

Domain and data components must not depend on IntelliJ UI APIs. UI components
consume immutable snapshots from the project service. This preserves
testability and ensures all views display the same calculation result.

## Data Flow and Refresh Lifecycle

```text
Configured JSONL roots
→ concurrent scanner
→ incremental parser and repository cache
→ source, project, and date filters
→ token and price aggregation
→ budget and projection calculation
→ immutable project snapshot
→ status bar, tool window, Cost Center, notifications
```

A project-scoped service starts when an IntelliJ project opens. It publishes an
initial snapshot after scanning and republishes when:

- the configured refresh interval expires,
- the user requests a refresh,
- a relevant setting changes,
- project roots change, or
- a day, week, or month boundary invalidates a visible budget.

Refresh requests are coalesced so scans never overlap. File I/O, parsing, and
aggregation run outside the Swing Event Dispatch Thread. Snapshot delivery and
Swing component updates run on the Event Dispatch Thread.

Unchanged files reuse cached parse results. A safely appended file is parsed
from its checkpoint. Truncation, replacement, or prefix mismatch triggers a
full parse. Removed files are removed from the cache.

## Error Handling and Privacy

One malformed or unreadable session file does not fail the complete refresh.
Malformed lines, invalid timestamps, invalid usage records, and unreadable
files create local warnings while valid sessions remain available.

Missing pricing produces a `partial` estimate. Token counts and affected
sessions stay visible, and the UI never presents a partial amount as complete.
Unexpected refresh failures are logged through IntelliJ logging and shown as a
compact local plugin notification without exposing prompt or response content.

The plugin performs no billing, authentication, telemetry, model-pricing, or
other network requests. It reads only configured local roots. Copied summaries
exclude full local paths, prompts, and responses.

## Testing

Testing has four layers:

1. Kotlin unit tests cover parsing, checkpoints, scanning, price resolution,
   aggregation, time ranges, DST boundaries, workspace matching, budget state,
   projections, notification thresholds, and presentation text.
2. Cross-implementation conformance tests run TypeScript and Kotlin against the
   same JSONL fixtures and compare normalized JSON results.
3. IntelliJ platform tests cover persistent settings, project services,
   actions, status widgets, tool-window wiring, disposal, and UI model changes.
4. Packaging checks run `buildPlugin`, `verifyPlugin`, and Plugin Verifier
   against the supported IDEA Community and Ultimate compatibility matrix.

Tests use temporary log roots and deterministic clocks. They do not inspect or
modify the developer's real Codex session directory.

## Build, CI, and Release

The existing VS Code build remains intact. GitHub Actions runs separate jobs
for:

- existing TypeScript checks and VSIX packaging,
- Kotlin compilation and tests,
- shared conformance tests,
- IntelliJ plugin packaging,
- Plugin Verifier compatibility checks.

The repository initially uses one product version for both extensions. A
release can attach the VSIX and IntelliJ ZIP artifacts under the same tag.
JetBrains Marketplace publishing and plugin signing are configured only after
the owner provides the required Marketplace token, certificate, private key,
and password as repository secrets. Local building, testing, and ZIP
installation do not require those credentials.

## Acceptance Criteria

- The IntelliJ plugin installs in supported Community and Ultimate releases.
- For identical fixtures and settings, TypeScript and Kotlin produce identical
  normalized sessions, token totals, estimated costs, price-gap state, budget
  state, and notification thresholds.
- Session, project, and budget widgets remain visible without an open menu or
  tool window and update after each published snapshot.
- Every documented VS Code capability listed in this specification has a native
  IntelliJ counterpart.
- Closing a project disposes scheduled work and UI subscriptions.
- Parsing and aggregation do not block the Event Dispatch Thread.
- A malformed file does not hide valid results from other files.
- The built IntelliJ plugin passes the configured Plugin Verifier matrix.
- No runtime network request, authentication flow, or telemetry is introduced.
