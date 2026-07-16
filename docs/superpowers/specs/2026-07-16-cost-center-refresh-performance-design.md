# Cost Center Refresh Performance Design

Date: 2026-07-16
Status: Approved for specification review

## Goal

Make refreshes over large local Codex JSONL collections as fast as practical without changing Cost Center results, privacy guarantees, packaging, or supported platforms. Optimization is benchmark-driven rather than tied to one hardware-specific latency promise.

The primary scenarios are:

1. a cold refresh with no repository cache;
2. a warm refresh where every file is unchanged;
3. an incremental refresh where one active JSONL file has grown;
4. a recovery refresh where a file was truncated or replaced.

## Baseline and Direction

The current repository already caches parsed sessions in memory and parses changed files with bounded concurrency. A warm refresh still recursively discovers every JSONL file and performs a separate metadata lookup for every discovered path. Any changed file is then parsed from byte zero.

The first optimization stage keeps the implementation in TypeScript and uses Node.js built-ins only. It combines scan metadata, reuses unchanged parsed sessions, and incrementally parses safe appends. This adopts the useful principles demonstrated by `hanbu97/tokenusage`—parallel scanning, caching, and avoiding repeated full work—without introducing a Rust binary, runtime network access, or a third-party dependency.

A persistent disk cache is intentionally deferred. Measurements after this stage will determine whether extension restarts remain a meaningful bottleneck.

## Architecture

### File discovery with metadata

The scanner returns a stable, sorted list of descriptors rather than paths alone. Each descriptor contains the resolved path, size, modification time, creation/change time where available, and a stable file identity when Node and the platform expose one reliably.

Directory traversal remains tolerant of missing and inaccessible roots. Independent roots and directories may be scanned concurrently through a bounded worker pool. The implementation must not create one unbounded promise per directory or file.

The repository consumes scanner-provided metadata directly. It does not issue a second metadata lookup for files whose scan descriptor is complete.

### Cache states

Each in-memory cache entry stores:

- the last accepted file descriptor;
- the normalized parsed session or null result;
- accumulated parser diagnostics;
- the last fully consumed byte offset;
- any incomplete trailing UTF-8/JSONL fragment needed for the next append;
- enough parser state to continue producing the same session result as a full parse.

The repository chooses exactly one path for each file:

- **unchanged:** descriptor matches, so return the cached result without opening the file;
- **safe append:** identity is compatible, size increased, and prior parser state is resumable, so read from the stored offset;
- **full parse:** file is new, shrank, was replaced, metadata is ambiguous, or incremental state is unavailable;
- **failure:** report the existing warning shape and evict unsafe cache state so a later refresh can recover.

Deleted files are removed from the cache after discovery.

### Incremental JSONL parser

Parsing logic is split into a reusable state reducer and stream adapters. A full-file adapter starts with an empty state. An append adapter clones the last committed state, reads from the committed byte offset, joins any stored trailing fragment, and feeds only complete lines to the same reducer.

The committed offset advances only through bytes that have been read successfully. An incomplete final line is retained without being counted as malformed. When later completed, that line is parsed exactly once.

UTF-8 decoding uses a stateful decoder so a multibyte character split across reads is not corrupted. CRLF and LF input retain current behavior. Empty lines remain ignored.

Incremental processing must preserve all established semantics:

- earliest valid timestamp becomes `startedAt`;
- latest valid timestamp becomes `updatedAt`;
- later metadata and turn context update source, originator, working directory, and model as today;
- token snapshots and usage history remain ordered and identical to a clean full parse;
- malformed-line, timestamp, and token-record diagnostics remain cumulative and are never double-counted.

### Concurrency and scheduling

Scanning and parsing use explicit, independently bounded concurrency. Defaults are conservative and may be derived from available parallelism, but hard upper bounds prevent excessive file handles and memory pressure. Result order remains deterministic regardless of completion order.

The existing refresh coordinator continues to coalesce overlapping refresh requests. No concurrent mutation of a cache entry is allowed; one repository load owns the mutation phase at a time through the existing refresh flow.

## Data Flow

1. A refresh asks the scanner for file descriptors across configured roots.
2. The repository removes cache entries for paths no longer present.
3. It classifies every descriptor as unchanged, safe append, or full parse.
4. Bounded workers process only append and full-parse entries.
5. Successful parser states replace their corresponding cache entries atomically.
6. Cached and newly parsed sessions are returned in stable path order.
7. Existing aggregation, sidebar, status bar, notifications, and Cost Center presentation consume the unchanged `LoadSessionsResult` contract.

## Correctness and Recovery

- A truncation always triggers a full parse.
- A probable replacement at the same path triggers a full parse even if size increased.
- Ambiguous metadata favors correctness and falls back to full parsing.
- A failed append never overwrites the last valid cache entry with partial state; the refresh reports a warning and the next load may retry safely.
- A malformed complete line is counted once. An incomplete trailing line is not malformed until it becomes a complete invalid line.
- If incremental and full parsing disagree in tests, full parsing defines the required result.

## Privacy and Packaging

- Runtime data remains local-only.
- No pricing, telemetry, authentication, or other network request is added.
- No prompt or response content is persisted outside the already returned normalized session fields.
- No third-party runtime dependency or native executable is added.
- Temporary benchmark data uses generated content and is never packaged.
- Existing VS Code engine, Node.js CI, pnpm, package-verification, and excluded-file constraints remain unchanged.

## Measurement

A deterministic benchmark harness generates synthetic JSONL fixtures outside the packaged extension. It records elapsed time and relevant work counters for cold, warm, single-append, and replacement scenarios at multiple file counts and total sizes.

Wall-clock results are reported as observations, not brittle unit-test assertions. Automated tests assert work elimination instead:

- a warm refresh performs no file opens or parses;
- scanner metadata prevents duplicate per-file metadata calls;
- a single append reads only the appended region when safe;
- unchanged files retain object-equivalent results;
- bounded concurrency never exceeds its configured limit.

Before and after measurements use the same generated dataset, Node version, machine, and process conditions. The implementation is accepted only if warm and single-append work is materially reduced without a material cold-refresh regression.

## Testing

### Parser tests

- full and incremental parsing produce identical sessions and diagnostics;
- appended metadata, context, token records, and malformed lines update state correctly;
- partial lines and split UTF-8 characters resume correctly;
- truncation and replacement select full parsing.

### Scanner tests

- descriptors include the metadata required by the repository;
- roots and directories respect bounded concurrency;
- inaccessible roots remain isolated;
- output remains resolved, deduplicated, and sorted.

### Repository tests

- warm loads reuse every unchanged entry without parsing;
- one grown file uses the append path while unchanged files do no work;
- deletion evicts cache state;
- failed reads preserve warnings and permit recovery;
- result and warning ordering remains deterministic.

### Integration and regression tests

- Cost Center analytics from a cold refresh and an incremental refresh are deeply equal;
- refresh coalescing remains intact;
- the complete existing check suite passes;
- packaging contains no benchmark fixtures, caches, or new native/runtime dependencies.

## Acceptance Criteria

1. Existing Cost Center, sidebar, status-bar, notification, refresh, privacy, and package behavior is unchanged.
2. A warm refresh does not reopen or reparse unchanged JSONL files and avoids a duplicate metadata pass.
3. A safely grown active JSONL file is processed from its committed offset rather than byte zero.
4. Truncated, replaced, ambiguous, or failed files recover through a correct full parse without corrupting cached results.
5. Full and incremental paths return identical normalized sessions and diagnostics for equivalent final file content.
6. Scanner and parser concurrency is bounded, configurable in tests, and deterministic in output.
7. Benchmarks demonstrate materially less work and lower elapsed time for warm and single-append scenarios with no material cold-refresh regression.
8. No third-party runtime dependency, native helper, runtime network access, or packaged benchmark data is introduced.

## Deferred Work

- a versioned persistent cache across VS Code restarts;
- native Rust or worker-thread parsing;
- file-system watchers replacing scheduled refresh;
- changes to Cost Center features or presentation.
