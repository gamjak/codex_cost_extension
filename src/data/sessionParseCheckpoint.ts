import * as fs from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline';

import type { ParsedSession, TokenUsageSnapshot } from '../domain/types';

type JsonRecord = Record<string, unknown>;

export interface SessionParseDiagnostics {
  malformedLines: number;
  invalidTimestamps: number;
  invalidTokenUsageRecords: number;
}

export interface SessionParseCheckpoint {
  filePath: string;
  bytesRead: number;
  pendingBytes: Uint8Array;
  trailingGuard: Uint8Array;
  session: ParsedSession;
  diagnostics: SessionParseDiagnostics;
}

export interface SessionCheckpointResult {
  result: { session: ParsedSession | null; diagnostics: SessionParseDiagnostics };
  checkpoint: SessionParseCheckpoint;
}

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
  if (!record) return undefined;

  const inputTokens = asNumber(record.input_tokens);
  const cachedInputTokens = asNumber(record.cached_input_tokens) ?? 0;
  const outputTokens = asNumber(record.output_tokens);
  const totalTokens = asNumber(record.total_tokens);
  if (inputTokens === undefined || outputTokens === undefined) return undefined;

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

function createCheckpoint(filePath: string): SessionParseCheckpoint {
  return {
    filePath,
    bytesRead: 0,
    pendingBytes: new Uint8Array(),
    trailingGuard: new Uint8Array(),
    session: { sessionId: fallbackSessionId(filePath), filePath, updatedAt: '', usageHistory: [] },
    diagnostics: { malformedLines: 0, invalidTimestamps: 0, invalidTokenUsageRecords: 0 }
  };
}

function cloneCheckpoint(value: SessionParseCheckpoint): SessionParseCheckpoint {
  return {
    ...value,
    pendingBytes: Uint8Array.from(value.pendingBytes),
    trailingGuard: Uint8Array.from(value.trailingGuard),
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

function reduceParsedRecord(checkpoint: SessionParseCheckpoint, parsed: JsonRecord): void {
  const { session, diagnostics } = checkpoint;
  const timestamp = asString(parsed.timestamp);
  const timestampMs = timestamp === undefined ? Number.NaN : Date.parse(timestamp);
  const hasValidTimestamp = Number.isFinite(timestampMs);
  if (timestamp && !hasValidTimestamp) diagnostics.invalidTimestamps += 1;
  if (timestamp && hasValidTimestamp) {
    if (!session.startedAt || timestampMs < Date.parse(session.startedAt)) session.startedAt = timestamp;
    if (!session.updatedAt || timestampMs > Date.parse(session.updatedAt)) session.updatedAt = timestamp;
  }

  const type = asString(parsed.type);
  const payload = asRecord(parsed.payload);
  if (!type || !payload) return;

  if (type === 'session_meta') {
    session.sessionId = asString(payload.id) ?? session.sessionId;
    session.source = asString(payload.source) ?? session.source;
    session.originator = asString(payload.originator) ?? session.originator;
    session.cwd = asString(payload.cwd) ?? session.cwd;
    return;
  }
  if (type === 'turn_context') {
    session.cwd = asString(payload.cwd) ?? session.cwd;
    session.model = asString(payload.model) ?? session.model;
    return;
  }
  if (type === 'event_msg' && asString(payload.type) === 'token_count') {
    const usage = toTokenSnapshot(asRecord(payload.info)?.total_token_usage);
    if (!usage) {
      diagnostics.invalidTokenUsageRecords += 1;
      return;
    }
    session.usage = usage;
    if (timestamp && hasValidTimestamp) {
      session.usageHistory.push({ timestamp, cwd: session.cwd, model: session.model, tokens: usage });
    }
  }
}

export function reduceSessionLine(checkpoint: SessionParseCheckpoint, line: string): void {
  if (!line.trim()) return;
  try {
    reduceParsedRecord(checkpoint, JSON.parse(line) as JsonRecord);
  } catch {
    checkpoint.diagnostics.malformedLines += 1;
  }
}

const trailingGuardSize = 4_096;

function updateTrailingGuard(previous: Uint8Array, chunk: Uint8Array): Uint8Array {
  if (chunk.length >= trailingGuardSize) {
    return Uint8Array.from(chunk.subarray(chunk.length - trailingGuardSize));
  }
  const retained = Math.min(previous.length, trailingGuardSize - chunk.length);
  const guard = new Uint8Array(retained + chunk.length);
  guard.set(previous.subarray(previous.length - retained));
  guard.set(chunk, retained);
  return guard;
}

function resultFrom(checkpoint: SessionParseCheckpoint): SessionCheckpointResult {
  return {
    result: {
      session: checkpoint.session.updatedAt ? checkpoint.session : null,
      diagnostics: checkpoint.diagnostics
    },
    checkpoint
  };
}

async function consume(filePath: string, source: SessionParseCheckpoint): Promise<SessionCheckpointResult> {
  const checkpoint = cloneCheckpoint(source);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let lineChunks: Buffer<ArrayBufferLike>[] = checkpoint.pendingBytes.length === 0
    ? []
    : [Buffer.from(checkpoint.pendingBytes)];
  const stream = fs.createReadStream(filePath, { start: checkpoint.bytesRead });

  const reduceCompleteLine = (suffix: Buffer<ArrayBufferLike>): void => {
    if (suffix.length > 0) lineChunks.push(suffix);
    const line = lineChunks.length === 0
      ? Buffer.alloc(0)
      : lineChunks.length === 1
        ? lineChunks[0]
        : Buffer.concat(lineChunks);
    const lineEnd = line.length > 0 && line[line.length - 1] === 0x0d ? line.length - 1 : line.length;
    reduceSessionLine(checkpoint, decoder.decode(line.subarray(0, lineEnd)));
    lineChunks = [];
  };

  for await (const value of stream) {
    const chunk = value as Buffer;
    checkpoint.bytesRead += chunk.length;
    checkpoint.trailingGuard = updateTrailingGuard(checkpoint.trailingGuard, chunk);
    let lineStart = 0;
    for (let index = 0; index < chunk.length; index += 1) {
      if (chunk[index] !== 0x0a) continue;
      reduceCompleteLine(chunk.subarray(lineStart, index));
      lineStart = index + 1;
    }
    if (lineStart < chunk.length) lineChunks.push(chunk.subarray(lineStart));
  }

  const pending = lineChunks.length === 0
    ? Buffer.alloc(0)
    : lineChunks.length === 1
      ? lineChunks[0]
      : Buffer.concat(lineChunks);
  checkpoint.pendingBytes = Uint8Array.from(pending);
  if (checkpoint.pendingBytes.length > 0) {
    const line = decoder.decode(checkpoint.pendingBytes);
    try {
      JSON.parse(line);
      reduceSessionLine(checkpoint, line);
      checkpoint.pendingBytes = new Uint8Array();
    } catch {
      // A fragment without a newline may be completed by a later append.
    }
  }
  return resultFrom(checkpoint);
}

async function consumeFull(filePath: string): Promise<SessionCheckpointResult> {
  const checkpoint = createCheckpoint(filePath);
  const stream = fs.createReadStream(filePath);
  let tailChunks: Buffer<ArrayBufferLike>[] = [];
  stream.on('data', (value: Buffer) => {
    checkpoint.bytesRead += value.length;
    checkpoint.trailingGuard = updateTrailingGuard(checkpoint.trailingGuard, value);
    const lastNewline = value.lastIndexOf(0x0a);
    if (lastNewline === -1) {
      tailChunks.push(value);
    } else {
      const tail = value.subarray(lastNewline + 1);
      tailChunks = tail.length === 0 ? [] : [tail];
    }
  });
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let previousLine: string | undefined;

  for await (const line of reader) {
    if (previousLine !== undefined) {
      reduceSessionLine(checkpoint, previousLine);
    }
    previousLine = line;
  }

  const tail = tailChunks.length === 0
    ? Buffer.alloc(0)
    : tailChunks.length === 1
      ? tailChunks[0]
      : Buffer.concat(tailChunks);
  if (previousLine !== undefined) {
    if (tail.length === 0) {
      reduceSessionLine(checkpoint, previousLine);
    } else {
      try {
        JSON.parse(previousLine);
        reduceSessionLine(checkpoint, previousLine);
      } catch {
        checkpoint.pendingBytes = Uint8Array.from(tail);
      }
    }
  }
  return resultFrom(checkpoint);
}

export async function parseSessionToCheckpoint(filePath: string): Promise<SessionCheckpointResult> {
  return consumeFull(filePath);
}

export async function checkpointPrefixMatches(
  filePath: string,
  checkpoint: SessionParseCheckpoint
): Promise<boolean> {
  const guard = checkpoint.trailingGuard;
  if (guard.length === 0) return checkpoint.bytesRead === 0;
  if (checkpoint.bytesRead < guard.length) return false;
  let handle: FileHandle | undefined;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const actual = Buffer.alloc(guard.length);
    const { bytesRead } = await handle.read(
      actual,
      0,
      actual.length,
      checkpoint.bytesRead - guard.length
    );
    return bytesRead === guard.length && actual.equals(Buffer.from(guard));
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

export async function appendSessionToCheckpoint(
  filePath: string,
  checkpoint: SessionParseCheckpoint
): Promise<SessionCheckpointResult> {
  if (checkpoint.filePath !== filePath) {
    throw new Error(`Checkpoint path ${checkpoint.filePath} does not match ${filePath}`);
  }
  return consume(filePath, checkpoint);
}
