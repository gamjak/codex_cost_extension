# Codex Cost Extension Design

Date: 2026-06-01
Status: Approved for planning

## Goal

Build a standalone VS Code extension that shows estimated Codex usage cost directly inside VS Code by reading local Codex session logs.

The extension is a local estimator only:

- no Azure authentication
- no OpenAI or Azure API calls
- no billed-cost reconciliation
- no cloud-side usage lookup

## User Intent

The user wants a VS Code extension that:

- reads local Codex usage data
- estimates costs from that usage
- shows the results in a sidebar
- works without authentication

## Scope

### In Scope

- Standalone VS Code extension project in this repository
- Read Codex session JSONL files from the local machine
- Parse local token usage from Codex session logs
- Estimate costs from manually configured per-model prices
- Sidebar view with workspace/all-session scope
- Current workspace by default, with toggle to all sessions
- Manual refresh plus automatic load on activation
- Clear warning states for missing logs or missing pricing

### Out of Scope

- Azure Monitor
- Azure Cost Management
- OpenAI billing APIs
- Authentication of any kind
- Exact billed-cost reporting
- Charts and historical trend visualizations
- SQLite log parsing in v1
- Network access

## Data Source

Version 1 reads only local Codex session JSONL files under:

- `%USERPROFILE%\.codex\sessions\**\*.jsonl`

The current local Codex files already expose the fields needed for a useful estimator:

- session metadata such as `cwd`, `source`, and session identity
- model information in `turn_context.payload.model`
- cumulative token counts in `token_count`

The extension should treat these JSONL files as the only supported source in v1.

## Key Assumptions

1. Local Codex session logs remain readable by the current user.
2. Session JSONL files continue to include `token_count` events with cumulative totals.
3. Session JSONL files continue to include a resolvable model value at session or turn level.
4. `source = "vscode"` or equivalent VS Code origin fields are available for filtering.
5. Estimated cost is acceptable as long as the UI clearly distinguishes it from billed cost.

## Product Shape

The extension contributes one dedicated activity bar container and one sidebar view.

Suggested naming:

- Activity bar container: `Codex Cost`
- Primary view: `Usage & Cost`

The UI stays operational and dense rather than decorative.

## Default Sidebar Contents

### Controls

- Scope switch: `Workspace` or `All Sessions`
- Refresh action

### Summary

- Estimated cost
- Total tokens
- Input tokens
- Output tokens
- Cached input tokens
- Session count

### Per-Model Breakdown

For each model:

- model name
- estimated cost
- input tokens
- cached input tokens
- output tokens

### Recent Sessions

For each recent session:

- workspace or session label
- model
- last updated timestamp
- estimated cost

## Empty and Warning States

The sidebar must handle at least these states:

- No Codex logs found
- Codex logs found, but no token usage parsed
- Pricing missing for one or more models
- Session parsed, but model missing so cost cannot be computed

When pricing is missing, the extension must still show tokens and mark the cost as unavailable rather than inventing a value.

## Extension Architecture

Use a standard TypeScript VS Code extension with a conservative structure.

Suggested modules:

- `src/extension.ts`
  - activation
  - command registration
  - view registration
- `src/config.ts`
  - read and validate settings
- `src/domain/types.ts`
  - shared domain types
- `src/data/sessionScanner.ts`
  - file discovery under configured log roots
- `src/data/jsonlSessionParser.ts`
  - tolerant JSONL parsing and event extraction
- `src/domain/sessionAggregator.ts`
  - latest snapshot selection and cost aggregation
- `src/domain/workspaceMatcher.ts`
  - workspace path normalization and filtering
- `src/view/costTreeProvider.ts`
  - tree items for summary, models, sessions, warnings

## View Technology Choice

Use a `TreeDataProvider` for v1 instead of a custom webview.

Reasoning:

- smaller implementation
- native sidebar behavior
- simpler refresh flow
- easier to keep reviewable
- good enough for structured summary and breakdown data

A webview can be introduced later if charts or richer layouts become necessary.

## Settings Design

### `codexCost.logRoots`

List of directories to scan for session logs.

Default:

```json
["%USERPROFILE%/.codex/sessions"]
```

### `codexCost.pricing.models`

Map of model name to token pricing.

Example:

```json
{
  "gpt-5.4": {
    "inputPer1M": 0,
    "cachedInputPer1M": 0,
    "outputPer1M": 0
  }
}
```

All prices are explicit, user-maintained estimates per one million tokens.

### `codexCost.scopeDefault`

Default view scope:

- `workspace`
- `all`

Default should be `workspace`.

### `codexCost.sources.include`

Optional normalized source filter. An empty array includes all sources. Supported normalized values include `vscode`, `cli`, `desktop`, and `unknown`.

## Log Filtering Rules

The extension reads local Codex sessions from all configured roots by default.

Primary signals:

- `session_meta.payload.source == "vscode"`
- or `session_meta.payload.originator` matching VS Code Codex origin values

Source filters are applied only when `codexCost.sources.include` is non-empty. Sessions without a recognized source are classified as `unknown`.

## Parsing Rules

The parser reads JSONL files line by line and extracts only the event types needed for v1.

### Relevant Event Types

- `session_meta`
- `turn_context`
- `event_msg` where `payload.type == "token_count"`

### Session Metadata Resolution

For each session, resolve:

- session id
- source
- cwd
- model
- latest activity timestamp

Resolution priority:

1. latest usable `turn_context`
2. `session_meta`
3. file-path-derived fallback identifiers

### Token Resolution

For each session, use the newest available cumulative token snapshot from:

- `event_msg.payload.info.total_token_usage`

This is critical: the extension must not sum every `token_count` event because those records are rolling totals and would overcount.

Instead, keep only the latest cumulative snapshot per session.

## Cost Formula

For each session:

- `nonCachedInputTokens = max(input_tokens - cached_input_tokens, 0)`
- `cachedInputTokens = cached_input_tokens`
- `outputTokens = output_tokens`

Estimated cost:

- `nonCachedInputTokens / 1_000_000 * inputPer1M`
- `cachedInputTokens / 1_000_000 * cachedInputPer1M`
- `outputTokens / 1_000_000 * outputPer1M`

Session cost is the sum of those three values.

Model cost and scope cost are sums of session costs.

## Workspace Scope Matching

Workspace mode includes only sessions whose normalized logged `cwd` matches one of the open workspace folders.

For Windows path safety:

- compare case-insensitively
- normalize path separators
- normalize trailing separators

Matching rule for v1:

- `sessionCwd == workspaceRoot`
- or `sessionCwd` starts with `workspaceRoot`

If the user has a multi-root workspace open, a session counts as workspace-scoped when it matches any root.

## Refresh Behavior

### Automatic

- Load data on extension activation
- Load data when the sidebar first becomes active

### Manual

- Command and toolbar button to refresh immediately

Version 1 should not add background indexing or aggressive file watching unless required during implementation.

## Error Handling

The parser and scanner should be tolerant:

- ignore malformed JSONL lines after logging an internal warning
- ignore unreadable files and continue scanning
- ignore sessions without token snapshots for cost totals

The sidebar should surface user-meaningful warnings without becoming noisy.

## Proposed Commands

- `codexCost.refresh`
- `codexCost.setScopeWorkspace`
- `codexCost.setScopeAll`
- `codexCost.openSettings`

Commands should remain minimal in v1.

## Testing and Verification Strategy

### Automated

- Unit tests for JSONL parsing from fixture files
- Unit tests for latest-token-snapshot selection
- Unit tests for cost calculation
- Unit tests for workspace path normalization and matching
- Unit tests for missing-pricing behavior

### Manual

- Run the extension in VS Code extension host
- Verify current workspace filtering against known local Codex sessions
- Verify all-sessions totals differ when multiple repos are represented in local logs
- Verify pricing changes in settings alter the displayed estimate
- Verify warning states for unknown model pricing

## Risks and Mitigations

### Risk: Codex JSONL format changes

Mitigation:

- keep parser narrow and tolerant
- isolate format handling in one module
- surface "unsupported log shape" as warning rather than crashing

### Risk: Manual prices drift from real vendor pricing

Mitigation:

- label all values as estimated
- require explicit per-model pricing in settings

### Risk: Missing model information in some sessions

Mitigation:

- show token totals without estimated cost
- surface a missing-pricing or missing-model warning

### Risk: Very large local log history

Mitigation:

- parse line by line
- aggregate per session while scanning
- avoid storing full file contents in memory

## Simplest Elegant Solution

For v1, the simplest elegant solution is:

- standalone TypeScript VS Code extension
- `TreeDataProvider` sidebar
- JSONL-only parser
- latest cumulative token snapshot per session
- manual pricing in settings
- workspace/all-session scope toggle

This keeps the first implementation small, reviewable, and aligned with the actual local Codex data that already exists.

## Acceptance Criteria

1. The extension loads local Codex session JSONL files without authentication.
2. The extension shows an estimated cost summary in a VS Code sidebar.
3. The extension supports `Workspace` and `All Sessions` scope.
4. The extension computes estimates from the latest cumulative token snapshot per session.
5. The extension supports manual per-model prices for input, cached input, and output tokens.
6. The extension shows tokens even when pricing is missing.
7. The extension clearly labels costs as estimates.
8. The extension can be refreshed manually from the sidebar.
