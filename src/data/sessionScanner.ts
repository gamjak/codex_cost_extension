import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

async function walkDirectory(directoryPath: string, output: string[]): Promise<void> {
  let entries: Dirent[];

  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === 'ENOENT' || code === 'EACCES') {
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      await walkDirectory(fullPath, output);
      continue;
    }

    if (entry.isFile() && fullPath.toLowerCase().endsWith('.jsonl')) {
      output.push(fullPath);
    }
  }
}

export async function findSessionFiles(logRoots: readonly string[]): Promise<string[]> {
  const files: string[] = [];

  for (const logRoot of logRoots) {
    await walkDirectory(logRoot, files);
  }

  return files.sort((left, right) => left.localeCompare(right));
}
