import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPeriodBoundaryController } from '../../src/periodBoundaryController';

describe('createPeriodBoundaryController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes just after the next local midnight and reschedules', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 10, 23, 59, 59, 500));
    const refresh = vi.fn();
    const controller = createPeriodBoundaryController(refresh);

    await vi.advanceTimersByTimeAsync(1_500);
    expect(refresh).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
});
