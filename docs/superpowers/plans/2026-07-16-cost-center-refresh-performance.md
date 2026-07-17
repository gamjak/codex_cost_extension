# Cost Center Refresh Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make warm and single-append refreshes over large local Codex JSONL collections materially faster while preserving byte-for-byte-equivalent normalized results.

**Architecture:** Discover files and their metadata in one bounded scan, then classify each cached file as unchanged, safely appended, or requiring a full parse. Refactor JSONL parsing around a resumable checkpoint that consumes appended bytes with the same line reducer as a cold parse, while retaining deterministic ordering and safe full-parse fallbacks.

**Tech Stack:** TypeScript 5.9, Node.js built-ins, VS Code Extension API 1.96, Vitest 4, pnpm 11.7.0.

## Global Constraints

- Runtime data remains local-only; add no network request, authentication, billing API, telemetry, prompt content, or response content.
- Add no third-party runtime dependency, native executable, worker process, or packaged benchmark fixture.
- Preserve existing Cost Center, sidebar, status-bar, notification, refresh-coalescing, cache, and package-verification behavior.
- Keep `engines.vscode` at `^1.96.0`, Node.js CI at 22, and `pnpm@11.7.0`.
- Full and incremental parsing of the same final bytes must produce deeply equal normalized sessions and diagnostics.
- Scanner and parser concurrency must be bounded and output order must remain deterministic.
- Truncated, replaced, ambiguous, or failed files must fall back to a correct full parse or a recoverable warning.
- Follow TDD for every behavior change and commit after every independently reviewable task.

---

## File Structure

### New files

- `src/data/sessionParseCheckpoint.ts` — owns parser state, immutable checkpoint cloning, complete-line reduction, and incremental byte-stream parsing.
- `test/performance/sessionRepository.bench.ts` — generates temporary synthetic JSONL collections and reports cold, warm, append, and replacement timings plus work counters.

### Modified files

- `src/data/sessionScanner.ts` — returns sorted file descriptors with metadata through bounded directory traversal.
- `src/data/jsonlSessionParser.ts` — delegates full and incremental parsing to the checkpoint parser while retaining existing public functions.
- `src/data/sessionRepository.ts` — classifies cache entries and avoids duplicate metadata and full-file reads.
- `test/unit/sessionScanner.test.ts` — verifies metadata, ordering, isolation, and concurrency bounds.
- `test/unit/jsonlSessionParser.test.ts` — verifies full/incremental equivalence, fragments, diagnostics, and UTF-8 boundaries.
- `test/unit/sessionRepository.test.ts` — verifies work elimination and safe fallback classification.
- `test/unit/costTreeProviderSnapshot.test.ts` — verifies that optimized repository results still publish through existing consumers.
- `package.json` — adds a non-packaged performance command only.
- `README.md` and `CHANGELOG.md` — document faster local refresh behavior without hardware-specific promises.

---

### Task 1: Discover files and metadata in one bounded scan

**Files:**
- Modify: `src/data/sessionScanner.ts`
- Modify: `test/unit/sessionScanner.test.ts`

**Interfaces:**
- Produces: `SessionFileDescriptor`, `SessionScannerOptions`, and `findSessionFileDescriptors(logRoots, options?)`.
- Consumers: `SessionRepository` in Task 3.

- [ ] **Step 1: Write failing descriptor and concurrency tests**

Add tests that create nested temporary roots, then assert resolved sorted paths and metadata:

```ts
import { findSessionFileDescriptors } from '../../src/data/sessionScanner';

it('discovers resolved JSONL descriptors in deterministic order', async () => {
  const root = await makeFixture({
    'z/session.jsonl': '{}\n',
    'a/session.jsonl': '{}\n',
    'ignore.txt': 'ignored'
  });

  const descriptors = await findSessionFileDescriptors([root], { concurrency: 2 });

  expect(descriptors.map(({ filePath }) => filePath)).toEqual([
    path.resolve(root, 'a/session.jsonl'),
    path.resolve(root, 'z/session.jsonl')
  ]);
  expect(descriptors.every(({ size, mtimeMs, ctimeMs }) =>
    size === 3 && Number.isFinite(mtimeMs) && Number.isFinite(ctimeMs)
  )).toBe(true);
});
```

Inject an optional observation callback and assert the active metadata operations never exceed the configured bound:

```ts
let active = 0;
let maximum = 0;
await findSessionFileDescriptors([root], {
  concurrency: 2,
  onMetadataStart: () => { active += 1; maximum = Math.max(maximum, active); },
  onMetadataEnd: () => { active -= 1; }
});
expect(maximum).toBeLessThanOrEqual(2);
```

Also retain assertions that `ENOENT`/`EACCES` roots do not prevent valid roots from loading and duplicate roots do not duplicate descriptors.

- [ ] **Step 2: Run the scanner tests to verify RED**

Run: `pnpm vitest run test/unit/sessionScanner.test.ts`

Expected: FAIL because `findSessionFileDescriptors` and descriptor metadata do not exist.

- [ ] **Step 3: Implement descriptor scanning with a bounded worker queue**

Add these contracts:

```ts
export interface SessionFileDescriptor {
  filePath: string;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  dev?: number;
  ino?: number;
}

export interface SessionScannerOptions {
  concurrency?: number;
  onMetadataStart?: () => void;
  onMetadataEnd?: () => void;
}
```

Implement `findSessionFileDescriptors` with a shared directory queue and at most `Math.max(1, Math.floor(options.concurrency ?? 8))` workers. Use `Dirent` to filter directories and `.jsonl` files, call `fs.stat` exactly once per candidate JSONL file, and construct `dev`/`ino` only when their values are non-zero finite numbers. Wrap each stat with the observation callbacks in `try/finally`. Ignore `ENOENT` and `EACCES` for both directories and files, propagate other errors, deduplicate by resolved path, and sort with `localeCompare` before returning.

Keep `findSessionFiles(logRoots)` as a compatibility wrapper:

```ts
export async function findSessionFiles(logRoots: readonly string[]): Promise<string[]> {
  return (await findSessionFileDescriptors(logRoots)).map(({ filePath }) => filePath);
}
```

- [ ] **Step 4: Run focused tests and type checking**

Run: `pnpm vitest run test/unit/sessionScanner.test.ts && pnpm exec tsc -p tsconfig.json --noEmit`

Expected: all scanner tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/data/sessionScanner.ts test/unit/sessionScanner.test.ts
git commit -m "perf(scanner): combine discovery and metadata"
```

---

### Task 2: Parse JSONL through resumable checkpoints

**Files:**
- Create: `src/data/sessionParseCheckpoint.ts`
- Modify: `src/data/jsonlSessionParser.ts`
- Modify: `test/unit/jsonlSessionParser.test.ts`

**Interfaces:**
- Consumes: `ParsedSession`, `TokenUsageSnapshot`, and a file path plus optional prior checkpoint.
- Produces: `SessionParseCheckpoint`, `SessionCheckpointResult`, `parseSessionToCheckpoint(filePath)`, and `appendSessionToCheckpoint(filePath, checkpoint)`.
- Consumers: `SessionRepository` in Task 3.

- [ ] **Step 1: Write failing full/incremental equivalence tests**

Create a file containing metadata, context, and a token record; parse it fully, append another context and token record, then compare append parsing with a fresh full parse:

```ts
const initial = await parseSessionToCheckpoint(filePath);
await fs.appendFile(filePath,
  `${JSON.stringify({ timestamp: '2026-07-16T12:02:00.000Z', type: 'turn_context', payload: { cwd: 'C:\\repo', model: 'gpt-5.4-mini' } })}\n` +
  `${JSON.stringify(tokenRecord('2026-07-16T12:03:00.000Z', 250))}\n`
);

const incremental = await appendSessionToCheckpoint(filePath, initial.checkpoint);
const complete = await parseSessionToCheckpoint(filePath);

expect(incremental.result).toEqual(complete.result);
expect(incremental.checkpoint.bytesRead).toBe((await fs.stat(filePath)).size);
```

Add focused tests for:

- an invalid partial JSON fragment produces no malformed warning until a newline completes it;
- a UTF-8 model or path split at the append boundary is decoded exactly once;
- malformed complete lines and invalid timestamps accumulate without double-counting;
- metadata and usage history from the checkpoint are not mutated when append parsing fails.

- [ ] **Step 2: Run parser tests to verify RED**

Run: `pnpm vitest run test/unit/jsonlSessionParser.test.ts`

Expected: FAIL because checkpoint APIs are missing.

- [ ] **Step 3: Implement the checkpoint state and pure line reducer**

Define these public contracts in `sessionParseCheckpoint.ts`:

```ts
export interface SessionParseDiagnostics {
  malformedLines: number;
  invalidTimestamps: number;
  invalidTokenUsageRecords: number;
}

export interface SessionParseCheckpoint {
  filePath: string;
  bytesRead: number;
  pendingBytes: Uint8Array;
  session: ParsedSession;
  diagnostics: SessionParseDiagnostics;
}

export interface SessionCheckpointResult {
  result: { session: ParsedSession | null; diagnostics: SessionParseDiagnostics };
  checkpoint: SessionParseCheckpoint;
}
```

Move the existing record guards, token conversion, fallback ID, timestamp handling, metadata/context handling, and token-history handling into `reduceSessionLine(checkpoint, line)`. Clone checkpoints before mutation:

```ts
function cloneCheckpoint(value: SessionParseCheckpoint): SessionParseCheckpoint {
  return {
    ...value,
    pendingBytes: Uint8Array.from(value.pendingBytes),
    diagnostics: { ...value.diagnostics },
    session: {
      ...value.session,
      usage: value.session.usage ? { ...value.session.usage } : undefined,
      usageHistory: value.session.usageHistory.map((entry) => ({
        ...entry,
        tokens: { ...entry.tokens }
      }))
    }
  };
}
```

- [ ] **Step 4: Implement chunked byte consumption**

Use `fs.createReadStream(filePath, { start: checkpoint.bytesRead })`. Concatenate `pendingBytes` with each incoming `Buffer`, split only on byte `0x0a`, strip one trailing `0x0d`, decode each complete line with `TextDecoder('utf-8', { fatal: false })`, and pass it to the reducer. Store the remaining bytes as `pendingBytes`; set `bytesRead` to the number of bytes successfully consumed from the file.

At EOF, attempt to parse a non-empty pending fragment only when it is complete JSON. If `JSON.parse` succeeds, reduce it and clear `pendingBytes`; if parsing fails, retain it without incrementing malformed diagnostics. Export:

```ts
export async function parseSessionToCheckpoint(filePath: string): Promise<SessionCheckpointResult>;
export async function appendSessionToCheckpoint(
  filePath: string,
  checkpoint: SessionParseCheckpoint
): Promise<SessionCheckpointResult>;
```

`appendSessionToCheckpoint` must reject a checkpoint whose `filePath` differs from the requested path.

- [ ] **Step 5: Retain the established parser API**

Update `jsonlSessionParser.ts` to re-export `SessionParseDiagnostics` and delegate:

```ts
export async function parseSessionFileWithDiagnostics(filePath: string): Promise<SessionParseResult> {
  return (await parseSessionToCheckpoint(filePath)).result;
}

export async function parseSessionFile(filePath: string): Promise<ParsedSession | null> {
  return (await parseSessionFileWithDiagnostics(filePath)).session;
}
```

- [ ] **Step 6: Run parser and regression tests**

Run: `pnpm vitest run test/unit/jsonlSessionParser.test.ts test/unit/usageTimeline.test.ts test/unit/sessionFacts.test.ts`

Expected: all focused tests PASS with full/incremental deep equality.

- [ ] **Step 7: Commit**

```bash
git add src/data/sessionParseCheckpoint.ts src/data/jsonlSessionParser.ts test/unit/jsonlSessionParser.test.ts
git commit -m "perf(parser): resume appended JSONL sessions"
```

---

### Task 3: Classify unchanged, appended, and replaced cache entries

**Files:**
- Modify: `src/data/sessionRepository.ts`
- Modify: `test/unit/sessionRepository.test.ts`
- Modify: `test/unit/costTreeProviderSnapshot.test.ts`

**Interfaces:**
- Consumes: `SessionFileDescriptor`, `findSessionFileDescriptors`, `SessionParseCheckpoint`, `parseSessionToCheckpoint`, and `appendSessionToCheckpoint`.
- Produces: the unchanged `SessionRepository.load(logRoots): Promise<LoadSessionsResult>` API and optional test observers in `SessionRepositoryOptions`.

- [ ] **Step 1: Write failing work-elimination tests**

Inject parser observers through repository options:

```ts
const events: string[] = [];
const repository = new SessionRepository({
  onParse: (kind, filePath) => events.push(`${kind}:${path.basename(filePath)}`)
});

await repository.load([root]);
expect(events).toEqual(['full:session.jsonl']);
events.length = 0;

const warm = await repository.load([root]);
expect(events).toEqual([]);
expect(warm).toEqual(cold);
```

Append one valid JSONL record and assert `['append:session.jsonl']`. Add tests that assert `full` after truncation, after replacement at the same path, and when identity metadata is ambiguous. Assert deletion removes stale sessions, a failed append returns the established warning form, and the next valid refresh recovers.

In `costTreeProviderSnapshot.test.ts`, compare the published snapshot after incremental append with a fresh repository load of the same final files.

- [ ] **Step 2: Run repository tests to verify RED**

Run: `pnpm vitest run test/unit/sessionRepository.test.ts test/unit/costTreeProviderSnapshot.test.ts`

Expected: FAIL because the repository still stats files again and reparses every changed file fully.

- [ ] **Step 3: Extend cache entries and classification**

Replace cached scalar metadata with the descriptor and checkpoint:

```ts
interface CachedSession {
  descriptor: SessionFileDescriptor;
  checkpoint: SessionParseCheckpoint;
  session: ParsedSession | null;
  warnings: string[];
}

export interface SessionRepositoryOptions {
  concurrency?: number;
  scannerConcurrency?: number;
  onParse?: (kind: 'full' | 'append', filePath: string) => void;
}
```

Use these classification helpers:

```ts
function sameIdentity(left: SessionFileDescriptor, right: SessionFileDescriptor): boolean {
  if (left.dev && left.ino && right.dev && right.ino) {
    return left.dev === right.dev && left.ino === right.ino;
  }
  return left.ctimeMs === right.ctimeMs;
}

function unchanged(cached: CachedSession, next: SessionFileDescriptor): boolean {
  const previous = cached.descriptor;
  return sameIdentity(previous, next) && previous.size === next.size && previous.mtimeMs === next.mtimeMs;
}

function safeAppend(cached: CachedSession, next: SessionFileDescriptor): boolean {
  return sameIdentity(cached.descriptor, next) && next.size > cached.descriptor.size &&
    cached.checkpoint.bytesRead === cached.descriptor.size;
}
```

Ambiguity always returns false and therefore selects a full parse.

- [ ] **Step 4: Consume scanner descriptors without duplicate stats**

Call `findSessionFileDescriptors(logRoots, { concurrency: scannerConcurrency })`, evict missing paths, and process descriptors through the existing bounded mapper. Return cached entries immediately for `unchanged`; call the append parser only for `safeAppend`; otherwise call the full parser. Invoke `onParse` immediately before the corresponding parser call.

Construct a new cache entry only after parsing succeeds. On failure, remove the entry, retain the established basename-only warning, and allow the next refresh to retry from a full parse. Preserve stable descriptor order when flattening sessions and warnings.

- [ ] **Step 5: Run focused repository and integration tests**

Run: `pnpm vitest run test/unit/sessionRepository.test.ts test/unit/sessionScanner.test.ts test/unit/jsonlSessionParser.test.ts test/unit/costTreeProviderSnapshot.test.ts test/unit/costCenterIntegration.test.ts`

Expected: all tests PASS; warm loads emit no parse events and one-file growth emits exactly one append event.

- [ ] **Step 6: Run the complete automated check**

Run: `pnpm run check`

Expected: TypeScript, ESLint, and all Vitest tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/data/sessionRepository.ts test/unit/sessionRepository.test.ts test/unit/costTreeProviderSnapshot.test.ts
git commit -m "perf(repository): skip unchanged session work"
```

---

### Task 4: Benchmark, document, package, and verify the optimization

**Files:**
- Create: `test/performance/sessionRepository.bench.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `test/unit/packageVerifier.test.ts`

**Interfaces:**
- Consumes: the public `SessionRepository` API and generated temporary JSONL data.
- Produces: `pnpm run benchmark:refresh`, human-readable timing/work output, updated documentation, and a verified VSIX.

- [ ] **Step 1: Write a failing benchmark-command assertion**

Extend `packageVerifier.test.ts` so the manifest exposes the local benchmark command while package verification continues to exclude benchmark sources and generated data:

```ts
const manifest = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};
expect(manifest.scripts?.['benchmark:refresh']).toBe(
  'vitest bench --run test/performance/sessionRepository.bench.ts'
);
expect(includedFiles.some((file) => file.startsWith('test/performance/'))).toBe(false);
expect(includedFiles.some((file) => file.includes('benchmark-data'))).toBe(false);
```

Run: `pnpm vitest run test/unit/packageVerifier.test.ts`

Expected: FAIL because `benchmark:refresh` is not contributed yet.

- [ ] **Step 2: Add the deterministic benchmark harness**

Create `test/performance/sessionRepository.bench.ts` using `fs.mkdtemp`, `performance.now`, and `SessionRepository`. Generate configurable files with valid metadata, context, and token-count JSONL records. Default to 100 files and 2,000 records per file so the command remains practical on development machines.

Measure cold, warm, single-append, and replacement scenarios with the same repository, collect `full`/`append` counts through `onParse`, and print one line per scenario:

```ts
console.log(`${scenario}\t${elapsedMs.toFixed(1)} ms\tfull=${full}\tappend=${append}`);
```

Validate work counters inside the harness and set `process.exitCode = 1` when warm performs any parse, single-append is not exactly one append, or replacement is not exactly one full parse. Always remove the temporary root in `finally`.

- [ ] **Step 3: Add the benchmark command and verify observations**

Add to `package.json`:

```json
"benchmark:refresh": "tsx test/performance/sessionRepository.bench.ts"
```

Do not add `tsx` or another dependency. Execute the TypeScript source through the project's existing Vite/Vitest toolchain instead:

```json
"benchmark:refresh": "vitest bench --run test/performance/sessionRepository.bench.ts"
```

Structure the file with Vitest `bench` cases. Validate the work counters inside each benchmark setup/teardown path and throw when they differ from the required counts. Run the command at least three times and record median observations in the commit message body or implementation report; do not add hardware-specific thresholds to tests.

Run: `pnpm run benchmark:refresh`

Expected: command exits 0, warm reports zero parse work, append reports one append and zero full parses, and replacement reports one full parse.

- [ ] **Step 4: Document the behavior**

Add a README performance note stating that unchanged files are reused in memory, safely appended active logs are read incrementally, and truncation/replacement falls back to a full local parse. Do not claim a universal millisecond figure.

Add an `Unreleased` changelog bullet:

```md
- Improved large-log refresh performance by combining discovery metadata, reusing unchanged sessions, and parsing safe JSONL appends incrementally.
```

- [ ] **Step 5: Verify the package boundary**

Run:

```bash
pnpm run check
pnpm run compile
pnpm run package --out codex-cost-extension.vsix
pnpm run verify-package
pnpm exec vsce ls --tree
```

Expected:

- TypeScript, ESLint, and the full Vitest suite pass;
- compilation emits the new parser runtime module;
- package verification passes;
- `out/src/data/sessionParseCheckpoint.js` is included;
- `test/performance`, generated data, source maps, local logs, and caches are excluded.

- [ ] **Step 6: Compare before and after measurements**

Copy the benchmark source to an ignored scratch location in the original `main` checkout and adjust only its repository import so it runs against `main`; use identical generator constants and Node process settings. Run both benchmark variants three times and record cold, warm, append, and replacement medians in the implementation report. Accept the feature only when warm and append work is eliminated as specified and cold elapsed time has no material regression; if cold regresses by more than 10% across three medians, investigate before completion. Remove the scratch copy after recording the result.

- [ ] **Step 7: Commit**

```bash
git add test/performance/sessionRepository.bench.ts package.json README.md CHANGELOG.md test/unit/packageVerifier.test.ts
git commit -m "perf: benchmark incremental session refresh"
```

- [ ] **Step 8: Confirm completion state**

Run:

```bash
git status --short
git log --oneline --decorate -6
```

Expected: the worktree is clean except for the ignored local VSIX, and the design plus four focused implementation commits are visible.

---

## Plan Self-Review Checklist

- File discovery and metadata are combined in Task 1.
- Full/incremental parser equivalence and fragment handling are implemented in Task 2.
- Unchanged, append, truncation, replacement, deletion, and recovery classifications are implemented in Task 3.
- Bounded concurrency and deterministic output have focused tests.
- Benchmark observations and work-elimination assertions are separated so timing does not make CI flaky.
- Existing public repository and parser entry points remain compatible.
- Runtime privacy, dependency, packaging, and supported-version constraints remain unchanged.
- Persistent cache, Rust, worker threads, file watchers, and UI changes remain deferred.
