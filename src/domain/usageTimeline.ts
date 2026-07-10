import type { ParsedSession, SessionUsageSnapshot, TokenUsageSnapshot } from './types';

export interface SessionUsageDelta {
  sessionId: string;
  timestamp: string;
  cwd?: string;
  model?: string;
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

  return {
    inputTokens: Math.max(current.inputTokens - previous.inputTokens, 0),
    cachedInputTokens: Math.max(current.cachedInputTokens - previous.cachedInputTokens, 0),
    outputTokens: Math.max(current.outputTokens - previous.outputTokens, 0),
    totalTokens: Math.max(current.totalTokens - previous.totalTokens, 0)
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
      sessionId: session.sessionId,
      timestamp: entry.timestamp,
      cwd: entry.cwd ?? session.cwd,
      model: entry.model ?? session.model,
      tokens
    });
  }

  return deltas;
}
