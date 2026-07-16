export interface ConfigurationChangeEvent {
  affectsConfiguration(section: string): boolean;
}

export interface ConfigurationUpdate {
  key: string;
  value: unknown;
}

const DATA_SOURCE_KEYS = new Set(['logRoots', 'sources.include']);

export class ConfigurationRefreshController {
  private guidedBatchDepth = 0;
  private readonly pendingGuidedEvents = new Set<string>();

  constructor(
    private readonly refresh: () => Promise<void>,
    private readonly reaggregateCached: () => Promise<void>
  ) {}

  async handleChange(event: ConfigurationChangeEvent): Promise<void> {
    const guidedMatches = [...this.pendingGuidedEvents].filter((key) => event.affectsConfiguration(`codexCost.${key}`));
    if (guidedMatches.length > 0) {
      for (const key of guidedMatches) this.pendingGuidedEvents.delete(key);
      return;
    }
    if (!event.affectsConfiguration('codexCost') || this.guidedBatchDepth > 0) return;
    if (event.affectsConfiguration('codexCost.logRoots') || event.affectsConfiguration('codexCost.sources.include')) {
      await this.refresh();
      return;
    }
    await this.reaggregateCached();
  }

  async applyGuidedSettings(
    updates: readonly ConfigurationUpdate[],
    update: (key: string, value: unknown) => Promise<void>
  ): Promise<void> {
    this.guidedBatchDepth += 1;
    try {
      for (const entry of updates) {
        this.pendingGuidedEvents.add(entry.key);
        try { await update(entry.key, entry.value); }
        catch (error) { this.pendingGuidedEvents.delete(entry.key); throw error; }
      }
    } finally {
      this.guidedBatchDepth -= 1;
    }
    if (updates.some(({ key }) => DATA_SOURCE_KEYS.has(key))) await this.refresh();
    else await this.reaggregateCached();
  }
}
