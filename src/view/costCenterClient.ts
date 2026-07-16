export function buildCostCenterClientScript(): string {
  return `(() => {
  const vscode = acquireVsCodeApi();
  const post = (message) => vscode.postMessage(message);
  const rangeValue = () => {
    const range = document.querySelector('[data-control="range"]');
    const compare = document.querySelector('[data-control="compare"]');
    if (!range) return undefined;
    const value = range.value;
    return value === 'custom'
      ? { kind: 'custom', startDate: document.querySelector('[data-control="start-date"]')?.value || '', endDate: document.querySelector('[data-control="end-date"]')?.value || '', compare: Boolean(compare?.checked) }
      : { kind: value, compare: Boolean(compare?.checked) };
  };
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const type = target.dataset.action;
    if (type === 'setRange') return post({ type, value: rangeValue() });
    post({ type, key: target.dataset.key, value: target.dataset.value });
  });
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    const type = target.dataset.action;
    if (!type) return;
    if (type === 'setRange') return post({ type, value: rangeValue() });
    const value = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value;
    post({ type, key: target.dataset.key, value });
  });
})();`;
}
