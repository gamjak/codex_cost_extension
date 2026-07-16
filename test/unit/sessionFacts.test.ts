import { describe, expect, it } from 'vitest';

import { buildSessionFacts } from '../../src/domain/sessionFacts';

describe('buildSessionFacts', () => {
  it('builds a stable project and records all models used by a session', () => {
    const facts = buildSessionFacts([{
      sessionId: 's1',
      filePath: 's1.jsonl',
      startedAt: '2026-07-16T08:00:00.000Z',
      updatedAt: '2026-07-16T08:10:00.000Z',
      cwd: 'C:\\repo\\app\\src',
      source: 'vscode',
      usageHistory: [
        {
          timestamp: '2026-07-16T08:01:00.000Z',
          cwd: 'C:\\repo\\app',
          model: 'gpt-5.4',
          tokens: { inputTokens: 100, cachedInputTokens: 10, outputTokens: 20, totalTokens: 120 }
        },
        {
          timestamp: '2026-07-16T08:05:00.000Z',
          cwd: 'C:\\repo\\app\\src',
          model: 'gpt-5.4-mini',
          tokens: { inputTokens: 150, cachedInputTokens: 20, outputTokens: 30, totalTokens: 180 }
        }
      ]
    }], ['C:\\repo\\app']);

    expect(facts[0]?.key).toContain('s1');
    expect(facts[0]).toMatchObject({
      projectKey: 'c:\\repo\\app',
      projectLabel: 'app',
      source: 'vscode',
      startedAt: '2026-07-16T08:00:00.000Z',
      updatedAt: '2026-07-16T08:10:00.000Z',
      models: ['gpt-5.4', 'gpt-5.4-mini']
    });
  });
});
