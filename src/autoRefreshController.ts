export interface AutoRefreshController {
  updateIntervalSeconds(seconds: number): void;
  dispose(): void;
}

export function createAutoRefreshController(refresh: () => Promise<void> | void): AutoRefreshController {
  let timer: NodeJS.Timeout | undefined;

  const clearTimer = (): void => {
    if (!timer) {
      return;
    }

    clearInterval(timer);
    timer = undefined;
  };

  return {
    updateIntervalSeconds(seconds: number): void {
      clearTimer();

      if (seconds <= 0) {
        return;
      }

      timer = setInterval(() => {
        void Promise.resolve(refresh()).catch(() => undefined);
      }, seconds * 1000);
    },

    dispose(): void {
      clearTimer();
    }
  };
}
