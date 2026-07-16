export function buildCostCenterClientScript(): string {
  return `(() => {
  const vscode = acquireVsCodeApi();
  const post = (message) => vscode.postMessage(message);
  const settingFieldKeys = new Set(['budget.dayAmount', 'budget.weekAmount', 'budget.monthAmount', 'budget.warningPercent', 'display.showSession', 'display.showWorkspace', 'display.showBudget', 'display.budgetPeriod', 'display.defaultRange', 'display.compareByDefault', 'dataSources.logRoots', 'dataSources.include', 'notifications.enabled', 'notifications.everyAmount', 'notifications.thresholdSummary']);
  const rangeValue = () => {
    const range = document.querySelector('[data-control="range"]');
    const compare = document.querySelector('[data-control="compare"]');
    if (!range) return undefined;
    return range.value === 'custom'
      ? { kind: 'custom', startDate: document.querySelector('[data-control="start-date"]')?.value || '', endDate: document.querySelector('[data-control="end-date"]')?.value || '', compare: Boolean(compare?.checked) }
      : { kind: range.value, compare: Boolean(compare?.checked) };
  };
  const validLocalDate = (value) => {
    const match = /^(\\d{2})\\.(\\d{2})\\.(\\d{4})$/.exec(value);
    if (!match) return undefined;
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    return date.getFullYear() === Number(match[3]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[1]) ? date : undefined;
  };
  const showRangeError = (message) => {
    const error = document.querySelector('[data-range-error]');
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  };
  const postAction = (target) => {
    const type = target.dataset.action;
    if (!type) return;
    if (type === 'setScope') return post({ type: 'setScope', value: target.value });
    if (type === 'setRange') {
      const value = rangeValue();
      if (!value) return;
      if (value.kind === 'custom') {
        const complete = /^(\\d{2})\\.(\\d{2})\\.(\\d{4})$/;
        if (!value.startDate || !value.endDate) return;
        if (!complete.test(value.startDate) || !complete.test(value.endDate)) {
          showRangeError('Enter valid dates in DD.MM.YYYY format with the end on or after the start.');
          return;
        }
        const start = validLocalDate(value.startDate); const end = validLocalDate(value.endDate);
        if (!start || !end || end < start) {
          showRangeError('Enter valid dates in DD.MM.YYYY format with the end on or after the start.');
          return;
        }
      }
      showRangeError('');
      return post({ type: 'setRange', value });
    }
    if (type === 'setSection') return post({ type: 'setSection', value: target.dataset.value });
    if (type === 'setSettingsGroup') return post({ type: 'setSettingsGroup', value: target.dataset.value });
    if (type === 'resetSettingsGroup') return post({ type: 'resetSettingsGroup', value: target.dataset.value });
    if (type === 'clearFilter') return post({ type: 'clearFilter', value: target.dataset.value });
    if (type === 'filterChartPoint') return post({ type: 'filterChartPoint', pointStart: target.dataset.start, pointEndExclusive: target.dataset.endExclusive });
    if (type === 'setSort') return post({ type: 'setSort', key: target.dataset.key, value: target.dataset.value });
    if (type === 'setSearch') return post({ type: 'setSearch', value: target.value });
    if (type === 'drillProject' || type === 'drillModel' || type === 'toggleSession' || type === 'toggleProjectPin' || type === 'excludeProject') return post({ type, key: target.dataset.key });
    if (type === 'updateSettingField') {
      const key = target.dataset.key;
      if (!settingFieldKeys.has(key)) return;
      const value = target instanceof HTMLInputElement && target.type === 'checkbox'
        ? target.checked
        : target.dataset.valueType === 'number'
          ? Number(target.value)
          : target.dataset.valueType === 'string-array'
            ? target.value.split(/\\r?\\n/).map((item) => item.trim()).filter(Boolean)
            : target.value;
      return post({ type: 'updateSettingField', key, value });
    }
    post({ type });
  };
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || target.matches('select, input, textarea')) return;
    postAction(target);
  });
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    postAction(target);
  });
  document.addEventListener('blur', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.action !== 'setRange') return;
    postAction(target);
  }, true);
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.valueType !== 'number' || !target.dataset.key?.startsWith('budget.')) return;
    const preview = document.querySelector('[data-budget-preview]');
    if (!preview) return;
    const amount = (key) => Number(document.querySelector('[data-key="' + key + '"]')?.value || 0).toFixed(2);
    preview.textContent = 'Daily budget preview: $' + amount('budget.dayAmount') + ' · Weekly: $' + amount('budget.weekAmount') + ' · Monthly: $' + amount('budget.monthAmount');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const tab = event.target.closest('[role="tab"]');
    if (!tab) return;
    const tabs = Array.from(tab.closest('[role="tablist"]')?.querySelectorAll('[role="tab"]') || []);
    const index = tabs.indexOf(tab);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    if (!next) return;
    event.preventDefault();
    next.focus();
    post({ type: 'setSection', value: next.dataset.value });
  });
})();`;
}
