process.env.TZ = 'UTC';

import { describe, expect, it } from 'vitest';
import { resolveCostCenterRange } from '../../src/domain/costCenterTimeRange';

describe('resolveCostCenterRange', () => {
  const now = new Date('2026-07-16T12:30:00.000Z');

  it('compares Today with yesterday through the same elapsed time', () => {
    expect(resolveCostCenterRange({ kind: 'today', compare: true }, now)).toEqual({
      current: {
        start: new Date('2026-07-16T00:00:00.000Z'),
        endExclusive: new Date('2026-07-16T12:30:00.001Z')
      },
      comparison: {
        start: new Date('2026-07-15T00:00:00.000Z'),
        endExclusive: new Date('2026-07-15T12:30:00.001Z')
      },
      bucket: 'hour'
    });
  });

  it('creates an equal preceding range for a custom inclusive range', () => {
    expect(resolveCostCenterRange({
      kind: 'custom',
      startDate: '10.07.2026',
      endDate: '12.07.2026',
      compare: true
    }, now)).toMatchObject({
      current: {
        start: new Date('2026-07-10T00:00:00.000Z'),
        endExclusive: new Date('2026-07-13T00:00:00.000Z')
      },
      comparison: {
        start: new Date('2026-07-07T00:00:00.000Z'),
        endExclusive: new Date('2026-07-10T00:00:00.000Z')
      },
      bucket: 'day'
    });
  });

  it('rejects an inverted custom range', () => {
    expect(() => resolveCostCenterRange({
      kind: 'custom',
      startDate: '12.07.2026',
      endDate: '10.07.2026',
      compare: false
    }, now)).toThrow('End date must be on or after start date.');
  });

  it('rejects impossible calendar dates instead of normalizing them', () => {
    expect(() => resolveCostCenterRange({
      kind: 'custom', startDate: '31.02.2026', endDate: '01.03.2026', compare: false
    }, now)).toThrow('Date must use DD.MM.YYYY format.');
  });

  it('counts custom calendar days without dividing milliseconds', () => {
    const range = resolveCostCenterRange({
      kind: 'custom',
      startDate: '27.03.2026',
      endDate: '30.03.2026',
      compare: true
    }, new Date('2026-03-30T12:00:00.000Z'));

    expect(range.current.start.getDate()).toBe(27);
    expect(range.current.endExclusive.getDate()).toBe(31);
    expect(range.comparison?.endExclusive.getDate()).toBe(27);
    expect(range.comparison?.start.getDate()).toBe(23);
  });

  it('keeps equal local-calendar comparison days across real Berlin DST', () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'Europe/Berlin';
    try {
      const range = resolveCostCenterRange({
        kind: 'custom', startDate: '28.03.2026', endDate: '30.03.2026', compare: true
      }, new Date('2026-03-30T12:00:00.000Z'));
      expect(range.current.endExclusive.getTime() - range.current.start.getTime()).toBe(71 * 60 * 60 * 1000);
      expect(range.comparison?.start.getDate()).toBe(25);
      expect(range.comparison?.endExclusive.getDate()).toBe(28);
    } finally {
      process.env.TZ = previousTimezone;
    }
  });
});
