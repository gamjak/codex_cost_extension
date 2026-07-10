import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findSessionFiles } from '../../src/data/sessionScanner';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await fs.rm(directory, { recursive: true, force: true });
    })
  );
});

describe('findSessionFiles', () => {
  it('recursively finds jsonl files and ignores other extensions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cost-'));
    tempDirectories.push(root);

    const nested = path.join(root, '2026', '06', '01');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(nested, 'session-a.jsonl'), '{}\n', 'utf8');
    await fs.writeFile(path.join(nested, 'ignore.txt'), 'nope\n', 'utf8');

    const files = await findSessionFiles([root]);

    expect(files).toEqual([path.join(nested, 'session-a.jsonl')]);
  });
});
