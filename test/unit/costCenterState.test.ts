import { describe, expect, it } from 'vitest';
import {
  defaultCostCenterPreferences,
  preferencesFromState,
  readCostCenterPreferences,
  reduceCostCenterState,
  type CostCenterUiState
} from '../../src/domain/costCenterState';

function initialState(): CostCenterUiState {
  const preferences = defaultCostCenterPreferences();
  return {
    filters: { ...preferences },
    search: '',
    sort: {
      sessions: { column: 'estimatedCost', direction: 'desc' },
      projects: { column: 'estimatedCost', direction: 'desc' },
      models: { column: 'estimatedCost', direction: 'desc' }
    }
  };
}

describe('Cost Center analysis state', () => {
  it('reads a valid persisted preference set', () => {
    expect(readCostCenterPreferences({
      scope: 'all',
      range: { kind: '30d', compare: true },
      section: 'models'
    })).toEqual({
      scope: 'all',
      range: { kind: '30d', compare: true },
      section: 'models'
    });
  });

  it('falls back to default preferences when persisted values are invalid', () => {
    expect(readCostCenterPreferences({
      scope: 'other',
      range: { kind: 'forever', compare: 'yes' },
      section: 'billing'
    })).toEqual({
      scope: 'workspace',
      range: { kind: '7d', compare: false },
      section: 'overview'
    });
  });

  it('drills into a project without changing persisted range preferences', () => {
    const initial = initialState();
    const drilled = reduceCostCenterState(initial, {
      type: 'drillToSessions',
      projectKey: 'c:\\repo\\one'
    });

    expect(drilled.filters).toMatchObject({
      section: 'sessions',
      projectKey: 'c:\\repo\\one'
    });
    expect(preferencesFromState(drilled)).toEqual({
      ...defaultCostCenterPreferences(),
      section: 'sessions'
    });
  });

  it('clears a project filter while preserving the selected range', () => {
    const initial = initialState();
    const drilled = reduceCostCenterState(initial, {
      type: 'drillToSessions',
      projectKey: 'c:\\repo\\one'
    });
    const cleared = reduceCostCenterState(drilled, { type: 'clearFilter', filter: 'project' });

    expect(cleared.filters.projectKey).toBeUndefined();
    expect(cleared.filters.range).toEqual(initial.filters.range);
  });

  it('keeps search, sort, chart filters, and expansion transient', () => {
    const initial = initialState();
    const state = reduceCostCenterState(
      reduceCostCenterState(
        reduceCostCenterState(
          reduceCostCenterState(initial, { type: 'setSearch', value: 'model' }),
          { type: 'setSort', table: 'models', column: 'totalTokens', direction: 'asc' }
        ),
        { type: 'filterChartPoint', pointStart: '2026-07-16T00:00:00.000Z', pointEndExclusive: '2026-07-17T00:00:00.000Z' }
      ),
      { type: 'toggleSession', sessionKey: 'session-a' }
    );

    expect(state).toMatchObject({
      search: 'model',
      sort: { models: { column: 'totalTokens', direction: 'asc' } },
      expandedSessionKey: 'session-a',
      filters: {
        pointStart: '2026-07-16T00:00:00.000Z',
        pointEndExclusive: '2026-07-17T00:00:00.000Z'
      }
    });
    expect(preferencesFromState(state)).toEqual(defaultCostCenterPreferences());
  });
});
