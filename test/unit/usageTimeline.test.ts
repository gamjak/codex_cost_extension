import { describe, expect, it } from 'vitest';

import { buildSessionUsageDeltas } from '../../src/domain/usageTimeline';
import type { ParsedSession } from '../../src/domain/types';

describe('buildSessionUsageDeltas', () => {
  it('treats a cumulative counter reset as a new baseline', () => {
    const session: ParsedSession = {
      sessionId: 'reset-session',
      filePath: 'reset.jsonl',
      updatedAt: '2026-07-10T10:01:00.000Z',
      usageHistory: [
        {
          timestamp: '2026-07-10T10:00:00.000Z',
          tokens: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 30, totalTokens: 130 }
        },
        {
          timestamp: '2026-07-10T10:01:00.000Z',
          tokens: { inputTokens: 10, cachedInputTokens: 2, outputTokens: 4, totalTokens: 14 }
        }
      ]
    };

    expect(buildSessionUsageDeltas(session)[1]?.tokens).toEqual({
      inputTokens: 10,
      cachedInputTokens: 2,
      outputTokens: 4,
      totalTokens: 14
    });
  });
});
