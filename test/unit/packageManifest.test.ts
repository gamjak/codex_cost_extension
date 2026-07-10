import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface Manifest {
  main: string;
  activationEvents: string[];
  contributes: {
    commands: Array<{ command: string }>;
    configuration: { properties: Record<string, { default?: unknown }> };
  };
}

describe('VS Code manifest', () => {
  it('keeps contributed commands, activation events, and safe defaults aligned', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve('package.json'), 'utf8')
    ) as Manifest;
    const commands = manifest.contributes.commands.map((command) => command.command);

    for (const command of commands) {
      expect(manifest.activationEvents).toContain(`onCommand:${command}`);
    }
    expect(manifest.main).toBe('./out/src/extension.js');
    expect(manifest.contributes.configuration.properties['codexCost.budget.notifications.enabled'].default).toBe(false);
    expect(manifest.contributes.configuration.properties['codexCost.sources.include'].default).toEqual([]);
  });
});
