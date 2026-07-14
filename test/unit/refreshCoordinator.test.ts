import { describe, expect, it } from 'vitest';

import { RefreshCoordinator } from '../../src/refreshCoordinator';

describe('RefreshCoordinator', () => {
  it('coalesces overlapping requests without running refreshes concurrently', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    let active = 0;
    let maxActive = 0;
    const coordinator = new RefreshCoordinator(async () => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (calls === 1) {
        await firstGate;
      }
      active -= 1;
    });

    const first = coordinator.request();
    const second = coordinator.request();
    const third = coordinator.request();
    releaseFirst?.();
    await Promise.all([first, second, third]);

    expect(calls).toBe(2);
    expect(maxActive).toBe(1);
  });
});
