import type { BudgetPeriod, FilterStatus } from './types';

export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface ResolvedFilterStartDate {
  filter: FilterStatus;
  startAt?: Date;
  warning?: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatFixedDate(value: Date): string {
  return `${pad(value.getDate())}.${pad(value.getMonth() + 1)}.${value.getFullYear()}`;
}

export function resolveFilterStartDate(rawValue: string | undefined): ResolvedFilterStartDate {
  const trimmedValue = rawValue?.trim();

  if (!trimmedValue) {
    return {
      filter: {
        state: 'off'
      }
    };
  }

  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmedValue);
  if (!match) {
    return {
      filter: {
        state: 'invalid',
        rawStartDate: trimmedValue
      },
      warning: `Invalid filter start date: ${trimmedValue}. Expected DD.MM.YYYY.`
    };
  }

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const startAt = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (
    startAt.getFullYear() !== year ||
    startAt.getMonth() !== month - 1 ||
    startAt.getDate() !== day
  ) {
    return {
      filter: {
        state: 'invalid',
        rawStartDate: trimmedValue
      },
      warning: `Invalid filter start date: ${trimmedValue}. Expected DD.MM.YYYY.`
    };
  }

  return {
    filter: {
      state: 'active',
      rawStartDate: trimmedValue,
      appliedStartDate: formatFixedDate(startAt)
    },
    startAt
  };
}

export function createBudgetWindow(period: BudgetPeriod, now: Date): TimeWindow {
  const end = new Date(now);
  const start = new Date(now);

  if (period === 'day') {
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  if (period === 'week') {
    start.setHours(0, 0, 0, 0);
    const dayOfWeek = start.getDay();
    const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    start.setDate(start.getDate() - distanceToMonday);
    return { start, end };
  }

  start.setHours(0, 0, 0, 0);
  start.setDate(1);
  return { start, end };
}

export function budgetPeriodLabel(period: BudgetPeriod): string {
  if (period === 'day') {
    return 'Day';
  }

  if (period === 'week') {
    return 'Week';
  }

  return 'Month';
}
