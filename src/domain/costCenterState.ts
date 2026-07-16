import type {
  CostCenterFilters,
  CostCenterRangeSelection,
  CostCenterSection
} from './costCenterTypes';
import type { ViewScope } from './types';

export interface CostCenterPreferences {
  scope: ViewScope;
  range: CostCenterRangeSelection;
  section: CostCenterSection;
}

export interface CostCenterUiState {
  filters: CostCenterFilters;
  search: string;
  sort: {
    sessions: { column: 'estimatedCost' | 'updatedAt' | 'durationMs'; direction: SortDirection };
    projects: { column: 'estimatedCost' | 'sessionCount' | 'activeDays'; direction: SortDirection };
    models: { column: 'estimatedCost' | 'sessionCount' | 'totalTokens'; direction: SortDirection };
  };
  expandedSessionKey?: string;
}

type SortDirection = 'asc' | 'desc';
type SortTable = keyof CostCenterUiState['sort'];

export type CostCenterStateAction =
  | { type: 'setScope'; scope: ViewScope }
  | { type: 'setRange'; range: CostCenterRangeSelection }
  | { type: 'setSection'; section: CostCenterSection }
  | { type: 'setSearch'; value: string }
  | { type: 'setSort'; table: 'sessions'; column: 'estimatedCost' | 'updatedAt' | 'durationMs'; direction: SortDirection }
  | { type: 'setSort'; table: 'projects'; column: 'estimatedCost' | 'sessionCount' | 'activeDays'; direction: SortDirection }
  | { type: 'setSort'; table: 'models'; column: 'estimatedCost' | 'sessionCount' | 'totalTokens'; direction: SortDirection }
  | { type: 'toggleSession'; sessionKey: string }
  | { type: 'drillToSessions'; projectKey?: string; model?: string }
  | { type: 'filterChartPoint'; pointStart: string; pointEndExclusive: string }
  | { type: 'clearFilter'; filter: 'project' | 'model' | 'point' };

export function defaultCostCenterPreferences(): CostCenterPreferences {
  return {
    scope: 'workspace',
    range: { kind: '7d', compare: false },
    section: 'overview'
  };
}

export function readCostCenterPreferences(value: unknown): CostCenterPreferences {
  if (!isRecord(value) || !isScope(value.scope) || !isRange(value.range) || !isSection(value.section)) {
    return defaultCostCenterPreferences();
  }

  return { scope: value.scope, range: value.range, section: value.section };
}

export function preferencesFromState(state: CostCenterUiState): CostCenterPreferences {
  const { scope, range, section } = state.filters;
  return { scope, range, section };
}

export function reduceCostCenterState(
  state: CostCenterUiState,
  action: CostCenterStateAction
): CostCenterUiState {
  switch (action.type) {
    case 'setScope':
      return withFilters(state, { scope: action.scope });
    case 'setRange':
      return withFilters(state, { range: action.range });
    case 'setSection':
      return withFilters(state, { section: action.section });
    case 'setSearch':
      return { ...state, search: action.value };
    case 'setSort':
      return setSort(state, action);
    case 'toggleSession':
      return {
        ...state,
        expandedSessionKey: state.expandedSessionKey === action.sessionKey ? undefined : action.sessionKey
      };
    case 'drillToSessions':
      return withFilters(state, {
        section: 'sessions',
        projectKey: action.projectKey,
        model: action.model
      });
    case 'filterChartPoint':
      return withFilters(state, {
        pointStart: action.pointStart,
        pointEndExclusive: action.pointEndExclusive
      });
    case 'clearFilter':
      return clearFilter(state, action.filter);
  }
}

function withFilters(state: CostCenterUiState, changes: Partial<CostCenterFilters>): CostCenterUiState {
  return { ...state, filters: { ...state.filters, ...changes } };
}

function setSort(
  state: CostCenterUiState,
  action: Extract<CostCenterStateAction, { type: 'setSort' }>
): CostCenterUiState {
  const table: SortTable = action.table;
  return {
    ...state,
    sort: {
      ...state.sort,
      [table]: { column: action.column, direction: action.direction }
    }
  };
}

function clearFilter(state: CostCenterUiState, filter: 'project' | 'model' | 'point'): CostCenterUiState {
  if (filter === 'project') return withoutFilters(state, ['projectKey']);
  if (filter === 'model') return withoutFilters(state, ['model']);
  return withoutFilters(state, ['pointStart', 'pointEndExclusive']);
}

function withoutFilters(
  state: CostCenterUiState,
  keys: readonly ('projectKey' | 'model' | 'pointStart' | 'pointEndExclusive')[]
): CostCenterUiState {
  const filters = { ...state.filters };
  for (const key of keys) delete filters[key];
  return { ...state, filters };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isScope(value: unknown): value is ViewScope {
  return value === 'workspace' || value === 'all';
}

function isSection(value: unknown): value is CostCenterSection {
  return value === 'overview' || value === 'sessions' || value === 'projects' || value === 'models';
}

function isRange(value: unknown): value is CostCenterRangeSelection {
  if (!isRecord(value) || typeof value.compare !== 'boolean') return false;
  if (value.kind === 'today' || value.kind === '7d' || value.kind === '30d') return true;
  return value.kind === 'custom' && typeof value.startDate === 'string' && typeof value.endDate === 'string';
}
