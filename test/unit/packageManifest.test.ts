import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface Manifest {
  publisher: string;
  version: string;
  main: string;
  activationEvents: string[];
  contributes: {
    commands: Array<{ command: string }>;
    configuration: { properties: Record<string, { default?: unknown }> };
  };
}

describe('VS Code manifest', () => {
  it('uses the correct Marketplace publisher and release version', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve('package.json'), 'utf8')
    ) as Manifest;

    expect(manifest.publisher).toBe('gamjak');
    expect(manifest.version).toBe('0.3.1');
  });

  it('keeps contributed commands, activation events, and safe defaults aligned', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve('package.json'), 'utf8')
    ) as Manifest;
    const commands = manifest.contributes.commands.map((command) => command.command);

    for (const command of commands) {
      expect(manifest.activationEvents).toContain(`onCommand:${command}`);
    }
    expect(manifest.main).toBe('./out/src/extension.js');
    expect(manifest.contributes.configuration.properties['codexCost.budget.notifications.enabled'].default).toBe(true);
    expect(manifest.contributes.configuration.properties['codexCost.sources.include'].default).toEqual([]);
  });
});
