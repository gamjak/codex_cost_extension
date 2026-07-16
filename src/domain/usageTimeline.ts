import type { ParsedSession, SessionUsageSnapshot, TokenUsageSnapshot } from './types';
import { normalizeSessionSource, sessionKey } from './sessionFacts';

export interface SessionUsageDelta {
  sessionKey: string;
  sessionId: string;
  timestamp: string;
  cwd?: string;
  model?: string;
  source: string;
  tokens: TokenUsageSnapshot;
}

export function emptyTokenUsage(): TokenUsageSnapshot {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0
  };
}

export function hasUsage(snapshot: TokenUsageSnapshot): boolean {
  return snapshot.totalTokens > 0 || snapshot.inputTokens > 0 || snapshot.outputTokens > 0;
}

export function addTokenUsage(target: TokenUsageSnapshot, value: TokenUsageSnapshot): TokenUsageSnapshot {
  return {
    inputTokens: target.inputTokens + value.inputTokens,
    cachedInputTokens: target.cachedInputTokens + value.cachedInputTokens,
    outputTokens: target.outputTokens + value.outputTokens,
    totalTokens: target.totalTokens + value.totalTokens
  };
}

function normalizeHistory(history: readonly SessionUsageSnapshot[]): SessionUsageSnapshot[] {
  return [...history].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function diffTokenUsage(current: TokenUsageSnapshot, previous: TokenUsageSnapshot | undefined): TokenUsageSnapshot {
  if (!previous) {
    return {
      inputTokens: Math.max(current.inputTokens, 0),
      cachedInputTokens: Math.max(current.cachedInputTokens, 0),
      outputTokens: Math.max(current.outputTokens, 0),
      totalTokens: Math.max(current.totalTokens, 0)
    };
  }

  const delta = (currentValue: number, previousValue: number): number =>
    Math.max(currentValue >= previousValue ? currentValue - previousValue : currentValue, 0);

  return {
    inputTokens: delta(current.inputTokens, previous.inputTokens),
    cachedInputTokens: delta(current.cachedInputTokens, previous.cachedInputTokens),
    outputTokens: delta(current.outputTokens, previous.outputTokens),
    totalTokens: delta(current.totalTokens, previous.totalTokens)
  };
}

export function buildSessionUsageDeltas(session: ParsedSession): SessionUsageDelta[] {
  const history = session.usageHistory.length > 0
    ? normalizeHistory(session.usageHistory)
    : session.usage && session.updatedAt
      ? [
          {
            timestamp: session.updatedAt,
            cwd: session.cwd,
            model: session.model,
            tokens: session.usage
          }
        ]
      : [];
  const deltas: SessionUsageDelta[] = [];
  let previousTokens: TokenUsageSnapshot | undefined;

  for (const entry of history) {
    const tokens = diffTokenUsage(entry.tokens, previousTokens);
    previousTokens = entry.tokens;

    if (!hasUsage(tokens)) {
      continue;
    }

    deltas.push({
      sessionKey: sessionKey(session),
      sessionId: session.sessionId,
      timestamp: entry.timestamp,
      cwd: entry.cwd ?? session.cwd,
      model: entry.model ?? session.model,
      source: normalizeSessionSource(session),
      tokens
    });
  }

  return deltas;
}
