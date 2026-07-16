import {
  type CostCenterRangeSelection,
  type DateInterval,
  type ResolvedCostCenterRange
} from './costCenterTypes';

export function resolveCostCenterRange(
  selection: CostCenterRangeSelection,
  now: Date
): ResolvedCostCenterRange {
  const today = startOfLocalDay(now);
  if (selection.kind === 'today') {
    const elapsedEnd = new Date(now.getTime() + 1);
    return {
      current: { start: today, endExclusive: elapsedEnd },
      comparison: selection.compare
        ? {
            start: addLocalDays(today, -1),
            endExclusive: addLocalDays(elapsedEnd, -1)
          }
        : undefined,
      bucket: 'hour'
    };
  }

  const current = selection.kind === 'custom'
    ? customInterval(selection.startDate, selection.endDate)
    : trailingInterval(today, selection.kind === '7d' ? 7 : 30);
  const dayCount = countLocalDays(current);

  return {
    current,
    comparison: selection.compare
      ? {
          start: addLocalDays(current.start, -dayCount),
          endExclusive: new Date(current.start)
        }
      : undefined,
    bucket: 'day'
  };
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function customInterval(startDate: string, endDate: string): DateInterval {
  const start = parseLocalDate(startDate);
  const parsedEnd = parseLocalDate(endDate);
  if (parsedEnd < start) {
    throw new Error('End date must be on or after start date.');
  }
  return { start, endExclusive: addLocalDays(parsedEnd, 1) };
}

function parseLocalDate(value: string): Date {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) {
    throw new Error('Date must use DD.MM.YYYY format.');
  }

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText) - 1;
  const year = Number(yearText);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    throw new Error('Date must use DD.MM.YYYY format.');
  }
  return date;
}

function trailingInterval(today: Date, days: number): DateInterval {
  return {
    start: addLocalDays(today, -(days - 1)),
    endExclusive: addLocalDays(today, 1)
  };
}

function countLocalDays(interval: DateInterval): number {
  let cursor = new Date(interval.start);
  let count = 0;
  while (cursor < interval.endExclusive) {
    cursor = addLocalDays(cursor, 1);
    count += 1;
  }
  return count;
}
