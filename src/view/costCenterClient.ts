export function buildCostCenterClientScript(): string {
  return `(() => {
  const vscode = acquireVsCodeApi();
  const post = (message) => vscode.postMessage(message);
  const rangeValue = () => {
    const range = document.querySelector('[data-control="range"]');
    const compare = document.querySelector('[data-control="compare"]');
    if (!range) return undefined;
    return range.value === 'custom'
      ? { kind: 'custom', startDate: document.querySelector('[data-control="start-date"]')?.value || '', endDate: document.querySelector('[data-control="end-date"]')?.value || '', compare: Boolean(compare?.checked) }
      : { kind: range.value, compare: Boolean(compare?.checked) };
  };
  const postAction = (target) => {
    const type = target.dataset.action;
    if (!type) return;
    if (type === 'setScope') return post({ type: 'setScope', value: target.value });
    if (type === 'setRange') return post({ type: 'setRange', value: rangeValue() });
    if (type === 'setSection') return post({ type: 'setSection', value: target.dataset.value });
    if (type === 'clearFilter') return post({ type: 'clearFilter', value: target.dataset.value });
    if (type === 'filterChartPoint') return post({ type: 'filterChartPoint', pointStart: target.dataset.start, pointEndExclusive: target.dataset.endExclusive });
    if (type === 'drillProject' || type === 'drillModel' || type === 'toggleSession' || type === 'toggleProjectPin' || type === 'excludeProject') return post({ type, key: target.dataset.key });
    if (type === 'updateSettingField') {
      const value = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value;
      return post({ type, key: target.dataset.key, value });
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
