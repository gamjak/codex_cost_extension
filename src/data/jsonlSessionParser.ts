import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

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
    updatedAt: '',
    usageHistory: []
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

        if (timestamp) {
          session.usageHistory.push({
            timestamp,
            cwd: session.cwd,
            model: session.model,
            tokens: usage
          });
        }
      }
    }
  }

  stream.close();

  if (!session.updatedAt) {
    return null;
  }

  return session;
}
