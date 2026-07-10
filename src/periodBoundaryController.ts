export interface PeriodBoundaryController {
  dispose(): void;
}

function nextLocalDayBoundary(now: Date): Date {
  const next = new Date(now);
  next.setHours(24, 0, 1, 0);
  return next;
}

export function createPeriodBoundaryController(refresh: () => Promise<void> | void): PeriodBoundaryController {
  let timer: NodeJS.Timeout | undefined;

  const schedule = (): void => {
    const delay = Math.max(1_000, nextLocalDayBoundary(new Date()).getTime() - Date.now());
    timer = setTimeout(() => {
      void Promise.resolve(refresh()).catch(() => undefined).finally(schedule);
    }, delay);
  };

  schedule();

  return {
    dispose(): void {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    }
  };
}
