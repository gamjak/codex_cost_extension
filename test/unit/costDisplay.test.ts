import { afterEach, describe, expect, it } from 'vitest';

import { configureDisplay, formatCostUsd, formatTokensDe } from '../../src/view/costDisplay';

afterEach(() => {
  configureDisplay('de-DE');
});

describe('configureDisplay', () => {
  it('formats numbers with the selected VS Code locale', () => {
    configureDisplay('en-US');

    expect(formatTokensDe(1234)).toBe('1,234');
    expect(formatCostUsd(12.5)).toBe('$12.50');
  });

  it('falls back safely for invalid locales', () => {
    configureDisplay('not_a_locale');
    expect(formatTokensDe(1234)).toBe('1,234');
  });
});
