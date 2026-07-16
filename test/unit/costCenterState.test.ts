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

  it('updates scope, range, and section through their direct reducer transitions', () => {
    const scoped = reduceCostCenterState(initialState(), { type: 'setScope', scope: 'all' });
    const ranged = reduceCostCenterState(scoped, {
      type: 'setRange',
      range: { kind: 'custom', startDate: '01.07.2026', endDate: '03.07.2026', compare: true }
    });
    const sectioned = reduceCostCenterState(ranged, { type: 'setSection', section: 'projects' });

    expect(sectioned.filters).toMatchObject({
      scope: 'all',
      range: { kind: 'custom', startDate: '01.07.2026', endDate: '03.07.2026', compare: true },
      section: 'projects'
    });
  });

  it('collapses an expanded session when its toggle action is repeated', () => {
    const expanded = reduceCostCenterState(initialState(), { type: 'toggleSession', sessionKey: 'session-a' });
    const collapsed = reduceCostCenterState(expanded, { type: 'toggleSession', sessionKey: 'session-a' });

    expect(expanded.expandedSessionKey).toBe('session-a');
    expect(collapsed.expandedSessionKey).toBeUndefined();
  });

  it('drills to a model and clears only the model filter', () => {
    const drilled = reduceCostCenterState(initialState(), {
      type: 'drillToSessions',
      model: 'gpt-5.4'
    });
    const cleared = reduceCostCenterState(drilled, { type: 'clearFilter', filter: 'model' });

    expect(drilled.filters).toMatchObject({ section: 'sessions', model: 'gpt-5.4' });
    expect(cleared.filters).toMatchObject({ section: 'sessions' });
    expect(cleared.filters.model).toBeUndefined();
  });

  it('clears both point bounds without affecting the selected range', () => {
    const initial = initialState();
    const filtered = reduceCostCenterState(initial, {
      type: 'filterChartPoint',
      pointStart: '2026-07-16T00:00:00.000Z',
      pointEndExclusive: '2026-07-17T00:00:00.000Z'
    });
    const cleared = reduceCostCenterState(filtered, { type: 'clearFilter', filter: 'point' });

    expect(cleared.filters.pointStart).toBeUndefined();
    expect(cleared.filters.pointEndExclusive).toBeUndefined();
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
