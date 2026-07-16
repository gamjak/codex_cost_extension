import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { buildCostCenterHtml, type CostCenterViewModel } from '../../src/view/costCenterPresentation';
import { buildCostCenterClientScript } from '../../src/view/costCenterClient';

describe('buildCostCenterHtml', () => {
  it('renders the accessible overview shell while escaping unsafe labels and paths', () => {
    const projectPath = 'C:\\unsafe\\<script>alert(1)</script>';
    const html = buildCostCenterHtml({
      report: {
        filters: { scope: 'workspace', range: { kind: '7d', compare: true }, section: 'overview' },
        rangeLabel: 'Last 7 days',
        summary: {
          cost: { value: 12.5, partial: false, comparisonPercent: 10 },
          totalTokens: 1234,
          activeDays: 2,
          averageCostPerActiveDay: 6.25,
          sessionCount: 1
        },
        budget: { period: 'week', amount: 50, spent: 12.5, remaining: 37.5, projected: undefined, state: 'neutral', explanation: 'Budget based on selected range.', partial: false },
        chart: [{ key: '2026-07-16', label: '<script>alert(1)</script>', start: '2026-07-16T00:00:00.000Z', endExclusive: '2026-07-17T00:00:00.000Z', cost: 12.5, comparisonCost: 10, tokens: 1234, sessions: 1, partial: false }],
        drivers: { session: { key: 'one', label: '<script>alert(1)</script>', cost: 12.5 }, project: { key: 'project', label: '<script>alert(1)</script>', cost: 12.5 }, model: { key: 'gpt-test', label: '<script>alert(1)</script>', cost: 12.5 } },
        sessions: [{ key: 'one', sessionId: 'one', label: 'Unsafe session', projectKey: 'project', projectLabel: 'Unsafe project', projectPath, source: 'cli', startedAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T01:00:00.000Z', durationMs: 3600000, models: ['gpt-test'], tokens: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, totalTokens: 2 }, estimatedCost: 12.5, partial: false, timeline: [] }],
        projects: [],
        models: [],
        warnings: []
      },
      uiState: {
        filters: { scope: 'workspace', range: { kind: '7d', compare: true }, section: 'overview' },
        search: '',
        sort: {
          sessions: { column: 'estimatedCost', direction: 'desc' },
          projects: { column: 'estimatedCost', direction: 'desc' },
          models: { column: 'estimatedCost', direction: 'desc' }
        }
      }
    }, 'safe-nonce');

    expect(html).toContain('<h1>Codex Cost Center</h1>');
    expect(html).toContain('aria-label="Cost Center controls"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-testid="cost-trend-chart"');
    expect(html).toContain('<desc>');
    expect(html).toContain('nonce="safe-nonce"');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain(projectPath);
  });

  it('renders complete overview metrics, comparison series, drilldowns, and valid tab panels', () => {
    const html = buildCostCenterHtml(viewModel(), 'safe-nonce');

    expect(html).toContain('Budget used');
    expect(html).toContain('Budget remaining');
    expect(html).toContain('Average per active day');
    expect(html).toContain('Compared with previous period');
    expect(html).toContain('Budget reference: week');
    expect(html).toContain('class="chart-current"');
    expect(html).toContain('class="chart-comparison"');
    expect(html).toContain('data-action="drillProject"');
    expect(html).toContain('data-action="drillModel"');
    expect(html).toContain('data-action="toggleSession"');
    expect(html).toContain('data-action="copySummary"');
    expect(html).toContain('12.5% of estimated cost');
    for (const section of ['overview', 'sessions', 'projects', 'models']) {
      expect(html).toContain(`aria-controls="panel-${section}"`);
      expect(html).toContain(`id="panel-${section}"`);
    }
  });

  it('posts host-compatible discriminated messages and supports arrow-key tabs', () => {
    const script = buildCostCenterClientScript();

    expect(script).toContain("post({ type: 'setScope', value: target.value })");
    expect(script).toContain("post({ type: 'setSection', value: target.dataset.value })");
    expect(script).toContain("post({ type: 'clearFilter', value: target.dataset.value })");
    expect(script).toContain("post({ type: 'filterChartPoint', pointStart: target.dataset.start, pointEndExclusive: target.dataset.endExclusive })");
    expect(script).toContain("post({ type: 'setSort', key: target.dataset.key, value: target.dataset.value })");
    expect(script).toContain("post({ type: 'setSearch', value: target.value })");
    expect(script).toContain("event.key !== 'ArrowRight' && event.key !== 'ArrowLeft'");
  });

  it('keeps empty and partial-cost states textual and exposes chart details to assistive technology', () => {
    const model = viewModel();
    model.report.summary.cost.partial = true;
    model.report.budget.partial = true;
    model.report.emptyState = { kind: 'no-period-data', message: 'No usage in this period.', action: 'clear-filters' };
    const html = buildCostCenterHtml(model, 'safe-nonce');

    expect(html).toContain('No usage in this period.');
    expect(html).toContain('Cost estimate is partial because some usage has no price.');
    expect(html).toContain('aria-describedby="chart-detail-2026-07-16"');
    expect(html).toContain('Current period');
    expect(html).toContain('Previous period');
  });

  it('omits the comparison series and legend when comparison is disabled', () => {
    const model = viewModel();
    model.report.filters.range.compare = false;
    model.report.chart[0].comparisonCost = undefined;
    const html = buildCostCenterHtml(model, 'safe-nonce');
    expect(html).not.toContain('class="chart-comparison"');
    expect(html).not.toContain('<span class="legend-comparison">');
  });

  it('describes the comparison bar with comparison tokens and sessions', () => {
    const model = viewModel();
    model.report.chart[0].comparisonTokens = 77;
    model.report.chart[0].comparisonSessions = 3;
    const html = buildCostCenterHtml(model, 'safe-nonce');
    expect(html).toContain('previous:');
    expect(html).toContain('77 tokens; 3 sessions');
  });

  it('renders an inline custom range error', () => {
    const model = viewModel();
    model.rangeError = 'Enter valid dates.';
    const html = buildCostCenterHtml(model, 'safe-nonce');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Enter valid dates.');
  });

  it('derives a budget reference line and complete point details from report values', () => {
    const html = buildCostCenterHtml(viewModel(), 'safe-nonce');

    expect(html).toContain('class="chart-budget-reference"');
    expect(html).toContain('data-budget-amount="50"');
    expect(html).toContain('y1="12"');
    expect(html).toContain('y2="12"');
    expect(html).toContain('Jul 16: current');
    expect(html).toContain('1.234 tokens');
    expect(html).toContain('1 session');
    expect(html).toContain('data-tokens="1234"');
    expect(html).toContain('data-sessions="1"');
  });

  it('uses theme-token styling to distinguish chart series and hides screen-reader details visually', () => {
    const html = buildCostCenterHtml(viewModel(), 'safe-nonce');

    expect(html).toContain('.chart-current { fill: var(--vscode-charts-blue); }');
    expect(html).toContain('.chart-comparison { fill: var(--vscode-charts-orange); }');
    expect(html).toContain('.legend-current::before');
    expect(html).toContain('.legend-comparison::before');
    expect(html).toContain('.sr-only { position: absolute; width: 1px; height: 1px;');
  });

  it('renders accessible analysis tables and host action metadata', () => {
    const model = analysisViewModel();

    model.report.filters.section = 'sessions';
    const sessionHtml = buildCostCenterHtml(model, 'safe-nonce');
    model.report.filters.section = 'projects';
    const projectHtml = buildCostCenterHtml(model, 'safe-nonce');
    model.report.filters.section = 'models';
    const modelHtml = buildCostCenterHtml(model, 'safe-nonce');

    expect(sessionHtml).toContain('<th scope="col"');
    expect(sessionHtml).toContain('data-action="toggleSession"');
    expect(projectHtml).toContain('data-action="drillProject"');
    expect(projectHtml).toContain('data-action="toggleProjectPin"');
    expect(projectHtml).toContain('data-action="excludeProject"');
    expect(modelHtml).toContain('data-action="drillModel"');
    expect(modelHtml).toContain('data-action="openAdvancedPricing"');
    expect(modelHtml).toContain('Bundled price');
  });

  it('escapes table labels and paths and keeps expanded details private and textual', () => {
    const model = analysisViewModel();
    model.uiState.expandedSessionKey = 'session-1';
    const html = buildCostCenterHtml(model, 'safe-nonce');

    expect(html).toContain('C:\\work\\&lt;private&gt;');
    expect(html).not.toContain('C:\\work\\<private>');
    expect(html).toContain('Partial estimate: some usage has no price.');
    expect(html).toContain('Token composition');
    expect(html).not.toContain('prompt');
    expect(html).not.toContain('response');
  });

  it('renders the sessions empty state when search excludes every row', () => {
    const model = analysisViewModel();
    model.uiState.search = 'not-present';

    const emptyHtml = buildCostCenterHtml(model, 'safe-nonce');

    expect(emptyHtml).toContain('No sessions match the active filters.');
  });

  it('renders guided budget settings with accessible validation and actions', () => {
    const model = viewModel();
    model.settings = settingsView();
    const html = buildCostCenterHtml(model, 'safe-nonce');

    expect(html).toContain('<form');
    expect(html).toContain('data-settings-group="budget"');
    expect(html).toContain('data-action="saveSettings"');
    expect(html).toContain('data-action="discardSettings"');
    expect(html).toContain('data-action="resetSettingsGroup"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="settings-budget-dayAmount-error"');
    expect(html).toContain('Enter zero or a positive USD amount.');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Daily budget preview: $-1.00');
  });

  it('renders all guided groups and source diagnostics without arbitrary config or pricing fields', () => {
    const model = viewModel();
    model.settings = { ...settingsView(), group: 'dataSources' };
    const html = buildCostCenterHtml(model, 'safe-nonce');

    for (const group of ['budget', 'display', 'dataSources', 'notifications']) {
      expect(html).toContain(`data-settings-group="${group}"`);
    }
    expect(html).toContain('data-action="checkData"');
    expect(html).toContain('data-action="testNotification"');
    expect(html).toContain('data-action="openAdvancedSettings"');
    expect(html).toContain('Missing');
    expect(html).toContain('No JSONL files found.');
    expect(html).not.toContain('pricing.models');
    expect(html).not.toContain('data-action="updateConfig"');
  });

  it('serializes only allowlisted setting field actions from controls', () => {
    const script = buildCostCenterClientScript();

    expect(script).toContain("const settingFieldKeys = new Set(");
    expect(script).toContain("post({ type: 'updateSettingField', key, value })");
    expect(script).not.toContain("post({ type: 'updateSettingField', key: target.dataset.key, value })");
  });

  it('posts the selected group when resetting guided settings', () => {
    const client = runClient();
    client.click(new client.Element({ action: 'resetSettingsGroup', value: 'notifications' }));

    expect(client.posts).toEqual([{ type: 'resetSettingsGroup', value: 'notifications' }]);
  });

  it('keeps partial custom date edits local and posts only a complete valid range', () => {
    const client = runClient();
    const range = new client.Select({ control: 'range', action: 'setRange' }); range.value = 'custom';
    const compare = new client.Input({ control: 'compare', action: 'setRange' }, 'checkbox'); compare.checked = true;
    const start = new client.Input({ control: 'start-date', action: 'setRange' }, 'text', '31.02.2026');
    const end = new client.Input({ control: 'end-date', action: 'setRange' }, 'text', '');
    client.elements['[data-control="range"]'] = range;
    client.elements['[data-control="compare"]'] = compare;
    client.elements['[data-control="start-date"]'] = start;
    client.elements['[data-control="end-date"]'] = end;
    client.change(start);
    expect(client.posts).toEqual([]);
    start.value = '28.02.2026'; end.value = '01.03.2026';
    client.change(end);
    expect(client.posts).toEqual([{ type: 'setRange', value: { kind: 'custom', startDate: '28.02.2026', endDate: '01.03.2026', compare: true } }]);
  });

  it('rejects unknown fields and serializes allowlisted field values by type', () => {
    const client = runClient();
    client.change(new client.Input({ action: 'updateSettingField', key: 'pricing.models' }, 'text', 'secret'));
    client.change(new client.Input({ action: 'updateSettingField', key: 'budget.dayAmount', valueType: 'number' }, 'number', '12.5'));
    client.change(new client.TextArea({ action: 'updateSettingField', key: 'dataSources.logRoots', valueType: 'string-array' }, ' one\n\n two '));
    const checkbox = new client.Input({ action: 'updateSettingField', key: 'notifications.enabled' }, 'checkbox', '');
    checkbox.checked = true;
    client.change(checkbox);

    expect(client.posts).toEqual([
      { type: 'updateSettingField', key: 'budget.dayAmount', value: 12.5 },
      { type: 'updateSettingField', key: 'dataSources.logRoots', value: ['one', 'two'] },
      { type: 'updateSettingField', key: 'notifications.enabled', value: true }
    ]);
  });

  it('updates budget preview locally on input and posts only on change', () => {
    const preview = { textContent: '' };
    const client = runClient({ '[data-budget-preview]': preview });
    const input = new client.Input({ action: 'updateSettingField', key: 'budget.dayAmount', valueType: 'number' }, 'number', '7');
    client.elements['[data-key="budget.dayAmount"]'] = input;

    client.input(input);
    expect(preview.textContent).toContain('Daily budget preview: $7.00');
    expect(client.posts).toEqual([]);

    client.change(input);
    expect(client.posts).toEqual([{ type: 'updateSettingField', key: 'budget.dayAmount', value: 7 }]);
  });

  it('escapes malicious settings values, diagnostics, and errors', () => {
    const model = viewModel();
    const malicious = '<img src=x onerror=alert(1)>';
    model.settings = settingsView();
    model.settings.draft.dataSources.logRoots = [malicious];
    model.settings.errors['budget.dayAmount'] = malicious;
    model.settings.diagnostics[0].root = malicious;
    model.settings.diagnostics[0].warnings = [malicious];
    const html = buildCostCenterHtml(model, 'safe-nonce');

    expect(html).not.toContain(malicious);
    expect(html.match(/&lt;img src=x onerror=alert\(1\)&gt;/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

function runClient(initialElements: Record<string, { textContent?: string }> = {}) {
  const posts: unknown[] = [];
  const listeners: Record<string, (event: { target: ClientElement; key?: string; preventDefault(): void }) => void> = {};
  class ClientElement {
    dataset: Record<string, string>;
    value = '';
    checked = false;
    type = '';
    constructor(dataset: Record<string, string> = {}) { this.dataset = dataset; }
    closest(selector: string) { return selector === '[data-action]' && this.dataset.action ? this : null; }
    matches(selector: string) { return selector === 'select, input, textarea' && (this instanceof ClientInput || this instanceof ClientSelect || this instanceof ClientTextArea); }
    focus() {}
  }
  class ClientInput extends ClientElement { constructor(dataset = {}, type = 'text', value = '') { super(dataset); this.type = type; this.value = value; } }
  class ClientSelect extends ClientElement {}
  class ClientTextArea extends ClientElement { constructor(dataset = {}, value = '') { super(dataset); this.value = value; } }
  const elements: Record<string, ClientElement | { textContent?: string }> = { ...initialElements };
  const document = {
    addEventListener(type: string, listener: typeof listeners[string]) { listeners[type] = listener; },
    querySelector(selector: string): ClientElement | { textContent?: string } | null { return elements[selector] ?? null; }
  };
  vm.runInNewContext(buildCostCenterClientScript(), {
    acquireVsCodeApi: () => ({ postMessage(message: unknown) { posts.push(message); } }),
    document,
    HTMLInputElement: ClientInput,
    HTMLSelectElement: ClientSelect,
    HTMLTextAreaElement: ClientTextArea
  });
  const fire = (type: string, target: ClientElement) => listeners[type]({ target, preventDefault() {} });
  return { posts, elements, Element: ClientElement, Input: ClientInput, Select: ClientSelect, TextArea: ClientTextArea, click: (target: ClientElement) => fire('click', target), change: (target: ClientElement) => fire('change', target), input: (target: ClientElement) => fire('input', target) };
}

function settingsView(): NonNullable<CostCenterViewModel['settings']> {
  return {
    open: true,
    group: 'budget',
    draft: {
      budget: { dayAmount: -1, weekAmount: 50, monthAmount: 200, warningPercent: 80 },
      display: { showSession: true, showWorkspace: true, showBudget: true, budgetPeriod: 'month', defaultRange: '7d', compareByDefault: false },
      dataSources: { logRoots: ['C:\\missing'], include: ['cli'] },
      notifications: { enabled: true, everyAmount: 10, thresholdSummary: true }
    },
    errors: { 'budget.dayAmount': 'Enter zero or a positive USD amount.' },
    dirty: true,
    diagnostics: [{ root: 'C:\\missing', status: 'missing', filesCount: 0, sessionsCount: 0, warnings: ['No JSONL files found.'] }]
  };
}

function analysisViewModel(): CostCenterViewModel {
  const model = viewModel();
  model.report.sessions = [{ key: 'session-1', sessionId: 'session-1', label: '<Session>', projectKey: 'project-1', projectLabel: '<Project>', projectPath: 'C:\\work\\<private>', source: '<cli>', startedAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T01:00:00.000Z', durationMs: 1, models: ['<model>'], tokens: { inputTokens: 10, cachedInputTokens: 2, outputTokens: 3, totalTokens: 15 }, estimatedCost: 1, sharePercent: 50, partial: true, timeline: [{ key: 'point', label: '<point>', start: '2026-07-16T00:00:00.000Z', endExclusive: '2026-07-16T01:00:00.000Z', cost: 1, tokens: 15, sessions: 1, partial: true }] }];
  model.report.projects = [{ key: 'project-1', label: '<Project>', path: 'C:\\work\\<private>', estimatedCost: 1, comparisonPercent: 10, sessionCount: 1, activeDays: 1, topModel: '<model>', averageCostPerSession: 1, partial: true, pinned: true, excluded: false }];
  model.report.models = [
    { model: '<model>', estimatedCost: 1, tokens: { inputTokens: 10, cachedInputTokens: 2, outputTokens: 3, totalTokens: 15 }, sessionCount: 1, projectCount: 1, averageCostPerSession: 1, sharePercent: 50, pricingState: 'missing', partial: true },
    { model: 'bundled', estimatedCost: 2, tokens: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, totalTokens: 2 }, sessionCount: 1, projectCount: 1, averageCostPerSession: 2, sharePercent: 50, pricingState: 'bundled', partial: false }
  ];
  return model;
}

function viewModel(): CostCenterViewModel {
  return {
    report: {
      filters: { scope: 'workspace' as const, range: { kind: '7d' as const, compare: true }, section: 'overview' as const },
      rangeLabel: 'Last 7 days',
      summary: { cost: { value: 12.5, partial: false, comparisonPercent: 25 }, totalTokens: 1234, activeDays: 2, averageCostPerActiveDay: 6.25, sessionCount: 1 },
      budget: { period: 'week' as const, amount: 50, spent: 12.5, remaining: 37.5, projected: undefined, state: 'neutral' as const, explanation: 'Budget based on selected range.', partial: false },
      chart: [{ key: '2026-07-16', label: 'Jul 16', start: '2026-07-16T00:00:00.000Z', endExclusive: '2026-07-17T00:00:00.000Z', cost: 12.5, comparisonCost: 10, tokens: 1234, sessions: 1, partial: false }],
      drivers: { session: { key: 'session-1', label: 'Session 1', cost: 12.5, sharePercent: 12.5 }, project: { key: 'project-1', label: 'Project 1', cost: 12.5, sharePercent: 12.5 }, model: { key: 'model-1', label: 'Model 1', cost: 12.5, sharePercent: 12.5 } },
      sessions: [], projects: [], models: [], warnings: []
    },
    uiState: {
      filters: { scope: 'workspace' as const, range: { kind: '7d' as const, compare: true }, section: 'overview' as const },
      search: '',
      sort: { sessions: { column: 'estimatedCost' as const, direction: 'desc' as const }, projects: { column: 'estimatedCost' as const, direction: 'desc' as const }, models: { column: 'estimatedCost' as const, direction: 'desc' as const } }
    }
  };
}
