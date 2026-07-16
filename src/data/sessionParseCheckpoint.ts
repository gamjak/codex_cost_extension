import * as fs from 'node:fs';
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
    session: { sessionId: fallbackSessionId(filePath), filePath, updatedAt: '', usageHistory: [] },
    diagnostics: { malformedLines: 0, invalidTimestamps: 0, invalidTokenUsageRecords: 0 }
  };
}

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

function concatenate(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left);
  combined.set(right, left.length);
  return combined;
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
  let pending = checkpoint.pendingBytes;
  const stream = fs.createReadStream(filePath, { start: checkpoint.bytesRead });

  for await (const value of stream) {
    const chunk = value as Buffer;
    checkpoint.bytesRead += chunk.length;
    const bytes = concatenate(pending, chunk);
    let lineStart = 0;
    for (let index = 0; index < bytes.length; index += 1) {
      if (bytes[index] !== 0x0a) continue;
      let lineEnd = index;
      if (lineEnd > lineStart && bytes[lineEnd - 1] === 0x0d) lineEnd -= 1;
      reduceSessionLine(checkpoint, decoder.decode(bytes.subarray(lineStart, lineEnd)));
      lineStart = index + 1;
    }
    pending = bytes.slice(lineStart);
  }

  checkpoint.pendingBytes = pending;
  if (pending.length > 0) {
    const line = decoder.decode(pending);
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

export async function appendSessionToCheckpoint(
  filePath: string,
  checkpoint: SessionParseCheckpoint
): Promise<SessionCheckpointResult> {
  if (checkpoint.filePath !== filePath) {
    throw new Error(`Checkpoint path ${checkpoint.filePath} does not match ${filePath}`);
  }
  return consume(filePath, checkpoint);
}
