# Codex Cost Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone VS Code extension that reads local Codex session JSONL files, estimates token cost from user-configured per-model pricing, and shows the result in a dedicated sidebar.

**Architecture:** Use a standard unbundled TypeScript VS Code extension with a native `TreeDataProvider` sidebar. Keep parsing, aggregation, workspace matching, and configuration as small focused modules so the UI layer only orchestrates scanning and rendering.

**Tech Stack:** TypeScript, VS Code Extension API, Node.js filesystem/stream APIs, Vitest

---

## File Structure

**Note:** This folder is not currently a git repository, and the user has not requested git actions. This plan intentionally omits commit steps.

### Files to create

- `package.json`
  - VS Code extension manifest, commands, view contributions, and settings schema
- `tsconfig.json`
  - TypeScript compiler settings for extension and test files
- `.gitignore`
  - Ignore `node_modules`, compiled output, and VS Code test artifacts
- `.vscode/launch.json`
  - Launch the Extension Development Host with `F5`
- `resources/codex-cost.svg`
  - Activity bar icon for the contributed container
- `src/extension.ts`
  - Extension activation, command registration, refresh orchestration
- `src/config.ts`
  - Read and normalize extension settings
- `src/domain/types.ts`
  - Shared domain and report types
- `src/domain/workspaceMatcher.ts`
  - Normalize Windows paths and match workspace roots
- `src/domain/sessionAggregator.ts`
  - Filter sessions, compute estimated costs, build report data
- `src/data/sessionScanner.ts`
  - Recursively discover `.jsonl` log files under configured roots
- `src/data/jsonlSessionParser.ts`
  - Stream and parse session JSONL files
- `src/view/costTreeProvider.ts`
  - Tree view node building and refresh behavior
- `test/fixtures/workspace-session.jsonl`
  - Fixture for a VS Code session in the current workspace
- `test/fixtures/other-workspace-session.jsonl`
  - Fixture for a VS Code session outside the current workspace
- `test/fixtures/malformed-session.jsonl`
  - Fixture with malformed lines and missing pricing/model data
- `test/unit/workspaceMatcher.test.ts`
  - Unit tests for path normalization and workspace matching
- `test/unit/jsonlSessionParser.test.ts`
  - Unit tests for JSONL parsing and latest snapshot selection
- `test/unit/sessionScanner.test.ts`
  - Unit tests for recursive file discovery
- `test/unit/sessionAggregator.test.ts`
  - Unit tests for scope filtering, cost math, and warnings
- `README.md`
  - Local install, launch, and settings instructions

### Files to leave alone

- `readme.txt`
  - Existing placeholder file; do not depend on it

## Task 1: Bootstrap the extension workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.vscode/launch.json`
- Create: `resources/codex-cost.svg`

- [ ] **Step 1: Create the extension manifest**

Create `package.json` with this exact content:

```json
{
  "name": "codex-cost-extension",
  "displayName": "Codex Cost",
  "description": "Estimate Codex token usage cost from local session logs.",
  "version": "0.0.1",
  "publisher": "gambjako",
  "engines": {
    "vscode": "^1.74.0"
  },
  "categories": [
    "Other"
  ],
  "main": "./out/src/extension.js",
  "activationEvents": [
    "onView:codexCost.usage",
    "onCommand:codexCost.refresh",
    "onCommand:codexCost.setScopeWorkspace",
    "onCommand:codexCost.setScopeAll",
    "onCommand:codexCost.openSettings"
  ],
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "codexCost",
          "title": "Codex Cost",
          "icon": "resources/codex-cost.svg"
        }
      ]
    },
    "views": {
      "codexCost": [
        {
          "id": "codexCost.usage",
          "name": "Usage & Cost"
        }
      ]
    },
    "commands": [
      {
        "command": "codexCost.refresh",
        "title": "Refresh Codex Cost View",
        "icon": "$(refresh)"
      },
      {
        "command": "codexCost.setScopeWorkspace",
        "title": "Show Workspace Sessions",
        "icon": "$(folder)"
      },
      {
        "command": "codexCost.setScopeAll",
        "title": "Show All Sessions",
        "icon": "$(globe)"
      },
      {
        "command": "codexCost.openSettings",
        "title": "Open Codex Cost Settings",
        "icon": "$(gear)"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "codexCost.refresh",
          "when": "view == codexCost.usage",
          "group": "navigation"
        },
        {
          "command": "codexCost.setScopeWorkspace",
          "when": "view == codexCost.usage",
          "group": "navigation@1"
        },
        {
          "command": "codexCost.setScopeAll",
          "when": "view == codexCost.usage",
          "group": "navigation@2"
        },
        {
          "command": "codexCost.openSettings",
          "when": "view == codexCost.usage",
          "group": "navigation@3"
        }
      ]
    },
    "configuration": {
      "title": "Codex Cost",
      "properties": {
        "codexCost.logRoots": {
          "type": "array",
          "default": [
            "%USERPROFILE%/.codex/sessions"
          ],
          "items": {
            "type": "string"
          },
          "description": "Directories to scan for local Codex session JSONL files."
        },
        "codexCost.pricing.models": {
          "type": "object",
          "default": {},
          "description": "Per-model pricing used for local estimated cost.",
          "additionalProperties": {
            "type": "object",
            "required": [
              "inputPer1M",
              "cachedInputPer1M",
              "outputPer1M"
            ],
            "properties": {
              "inputPer1M": {
                "type": "number",
                "minimum": 0,
                "description": "Price for one million non-cached input tokens."
              },
              "cachedInputPer1M": {
                "type": "number",
                "minimum": 0,
                "description": "Price for one million cached input tokens."
              },
              "outputPer1M": {
                "type": "number",
                "minimum": 0,
                "description": "Price for one million output tokens."
              }
            }
          }
        },
        "codexCost.scopeDefault": {
          "type": "string",
          "enum": [
            "workspace",
            "all"
          ],
          "default": "workspace",
          "description": "Default scope used when the Codex Cost view opens."
        },
        "codexCost.workspaceMatchMode": {
          "type": "string",
          "enum": [
            "startsWith"
          ],
          "default": "startsWith",
          "description": "Workspace matching strategy for comparing logged session cwd values to open workspace folders."
        }
      }
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test": "vitest run",
    "vscode:prepublish": "npm run compile"
  },
  "devDependencies": {
    "@types/node": "^22.15.30",
    "@types/vscode": "^1.74.0",
    "typescript": "^5.8.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Add TypeScript, ignore, launch, and icon files**

Create `tsconfig.json` with this exact content:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": [
      "ES2022"
    ],
    "outDir": "out",
    "rootDir": ".",
    "strict": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "moduleResolution": "node",
    "skipLibCheck": true
  },
  "include": [
    "src/**/*.ts",
    "test/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    ".vscode-test"
  ]
}
```

Create `.gitignore` with this exact content:

```gitignore
node_modules/
out/
.vscode-test/
*.vsix
```

Create `.vscode/launch.json` with this exact content:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Codex Cost Extension",
      "type": "extensionHost",
      "request": "launch",
      "runtimeExecutable": "${execPath}",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": [
        "${workspaceFolder}/out/**/*.js"
      ],
      "preLaunchTask": "npm: compile"
    }
  ]
}
```

Create `resources/codex-cost.svg` with this exact content:

```svg
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" fill="none">
  <rect x="12" y="18" width="104" height="92" rx="12" stroke="#C5C5C5" stroke-width="10"/>
  <path d="M34 44H94" stroke="#C5C5C5" stroke-width="10" stroke-linecap="round"/>
  <path d="M34 66H74" stroke="#C5C5C5" stroke-width="10" stroke-linecap="round"/>
  <path d="M34 88H58" stroke="#C5C5C5" stroke-width="10" stroke-linecap="round"/>
  <circle cx="92" cy="82" r="16" stroke="#C5C5C5" stroke-width="10"/>
  <path d="M92 72V92" stroke="#C5C5C5" stroke-width="8" stroke-linecap="round"/>
  <path d="M82 82H102" stroke="#C5C5C5" stroke-width="8" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 3: Install the development dependencies**

Run:

```bash
npm install
```

Expected:

- `node_modules/` is created
- `package-lock.json` is created
- the command exits with code `0`

- [ ] **Step 4: Verify the manifest and dependency graph**

Run:

```bash
npm ls --depth=0
```

Expected:

- `typescript`
- `vitest`
- `@types/node`
- `@types/vscode`

All should appear without an `UNMET DEPENDENCY` error.

- [ ] **Step 5: Leave git untouched**

Do not run any git commands here.

Expected:

- The project remains a normal local folder
- No commits, branches, or repo initialization happen

## Task 2: Add shared types and workspace path matching

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/workspaceMatcher.ts`
- Test: `test/unit/workspaceMatcher.test.ts`

- [ ] **Step 1: Write the failing workspace matcher test**

Create `test/unit/workspaceMatcher.test.ts` with this exact content:

```ts
import { describe, expect, it } from 'vitest';

import { matchesWorkspaceRoots, normalizeFsPath } from '../../src/domain/workspaceMatcher';

describe('normalizeFsPath', () => {
  it('normalizes separators, case, and trailing slashes', () => {
    expect(normalizeFsPath('C:\\Users\\gambjako\\Repo\\')).toBe('c:/users/gambjako/repo');
  });
});

describe('matchesWorkspaceRoots', () => {
  it('matches the same workspace root ignoring case', () => {
    expect(
      matchesWorkspaceRoots('C:\\Users\\gambjako\\Repositories\\codex_cost_extension', [
        'c:/users/gambjako/repositories/codex_cost_extension'
      ])
    ).toBe(true);
  });

  it('matches child folders within the workspace', () => {
    expect(
      matchesWorkspaceRoots('C:\\Users\\gambjako\\Repositories\\codex_cost_extension\\src', [
        'C:\\Users\\gambjako\\Repositories\\codex_cost_extension'
      ])
    ).toBe(true);
  });

  it('does not match sibling folders that share a prefix', () => {
    expect(
      matchesWorkspaceRoots('C:\\Users\\gambjako\\Repositories\\codex_cost_extension_two', [
        'C:\\Users\\gambjako\\Repositories\\codex_cost_extension'
      ])
    ).toBe(false);
  });

  it('returns false when session cwd is missing', () => {
    expect(matchesWorkspaceRoots(undefined, ['C:\\Users\\gambjako\\Repositories\\codex_cost_extension'])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run test/unit/workspaceMatcher.test.ts
```

Expected:

- FAIL
- The error should mention that `../../src/domain/workspaceMatcher` cannot be found

- [ ] **Step 3: Create the shared domain types and workspace matcher**

Create `src/domain/types.ts` with this exact content:

```ts
export type ViewScope = 'workspace' | 'all';

export interface TokenUsageSnapshot {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ParsedSession {
  sessionId: string;
  filePath: string;
  updatedAt: string;
  source?: string;
  originator?: string;
  cwd?: string;
  model?: string;
  usage?: TokenUsageSnapshot;
}

export interface ModelPricing {
  inputPer1M: number;
  cachedInputPer1M: number;
  outputPer1M: number;
}

export type PricingByModel = Record<string, ModelPricing>;

export interface SessionReportItem {
  sessionId: string;
  cwd?: string;
  label: string;
  model?: string;
  updatedAt: string;
  tokens: TokenUsageSnapshot;
  estimatedCost?: number;
  hasPricing: boolean;
}

export interface ModelReportItem {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  sessionCount: number;
  estimatedCost?: number;
  hasPricing: boolean;
}

export interface SummaryReportItem {
  sessionsCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface UsageReport {
  summary: SummaryReportItem;
  models: ModelReportItem[];
  sessions: SessionReportItem[];
  warnings: string[];
}
```

Create `src/domain/workspaceMatcher.ts` with this exact content:

```ts
import * as path from 'node:path';

export function normalizeFsPath(input: string): string {
  const resolved = path.resolve(input);
  const withForwardSlashes = resolved.replace(/\\/g, '/');
  const withoutTrailingSlash = withForwardSlashes.replace(/\/+$/, '');

  return withoutTrailingSlash.toLowerCase();
}

export function matchesWorkspaceRoots(sessionCwd: string | undefined, workspaceRoots: readonly string[]): boolean {
  if (!sessionCwd) {
    return false;
  }

  const normalizedSession = normalizeFsPath(sessionCwd);

  return workspaceRoots.some((workspaceRoot) => {
    const normalizedWorkspace = normalizeFsPath(workspaceRoot);

    return normalizedSession === normalizedWorkspace || normalizedSession.startsWith(`${normalizedWorkspace}/`);
  });
}
```

- [ ] **Step 4: Re-run the workspace matcher test**

Run:

```bash
npx vitest run test/unit/workspaceMatcher.test.ts
```

Expected:

- PASS
- `4 passed`

- [ ] **Step 5: Keep the repo state local**

Do not run git commands.

Expected:

- The files are created locally
- No repo metadata changes happen

## Task 3: Parse Codex session JSONL files

**Files:**
- Create: `src/data/jsonlSessionParser.ts`
- Create: `test/fixtures/workspace-session.jsonl`
- Create: `test/fixtures/malformed-session.jsonl`
- Test: `test/unit/jsonlSessionParser.test.ts`

- [ ] **Step 1: Create fixture logs and the failing parser test**

Create `test/fixtures/workspace-session.jsonl` with this exact content:

```json
{"timestamp":"2026-06-01T08:00:00.000Z","type":"session_meta","payload":{"id":"session-workspace","source":"vscode","originator":"codex_vscode","cwd":"C:\\Users\\gambjako\\Repositories\\codex_cost_extension"}}
{"timestamp":"2026-06-01T08:01:00.000Z","type":"turn_context","payload":{"cwd":"C:\\Users\\gambjako\\Repositories\\codex_cost_extension","model":"gpt-5.4"}}
{"timestamp":"2026-06-01T08:02:00.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":1000,"cached_input_tokens":200,"output_tokens":400,"total_tokens":1400}}}}
{"timestamp":"2026-06-01T08:03:00.000Z","type":"turn_context","payload":{"cwd":"C:\\Users\\gambjako\\Repositories\\codex_cost_extension\\src","model":"gpt-5.4"}}
{"timestamp":"2026-06-01T08:04:00.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":2500,"cached_input_tokens":700,"output_tokens":900,"total_tokens":3400}}}}
```

Create `test/fixtures/malformed-session.jsonl` with this exact content:

```json
{"timestamp":"2026-06-01T09:00:00.000Z","type":"session_meta","payload":{"id":"session-malformed","source":"vscode","originator":"codex_vscode","cwd":"C:\\Users\\gambjako\\Repositories\\other_repo"}}
this is not json
{"timestamp":"2026-06-01T09:01:00.000Z","type":"turn_context","payload":{"cwd":"C:\\Users\\gambjako\\Repositories\\other_repo"}}
{"timestamp":"2026-06-01T09:02:00.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":300,"cached_input_tokens":0,"output_tokens":50,"total_tokens":350}}}}
```

Create `test/unit/jsonlSessionParser.test.ts` with this exact content:

```ts
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseSessionFile } from '../../src/data/jsonlSessionParser';

describe('parseSessionFile', () => {
  it('uses the latest cumulative token snapshot and most recent model/cwd data', async () => {
    const fixturePath = path.resolve('test/fixtures/workspace-session.jsonl');

    const session = await parseSessionFile(fixturePath);

    expect(session).not.toBeNull();
    expect(session?.sessionId).toBe('session-workspace');
    expect(session?.source).toBe('vscode');
    expect(session?.originator).toBe('codex_vscode');
    expect(session?.model).toBe('gpt-5.4');
    expect(session?.cwd).toBe('C:\\Users\\gambjako\\Repositories\\codex_cost_extension\\src');
    expect(session?.usage).toEqual({
      inputTokens: 2500,
      cachedInputTokens: 700,
      outputTokens: 900,
      totalTokens: 3400
    });
    expect(session?.updatedAt).toBe('2026-06-01T08:04:00.000Z');
  });

  it('ignores malformed lines and still returns valid session data', async () => {
    const fixturePath = path.resolve('test/fixtures/malformed-session.jsonl');

    const session = await parseSessionFile(fixturePath);

    expect(session).not.toBeNull();
    expect(session?.sessionId).toBe('session-malformed');
    expect(session?.model).toBeUndefined();
    expect(session?.usage).toEqual({
      inputTokens: 300,
      cachedInputTokens: 0,
      outputTokens: 50,
      totalTokens: 350
    });
  });
});
```

- [ ] **Step 2: Run the parser test to verify it fails**

Run:

```bash
npx vitest run test/unit/jsonlSessionParser.test.ts
```

Expected:

- FAIL
- The error should mention that `../../src/data/jsonlSessionParser` cannot be found

- [ ] **Step 3: Implement the JSONL session parser**

Create `src/data/jsonlSessionParser.ts` with this exact content:

```ts
import * as fs from 'node:fs';
import * as readline from 'node:readline';
import * as path from 'node:path';

import type { ParsedSession, TokenUsageSnapshot } from '../domain/types';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toTokenSnapshot(value: unknown): TokenUsageSnapshot | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const inputTokens = asNumber(record.input_tokens);
  const cachedInputTokens = asNumber(record.cached_input_tokens) ?? 0;
  const outputTokens = asNumber(record.output_tokens);
  const totalTokens = asNumber(record.total_tokens);

  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: totalTokens ?? inputTokens + outputTokens
  };
}

function fallbackSessionId(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

export async function parseSessionFile(filePath: string): Promise<ParsedSession | null> {
  const session: ParsedSession = {
    sessionId: fallbackSessionId(filePath),
    filePath,
    updatedAt: ''
  };

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  for await (const line of reader) {
    if (!line.trim()) {
      continue;
    }

    let parsed: JsonRecord | undefined;

    try {
      parsed = JSON.parse(line) as JsonRecord;
    } catch {
      continue;
    }

    const timestamp = asString(parsed.timestamp);
    if (timestamp && timestamp > session.updatedAt) {
      session.updatedAt = timestamp;
    }

    const type = asString(parsed.type);
    const payload = asRecord(parsed.payload);

    if (!type || !payload) {
      continue;
    }

    if (type === 'session_meta') {
      session.sessionId = asString(payload.id) ?? session.sessionId;
      session.source = asString(payload.source) ?? session.source;
      session.originator = asString(payload.originator) ?? session.originator;
      session.cwd = asString(payload.cwd) ?? session.cwd;
      continue;
    }

    if (type === 'turn_context') {
      session.cwd = asString(payload.cwd) ?? session.cwd;
      session.model = asString(payload.model) ?? session.model;
      continue;
    }

    if (type === 'event_msg' && asString(payload.type) === 'token_count') {
      const info = asRecord(payload.info);
      const usage = toTokenSnapshot(info?.total_token_usage);

      if (usage) {
        session.usage = usage;
      }
    }
  }

  stream.close();

  if (!session.updatedAt) {
    return null;
  }

  return session;
}
```

- [ ] **Step 4: Re-run the parser test**

Run:

```bash
npx vitest run test/unit/jsonlSessionParser.test.ts
```

Expected:

- PASS
- `2 passed`

- [ ] **Step 5: Do not widen scope**

Do not add SQLite parsing here.

Expected:

- The parser supports JSONL only
- There are no `sqlite` dependencies in `package.json`

## Task 4: Discover session files and aggregate usage reports

**Files:**
- Create: `src/data/sessionScanner.ts`
- Create: `src/domain/sessionAggregator.ts`
- Create: `test/fixtures/other-workspace-session.jsonl`
- Test: `test/unit/sessionScanner.test.ts`
- Test: `test/unit/sessionAggregator.test.ts`

- [ ] **Step 1: Add the scanner and aggregator tests**

Create `test/fixtures/other-workspace-session.jsonl` with this exact content:

```json
{"timestamp":"2026-06-01T10:00:00.000Z","type":"session_meta","payload":{"id":"session-other","source":"vscode","originator":"codex_vscode","cwd":"C:\\Users\\gambjako\\Repositories\\other_repo"}}
{"timestamp":"2026-06-01T10:01:00.000Z","type":"turn_context","payload":{"cwd":"C:\\Users\\gambjako\\Repositories\\other_repo","model":"gpt-5.4"}}
{"timestamp":"2026-06-01T10:02:00.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":1000,"cached_input_tokens":0,"output_tokens":500,"total_tokens":1500}}}}
```

Create `test/unit/sessionScanner.test.ts` with this exact content:

```ts
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findSessionFiles } from '../../src/data/sessionScanner';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await fs.rm(directory, { recursive: true, force: true });
    })
  );
});

describe('findSessionFiles', () => {
  it('recursively finds jsonl files and ignores other extensions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cost-'));
    tempDirectories.push(root);

    const nested = path.join(root, '2026', '06', '01');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(nested, 'session-a.jsonl'), '{}\n', 'utf8');
    await fs.writeFile(path.join(nested, 'ignore.txt'), 'nope\n', 'utf8');

    const files = await findSessionFiles([root]);

    expect(files).toEqual([path.join(nested, 'session-a.jsonl')]);
  });
});
```

Create `test/unit/sessionAggregator.test.ts` with this exact content:

```ts
import { describe, expect, it } from 'vitest';

import { buildUsageReport } from '../../src/domain/sessionAggregator';
import type { ParsedSession, PricingByModel } from '../../src/domain/types';

const pricing: PricingByModel = {
  'gpt-5.4': {
    inputPer1M: 5,
    cachedInputPer1M: 1,
    outputPer1M: 15
  }
};

const sessions: ParsedSession[] = [
  {
    sessionId: 'workspace-priced',
    filePath: 'workspace-priced.jsonl',
    updatedAt: '2026-06-01T08:04:00.000Z',
    source: 'vscode',
    originator: 'codex_vscode',
    cwd: 'C:\\Users\\gambjako\\Repositories\\codex_cost_extension',
    model: 'gpt-5.4',
    usage: {
      inputTokens: 2500,
      cachedInputTokens: 700,
      outputTokens: 900,
      totalTokens: 3400
    }
  },
  {
    sessionId: 'all-priced',
    filePath: 'all-priced.jsonl',
    updatedAt: '2026-06-01T10:02:00.000Z',
    source: 'vscode',
    originator: 'codex_vscode',
    cwd: 'C:\\Users\\gambjako\\Repositories\\other_repo',
    model: 'gpt-5.4',
    usage: {
      inputTokens: 1000,
      cachedInputTokens: 0,
      outputTokens: 500,
      totalTokens: 1500
    }
  },
  {
    sessionId: 'workspace-unpriced',
    filePath: 'workspace-unpriced.jsonl',
    updatedAt: '2026-06-01T11:00:00.000Z',
    source: 'vscode',
    originator: 'codex_vscode',
    cwd: 'C:\\Users\\gambjako\\Repositories\\codex_cost_extension\\src',
    model: 'unknown-model',
    usage: {
      inputTokens: 600,
      cachedInputTokens: 100,
      outputTokens: 50,
      totalTokens: 650
    }
  }
];

describe('buildUsageReport', () => {
  it('filters to the current workspace and computes priced totals', () => {
    const report = buildUsageReport(
      sessions,
      pricing,
      'workspace',
      ['C:\\Users\\gambjako\\Repositories\\codex_cost_extension']
    );

    expect(report.summary.sessionsCount).toBe(2);
    expect(report.summary.inputTokens).toBe(3100);
    expect(report.summary.cachedInputTokens).toBe(800);
    expect(report.summary.outputTokens).toBe(950);
    expect(report.summary.totalTokens).toBe(4050);
    expect(report.summary.estimatedCost).toBeCloseTo(0.0232);
    expect(report.warnings).toContain('Missing pricing for model: unknown-model');
  });

  it('includes all sessions when the all scope is requested', () => {
    const report = buildUsageReport(sessions, pricing, 'all', [
      'C:\\Users\\gambjako\\Repositories\\codex_cost_extension'
    ]);

    expect(report.summary.sessionsCount).toBe(3);
    expect(report.summary.inputTokens).toBe(4100);
    expect(report.summary.outputTokens).toBe(1450);
    expect(report.models.find((item) => item.model === 'gpt-5.4')?.sessionCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run the scanner and aggregator tests to verify they fail**

Run:

```bash
npx vitest run test/unit/sessionScanner.test.ts test/unit/sessionAggregator.test.ts
```

Expected:

- FAIL
- The error should mention that `../../src/data/sessionScanner` and `../../src/domain/sessionAggregator` cannot be found

- [ ] **Step 3: Implement the scanner**

Create `src/data/sessionScanner.ts` with this exact content:

```ts
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

async function walkDirectory(directoryPath: string, output: string[]): Promise<void> {
  let entries: fs.Dirent[];

  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === 'ENOENT' || code === 'EACCES') {
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      await walkDirectory(fullPath, output);
      continue;
    }

    if (entry.isFile() && fullPath.toLowerCase().endsWith('.jsonl')) {
      output.push(fullPath);
    }
  }
}

export async function findSessionFiles(logRoots: readonly string[]): Promise<string[]> {
  const files: string[] = [];

  for (const logRoot of logRoots) {
    await walkDirectory(logRoot, files);
  }

  return files.sort((left, right) => left.localeCompare(right));
}
```

- [ ] **Step 4: Implement the usage aggregator**

Create `src/domain/sessionAggregator.ts` with this exact content:

```ts
import * as path from 'node:path';

import type {
  ModelPricing,
  ModelReportItem,
  ParsedSession,
  PricingByModel,
  SessionReportItem,
  SummaryReportItem,
  TokenUsageSnapshot,
  UsageReport,
  ViewScope
} from './types';
import { matchesWorkspaceRoots } from './workspaceMatcher';

function isVsCodeSession(session: ParsedSession): boolean {
  if (session.source) {
    return session.source.toLowerCase() === 'vscode';
  }

  if (session.originator) {
    return session.originator.toLowerCase().includes('vscode');
  }

  return true;
}

function getSessionLabel(session: ParsedSession): string {
  if (!session.cwd) {
    return session.sessionId;
  }

  return path.basename(session.cwd) || session.cwd;
}

function estimateCost(snapshot: TokenUsageSnapshot, pricing: ModelPricing | undefined): number | undefined {
  if (!pricing) {
    return undefined;
  }

  const nonCachedInputTokens = Math.max(snapshot.inputTokens - snapshot.cachedInputTokens, 0);

  return (nonCachedInputTokens / 1_000_000) * pricing.inputPer1M +
    (snapshot.cachedInputTokens / 1_000_000) * pricing.cachedInputPer1M +
    (snapshot.outputTokens / 1_000_000) * pricing.outputPer1M;
}

function toSessionReportItem(session: ParsedSession, pricingByModel: PricingByModel, warnings: Set<string>): SessionReportItem {
  const tokens = session.usage as TokenUsageSnapshot;
  const pricing = session.model ? pricingByModel[session.model] : undefined;
  const estimatedCost = estimateCost(tokens, pricing);

  if (session.model && !pricing) {
    warnings.add(`Missing pricing for model: ${session.model}`);
  }

  if (!session.model) {
    warnings.add(`Missing model for session: ${session.sessionId}`);
  }

  return {
    sessionId: session.sessionId,
    cwd: session.cwd,
    label: getSessionLabel(session),
    model: session.model,
    updatedAt: session.updatedAt,
    tokens,
    estimatedCost,
    hasPricing: Boolean(pricing)
  };
}

function buildSummary(items: SessionReportItem[]): SummaryReportItem {
  return items.reduce<SummaryReportItem>(
    (summary, item) => {
      summary.sessionsCount += 1;
      summary.inputTokens += item.tokens.inputTokens;
      summary.cachedInputTokens += item.tokens.cachedInputTokens;
      summary.outputTokens += item.tokens.outputTokens;
      summary.totalTokens += item.tokens.totalTokens;
      summary.estimatedCost += item.estimatedCost ?? 0;

      return summary;
    },
    {
      sessionsCount: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0
    }
  );
}

function buildModels(items: SessionReportItem[]): ModelReportItem[] {
  const models = new Map<string, ModelReportItem>();

  for (const item of items) {
    const key = item.model ?? 'unknown';
    const existing = models.get(key);

    if (existing) {
      existing.inputTokens += item.tokens.inputTokens;
      existing.cachedInputTokens += item.tokens.cachedInputTokens;
      existing.outputTokens += item.tokens.outputTokens;
      existing.totalTokens += item.tokens.totalTokens;
      existing.sessionCount += 1;
      existing.estimatedCost =
        existing.estimatedCost === undefined || item.estimatedCost === undefined
          ? undefined
          : existing.estimatedCost + item.estimatedCost;
      existing.hasPricing = existing.hasPricing && item.hasPricing;
      continue;
    }

    models.set(key, {
      model: key,
      inputTokens: item.tokens.inputTokens,
      cachedInputTokens: item.tokens.cachedInputTokens,
      outputTokens: item.tokens.outputTokens,
      totalTokens: item.tokens.totalTokens,
      sessionCount: 1,
      estimatedCost: item.estimatedCost,
      hasPricing: item.hasPricing
    });
  }

  return Array.from(models.values()).sort((left, right) => right.totalTokens - left.totalTokens);
}

export function buildUsageReport(
  sessions: readonly ParsedSession[],
  pricingByModel: PricingByModel,
  scope: ViewScope,
  workspaceRoots: readonly string[]
): UsageReport {
  const warnings = new Set<string>();

  const scopedSessions = sessions
    .filter(isVsCodeSession)
    .filter((session) => session.usage)
    .filter((session) => {
      if (scope === 'all') {
        return true;
      }

      return matchesWorkspaceRoots(session.cwd, workspaceRoots);
    });

  const sessionItems = scopedSessions
    .map((session) => toSessionReportItem(session, pricingByModel, warnings))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return {
    summary: buildSummary(sessionItems),
    models: buildModels(sessionItems),
    sessions: sessionItems,
    warnings: Array.from(warnings).sort((left, right) => left.localeCompare(right))
  };
}
```

- [ ] **Step 5: Re-run the scanner and aggregator tests**

Run:

```bash
npx vitest run test/unit/sessionScanner.test.ts test/unit/sessionAggregator.test.ts
```

Expected:

- PASS
- `3 passed`

## Task 5: Add settings, the tree provider, and extension activation

**Files:**
- Create: `src/config.ts`
- Create: `src/view/costTreeProvider.ts`
- Create: `src/extension.ts`

- [ ] **Step 1: Create the configuration module**

Create `src/config.ts` with this exact content:

```ts
import * as os from 'node:os';
import * as path from 'node:path';

import * as vscode from 'vscode';

import type { PricingByModel, ViewScope } from './domain/types';

export interface ExtensionConfig {
  logRoots: string[];
  pricingByModel: PricingByModel;
  scopeDefault: ViewScope;
  workspaceMatchMode: 'startsWith';
}

function resolveHomePath(input: string): string {
  const homeDirectory = process.env.USERPROFILE ?? os.homedir();

  return path.resolve(
    input
      .replace(/^~(?=$|[\\/])/, homeDirectory)
      .replace(/%USERPROFILE%/gi, homeDirectory)
  );
}

function normalizePricing(value: unknown): PricingByModel {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>());
  const pricing: PricingByModel = {};

  for (const [model, candidate] of entries) {
    if (typeof candidate !== 'object' || candidate === null) {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const inputPer1M = typeof record.inputPer1M === 'number' ? record.inputPer1M : undefined;
    const cachedInputPer1M = typeof record.cachedInputPer1M === 'number' ? record.cachedInputPer1M : undefined;
    const outputPer1M = typeof record.outputPer1M === 'number' ? record.outputPer1M : undefined;

    if (inputPer1M === undefined || cachedInputPer1M === undefined || outputPer1M === undefined) {
      continue;
    }

    pricing[model] = {
      inputPer1M,
      cachedInputPer1M,
      outputPer1M
    };
  }

  return pricing;
}

export function readExtensionConfig(): ExtensionConfig {
  const configuration = vscode.workspace.getConfiguration('codexCost');

  const rawRoots = configuration.get<string[]>('logRoots', ['%USERPROFILE%/.codex/sessions']);
  const scopeDefault = configuration.get<ViewScope>('scopeDefault', 'workspace');
  const workspaceMatchMode = configuration.get<'startsWith'>('workspaceMatchMode', 'startsWith');
  const rawPricing = configuration.get<Record<string, unknown>>('pricing.models', {});

  return {
    logRoots: rawRoots.map(resolveHomePath),
    pricingByModel: normalizePricing(rawPricing),
    scopeDefault,
    workspaceMatchMode
  };
}
```

- [ ] **Step 2: Create the tree provider**

Create `src/view/costTreeProvider.ts` with this exact content:

```ts
import * as vscode from 'vscode';

import { readExtensionConfig } from '../config';
import { parseSessionFile } from '../data/jsonlSessionParser';
import { findSessionFiles } from '../data/sessionScanner';
import { buildUsageReport } from '../domain/sessionAggregator';
import type { ParsedSession, UsageReport, ViewScope } from '../domain/types';

const SCOPE_KEY = 'codexCost.scope';

interface TreeNode {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  icon?: vscode.ThemeIcon;
  command?: vscode.Command;
  collapsibleState: vscode.TreeItemCollapsibleState;
  children?: TreeNode[];
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatCost(value: number | undefined): string {
  return value === undefined ? 'Unavailable' : value.toFixed(4);
}

function leafNode(id: string, label: string, description?: string, tooltip?: string, icon?: vscode.ThemeIcon): TreeNode {
  return {
    id,
    label,
    description,
    tooltip,
    icon,
    collapsibleState: vscode.TreeItemCollapsibleState.None
  };
}

function sectionNode(id: string, label: string, children: TreeNode[]): TreeNode {
  return {
    id,
    label,
    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
    children
  };
}

export class CodexCostTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeNode | undefined | void>();
  private nodes: TreeNode[] = [
    leafNode('loading', 'Loading Codex session data...', undefined, undefined, new vscode.ThemeIcon('loading~spin'))
  ];
  private scope: ViewScope;

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.scope = context.workspaceState.get<ViewScope>(SCOPE_KEY) ?? readExtensionConfig().scopeDefault;
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, element.collapsibleState);
    item.id = element.id;
    item.description = element.description;
    item.tooltip = element.tooltip;
    item.command = element.command;
    item.iconPath = element.icon;
    return item;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.nodes;
    }

    return element.children ?? [];
  }

  async initialize(): Promise<void> {
    await this.refresh();
  }

  async setScope(scope: ViewScope): Promise<void> {
    this.scope = scope;
    await this.context.workspaceState.update(SCOPE_KEY, scope);
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const configuration = readExtensionConfig();
    const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);

    try {
      const sessionFiles = await findSessionFiles(configuration.logRoots);

      if (sessionFiles.length === 0) {
        this.nodes = [
          leafNode('empty', 'No Codex logs found', undefined, configuration.logRoots.join('\n'), new vscode.ThemeIcon('warning'))
        ];
        this.onDidChangeTreeDataEmitter.fire();
        return;
      }

      const sessions: ParsedSession[] = [];
      for (const filePath of sessionFiles) {
        const session = await parseSessionFile(filePath);
        if (session) {
          sessions.push(session);
        }
      }

      const report = buildUsageReport(sessions, configuration.pricingByModel, this.scope, workspaceRoots);
      this.nodes = this.buildNodes(report);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.nodes = [
        leafNode('error', 'Failed to load Codex logs', message, message, new vscode.ThemeIcon('error'))
      ];
    }

    this.onDidChangeTreeDataEmitter.fire();
  }

  private buildNodes(report: UsageReport): TreeNode[] {
    const nodes: TreeNode[] = [
      leafNode(
        'scope',
        'Scope',
        this.scope === 'workspace' ? 'Workspace' : 'All Sessions',
        'Current report scope',
        new vscode.ThemeIcon('symbol-enum')
      ),
      sectionNode('summary', 'Summary', [
        leafNode('summary-cost', 'Estimated cost', formatCost(report.summary.estimatedCost)),
        leafNode('summary-total', 'Total tokens', formatTokens(report.summary.totalTokens)),
        leafNode('summary-input', 'Input tokens', formatTokens(report.summary.inputTokens)),
        leafNode('summary-cached', 'Cached input tokens', formatTokens(report.summary.cachedInputTokens)),
        leafNode('summary-output', 'Output tokens', formatTokens(report.summary.outputTokens)),
        leafNode('summary-sessions', 'Sessions', String(report.summary.sessionsCount))
      ])
    ];

    if (report.models.length > 0) {
      nodes.push(
        sectionNode(
          'models',
          'Per-model breakdown',
          report.models.map((model) =>
            leafNode(
              `model-${model.model}`,
              model.model,
              `${formatCost(model.estimatedCost)} | ${formatTokens(model.totalTokens)} tokens`,
              `${model.sessionCount} sessions`
            )
          )
        )
      );
    }

    if (report.sessions.length > 0) {
      nodes.push(
        sectionNode(
          'sessions',
          'Recent sessions',
          report.sessions.map((session) =>
            leafNode(
              `session-${session.sessionId}`,
              session.label,
              `${session.model ?? 'Unknown model'} | ${formatCost(session.estimatedCost)}`,
              `${session.updatedAt}\n${session.cwd ?? session.sessionId}`
            )
          )
        )
      );
    }

    if (report.warnings.length > 0) {
      nodes.push(
        sectionNode(
          'warnings',
          'Warnings',
          report.warnings.map((warning, index) =>
            leafNode(`warning-${index}`, warning, undefined, warning, new vscode.ThemeIcon('warning'))
          )
        )
      );
    }

    if (report.summary.sessionsCount === 0) {
      nodes.push(
        leafNode(
          'no-data',
          'No matching Codex usage found',
          this.scope === 'workspace' ? 'Switch to All Sessions to inspect machine-wide data' : 'No token_count records were parsed',
          undefined,
          new vscode.ThemeIcon('info')
        )
      );
    }

    return nodes;
  }
}
```

- [ ] **Step 3: Create the activation entry point**

Create `src/extension.ts` with this exact content:

```ts
import * as vscode from 'vscode';

import { CodexCostTreeProvider } from './view/costTreeProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const provider = new CodexCostTreeProvider(context);

  context.subscriptions.push(vscode.window.registerTreeDataProvider('codexCost.usage', provider));

  context.subscriptions.push(
    vscode.commands.registerCommand('codexCost.refresh', async () => {
      await provider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexCost.setScopeWorkspace', async () => {
      await provider.setScope('workspace');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexCost.setScopeAll', async () => {
      await provider.setScope('all');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexCost.openSettings', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'codexCost');
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('codexCost')) {
        await provider.refresh();
      }
    })
  );

  await provider.initialize();
}

export function deactivate(): void {}
```

- [ ] **Step 4: Compile the extension**

Run:

```bash
npm run compile
```

Expected:

- PASS
- JavaScript output is emitted under `out/`
- No TypeScript errors are reported

- [ ] **Step 5: Run the full unit test suite**

Run:

```bash
npm test
```

Expected:

- PASS
- All tests in `test/unit/` pass

## Task 6: Add usage docs and verify in the Extension Development Host

**Files:**
- Create: `README.md`

- [ ] **Step 1: Add the local usage README**

Create `README.md` with this exact content:

````md
# Codex Cost

Codex Cost is a local VS Code extension that estimates Codex usage cost from session logs stored on the current machine.

## What it does

- Reads local Codex session JSONL files
- Aggregates token usage by scope, model, and session
- Applies per-model prices from VS Code settings
- Shows the result in a dedicated sidebar

## What it does not do

- It does not call Azure, OpenAI, or any billing API
- It does not require authentication
- It does not show billed cost

## Default log source

The extension scans:

```json
["%USERPROFILE%/.codex/sessions"]
```

## Pricing configuration

Set prices in VS Code settings:

```json
{
  "codexCost.pricing.models": {
    "gpt-5.4": {
      "inputPer1M": 0,
      "cachedInputPer1M": 0,
      "outputPer1M": 0
    }
  }
}
```

Replace the `0` values with your own current estimated prices.

## Local development

1. Run `npm install`
2. Run `npm run compile`
3. Press `F5` in VS Code
4. In the Extension Development Host, open the `Codex Cost` activity bar item
````

- [ ] **Step 2: Verify compile and tests again after the README lands**

Run:

```bash
npm run compile
npm test
```

Expected:

- Both commands pass
- The README does not affect compile or tests

- [ ] **Step 3: Run the extension in the Extension Development Host**

In VS Code:

1. Press `F5`
2. Wait for the Extension Development Host window to open
3. Open the `Codex Cost` activity bar container
4. Confirm that the `Usage & Cost` view renders
5. Use the title-bar commands to switch between `Workspace` and `All Sessions`
6. Open settings and add a real `codexCost.pricing.models` entry
7. Trigger `Refresh Codex Cost View`

Expected:

- The sidebar loads without authentication
- The summary updates after pricing is configured
- The scope changes the visible totals when session `cwd` values differ across repos
- Missing pricing shows warnings instead of fake totals

- [ ] **Step 4: Verify against real local Codex session data**

Use the local machine's existing Codex logs under `%USERPROFILE%/.codex/sessions`.

Expected:

- At least one real session appears if local Codex has been used
- `Workspace` totals are lower than `All Sessions` if multiple repos have Codex history
- Models present in local logs without pricing appear in the warnings section

## Self-Review

### Spec coverage

- Standalone extension scaffold: Task 1
- JSONL-only parsing: Task 3
- Manual per-model pricing: Task 1 settings schema + Task 5 config
- Workspace/all scope: Task 5 provider + Task 6 manual verification
- Summary, per-model, and recent sessions UI: Task 5 provider
- Warnings for missing pricing/model data: Task 4 aggregator + Task 5 provider
- No authentication or network usage: Task 1 manifest/runtime deps + Task 6 manual verification

### Placeholder scan

- No `TBD`
- No `TODO`
- No "implement later"
- Every code-creation step includes exact file content
- Every verification step includes concrete commands or UI actions

### Type consistency

- `ViewScope` is `workspace | all` across config, provider, and aggregator
- `PricingByModel` uses `inputPer1M`, `cachedInputPer1M`, and `outputPer1M` everywhere
- `ParsedSession.usage` resolves to `TokenUsageSnapshot` across parser and aggregator
