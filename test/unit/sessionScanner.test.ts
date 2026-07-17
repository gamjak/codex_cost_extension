import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findSessionFileDescriptors, findSessionFiles } from '../../src/data/sessionScanner';

const tempDirectories: string[] = [];

async function makeFixture(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cost-'));
  tempDirectories.push(root);

  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const filePath = path.join(root, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, contents, 'utf8');
    })
  );

  return root;
}

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

  it('deduplicates files when configured roots overlap', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cost-'));
    tempDirectories.push(root);
    const nested = path.join(root, 'nested');
    await fs.mkdir(nested, { recursive: true });
    const sessionPath = path.join(nested, 'session.jsonl');
    await fs.writeFile(sessionPath, '{}\n', 'utf8');

    expect(await findSessionFiles([root, nested])).toEqual([sessionPath]);
  });
});

describe('findSessionFileDescriptors', () => {
  it('discovers resolved JSONL descriptors in deterministic order', async () => {
    const root = await makeFixture({
      'z/session.jsonl': '{}\n',
      'a/session.jsonl': '{}\n',
      'ignore.txt': 'ignored'
    });

    const descriptors = await findSessionFileDescriptors([root], { concurrency: 2 });

    expect(descriptors.map(({ filePath }) => filePath)).toEqual([
      path.resolve(root, 'a/session.jsonl'),
      path.resolve(root, 'z/session.jsonl')
    ]);
    expect(
      descriptors.every(
        ({ size, mtimeMs, ctimeMs }) =>
          size === 3 && Number.isFinite(mtimeMs) && Number.isFinite(ctimeMs)
      )
    ).toBe(true);
  });

  it('bounds concurrent metadata operations', async () => {
    const root = await makeFixture(
      Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [`session-${index}.jsonl`, '{}\n'])
      )
    );
    let active = 0;
    let maximum = 0;

    await findSessionFileDescriptors([root], {
      concurrency: 2,
      onMetadataStart: () => {
        active += 1;
        maximum = Math.max(maximum, active);
      },
      onMetadataEnd: () => {
        active -= 1;
      }
    });

    expect(maximum).toBeLessThanOrEqual(2);
    expect(maximum).toBeGreaterThan(1);
    expect(active).toBe(0);
  });

  it('ignores missing roots without dropping valid roots', async () => {
    const root = await makeFixture({ 'session.jsonl': '{}\n' });
    const missingRoot = path.join(root, 'missing');

    const descriptors = await findSessionFileDescriptors([missingRoot, root]);

    expect(descriptors.map(({ filePath }) => filePath)).toEqual([
      path.join(root, 'session.jsonl')
    ]);
  });

  it('does not mask observer errors that resemble filesystem errors', async () => {
    const root = await makeFixture({ 'session.jsonl': '{}\n' });
    const observerError = Object.assign(new Error('observer failed'), { code: 'ENOENT' });

    await expect(
      findSessionFileDescriptors([root], {
        onMetadataStart: () => {
          throw observerError;
        }
      })
    ).rejects.toBe(observerError);
  });

  it.skipIf(process.platform === 'win32')(
    'ignores inaccessible roots without dropping valid roots',
    async () => {
      const root = await makeFixture({ 'session.jsonl': '{}\n' });
      const inaccessibleRoot = path.join(root, 'inaccessible');
      await fs.mkdir(inaccessibleRoot);
      await fs.chmod(inaccessibleRoot, 0o000);

      try {
        const descriptors = await findSessionFileDescriptors([inaccessibleRoot, root]);

        expect(descriptors.map(({ filePath }) => filePath)).toEqual([
          path.join(root, 'session.jsonl')
        ]);
      } finally {
        await fs.chmod(inaccessibleRoot, 0o700);
      }
    }
  );

  it('does not duplicate descriptors for duplicate roots', async () => {
    const root = await makeFixture({ 'session.jsonl': '{}\n' });

    const descriptors = await findSessionFileDescriptors([root, root]);

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]?.filePath).toBe(path.join(root, 'session.jsonl'));
  });
});
