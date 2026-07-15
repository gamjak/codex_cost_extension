import { describe, expect, it } from 'vitest';

import { buildCostControlReport } from '../../src/domain/costControl';
import type { ParsedSession, PricingByModel, SessionUsageSnapshot } from '../../src/domain/types';

process.env.TZ = 'UTC';

const workspaceRoot = 'C:\\Users\\gambjako\\Repositories\\codex_cost_extension';

const pricing: PricingByModel = {
  'gpt-5.4': {
    inputPer1M: 1,
    cachedInputPer1M: 0,
    outputPer1M: 0
  }
};

function snapshot(timestamp: string, inputTokens: number): SessionUsageSnapshot {
  return {
    timestamp,
    cwd: workspaceRoot,
    model: 'gpt-5.4',
    tokens: {
      inputTokens,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: inputTokens
    }
  };
}

const sessions: ParsedSession[] = [{
  sessionId: 'today',
  filePath: 'today.jsonl',
  updatedAt: '2026-06-05T09:00:00.000Z',
  cwd: workspaceRoot,
  model: 'gpt-5.4',
  usage: snapshot('2026-06-05T09:00:00.000Z', 500_000).tokens,
  usageHistory: [snapshot('2026-06-05T09:00:00.000Z', 500_000)]
}];

const options = {
  scope: 'workspace' as const,
  workspaceRoots: [workspaceRoot],
  budgetSettings: {
    dayAmount: 1,
    weekAmount: 3,
    monthAmount: 10,
    warningPercent: 80
  },
  budgetPeriod: 'day' as const
};

describe('buildCostControlReport', () => {
  it('projects today from elapsed local time and builds seven daily points', () => {
    const control = buildCostControlReport(sessions, pricing, {
      ...options,
      now: new Date('2026-06-05T12:00:00.000Z')
    });

    expect(control.remainingCost).toBeCloseTo(0.5);
    expect(control.projectedCost).toBeCloseTo(1);
    expect(control.daily).toHaveLength(7);
    expect(control.daily.at(-1)).toMatchObject({ date: '05.06.2026', estimatedCost: 0.5 });
  });
});
