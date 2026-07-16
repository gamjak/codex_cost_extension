process.env.TZ = 'Europe/Berlin';

import { expect, it } from 'vitest';

import { buildCostCenterReport } from '../../src/domain/costCenterAnalytics';
import type { BuildCostCenterReportInput } from '../../src/domain/costCenterTypes';

it('maps daily comparison buckets by local calendar day across DST', () => {
  const sessions = Array.from({ length: 8 }, (_, index) => {
    const day = index < 4 ? 23 + index : 27 + index - 4;
    const timestamp = `2026-03-${String(day).padStart(2, '0')}T12:00:00.000Z`;
    return { sessionId: `s-${day}`, filePath: `s-${day}.jsonl`, updatedAt: timestamp, cwd: 'C:\\repo\\one', usageHistory: [{ timestamp, cwd: 'C:\\repo\\one', model: 'gpt-5.4', tokens: { inputTokens: 1_000, cachedInputTokens: 0, outputTokens: 0, totalTokens: 1_000 } }] };
  });
  const input: BuildCostCenterReportInput = {
    sessions, filesCount: sessions.length, repositoryWarnings: [], workspaceRoots: ['C:\\repo\\one'],
    pricingByModel: { 'gpt-5.4': { inputPer1M: 1, cachedInputPer1M: 0, outputPer1M: 0 } }, customPricingModels: new Set(),
    filters: { scope: 'all', range: { kind: 'custom', startDate: '27.03.2026', endDate: '30.03.2026', compare: true }, section: 'overview' },
    budgetSettings: { dayAmount: 0, weekAmount: 0, monthAmount: 0, warningPercent: 80 }, pinnedProjects: new Set(), excludedProjects: new Set(), now: new Date('2026-03-30T12:00:00.000Z')
  };
  expect(buildCostCenterReport(input).chart.map((point) => point.comparisonCost)).toEqual([0.001, 0.001, 0.001, 0.001]);
});
