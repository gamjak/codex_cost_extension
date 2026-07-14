export class RefreshCoordinator {
  private requested = false;
  private running?: Promise<void>;

  constructor(private readonly refresh: () => Promise<void>) {}

  request(): Promise<void> {
    this.requested = true;
    if (!this.running) {
      this.running = this.drain().finally(() => {
        this.running = undefined;
      });
    }

    return this.running;
  }

  private async drain(): Promise<void> {
    while (this.requested) {
      this.requested = false;
      await this.refresh();
    }
  }
}
