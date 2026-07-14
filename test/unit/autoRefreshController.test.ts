import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAutoRefreshController } from '../../src/autoRefreshController';

describe('createAutoRefreshController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs refresh on the configured cadence', async () => {
    const refresh = vi.fn();
    const controller = createAutoRefreshController(refresh);

    controller.updateIntervalSeconds(60);
    await vi.advanceTimersByTimeAsync(180_000);

    expect(refresh).toHaveBeenCalledTimes(3);
    controller.dispose();
  });

  it('disables scheduling when the interval is zero', async () => {
    const refresh = vi.fn();
    const controller = createAutoRefreshController(refresh);

    controller.updateIntervalSeconds(0);
    await vi.advanceTimersByTimeAsync(180_000);

    expect(refresh).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('replaces the previous interval when the setting changes', async () => {
    const refresh = vi.fn();
    const controller = createAutoRefreshController(refresh);

    controller.updateIntervalSeconds(60);
    await vi.advanceTimersByTimeAsync(60_000);
    controller.updateIntervalSeconds(30);
    await vi.advanceTimersByTimeAsync(90_000);

    expect(refresh).toHaveBeenCalledTimes(4);
    controller.dispose();
  });

  it('reports asynchronous refresh failures', async () => {
    const error = new Error('refresh failed');
    const onError = vi.fn();
    const controller = createAutoRefreshController(() => Promise.reject(error), onError);

    controller.updateIntervalSeconds(1);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(onError).toHaveBeenCalledWith(error);
    controller.dispose();
  });
});
