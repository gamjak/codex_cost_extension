import type { Dirent, Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface SessionFileDescriptor {
  filePath: string;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  dev?: number;
  ino?: number;
}

export interface SessionScannerOptions {
  concurrency?: number;
  onMetadataStart?: () => void;
  onMetadataEnd?: () => void;
}

function isIgnoredFileSystemError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'EACCES';
}

function optionalIdentity(value: number): number | undefined {
  return value !== 0 && Number.isFinite(value) ? value : undefined;
}

function toDescriptor(filePath: string, stats: Stats): SessionFileDescriptor {
  return {
    filePath,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
    ...(optionalIdentity(stats.dev) === undefined ? {} : { dev: stats.dev }),
    ...(optionalIdentity(stats.ino) === undefined ? {} : { ino: stats.ino })
  };
}

export async function findSessionFileDescriptors(
  logRoots: readonly string[],
  options: SessionScannerOptions = {}
): Promise<SessionFileDescriptor[]> {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 8));
  const directoryQueue = Array.from(new Set(logRoots.map((root) => path.resolve(root))));
  const queuedDirectories = new Set(directoryQueue);
  const candidateFiles = new Set<string>();
  const descriptors = new Map<string, SessionFileDescriptor>();
  const waiters = new Set<() => void>();
  let queueIndex = 0;
  let outstandingDirectories = directoryQueue.length;

  const wakeWorkers = (): void => {
    for (const wake of waiters) {
      wake();
    }
    waiters.clear();
  };

  const takeDirectory = async (): Promise<string | undefined> => {
    while (queueIndex >= directoryQueue.length && outstandingDirectories > 0) {
      await new Promise<void>((resolve) => waiters.add(resolve));
    }
    return directoryQueue[queueIndex++];
  };

  const enqueueDirectory = (directoryPath: string): void => {
    if (queuedDirectories.has(directoryPath)) {
      return;
    }
    queuedDirectories.add(directoryPath);
    directoryQueue.push(directoryPath);
    outstandingDirectories += 1;
    wakeWorkers();
  };

  const completeDirectory = (): void => {
    outstandingDirectories -= 1;
    if (outstandingDirectories === 0) {
      wakeWorkers();
    }
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      const directoryPath = await takeDirectory();
      if (directoryPath === undefined) {
        return;
      }

      try {
        try {
          const entries: Dirent[] = await fs.readdir(directoryPath, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.resolve(directoryPath, entry.name);
            if (entry.isDirectory()) {
              enqueueDirectory(fullPath);
              continue;
            }
            if (!entry.isFile() || !fullPath.toLowerCase().endsWith('.jsonl')) {
              continue;
            }

            candidateFiles.add(fullPath);
          }
        } catch (error) {
          if (!isIgnoredFileSystemError(error)) {
            throw error;
          }
        }
      } finally {
        completeDirectory();
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const candidates = Array.from(candidateFiles).sort((left, right) => left.localeCompare(right));
  let nextCandidate = 0;
  const metadataWorker = async (): Promise<void> => {
    while (nextCandidate < candidates.length) {
      const filePath = candidates[nextCandidate];
      nextCandidate += 1;
      options.onMetadataStart?.();
      try {
        let stats: Stats;
        try {
          stats = await fs.stat(filePath);
        } catch (error) {
          if (isIgnoredFileSystemError(error)) {
            continue;
          }
          throw error;
        }
        descriptors.set(filePath, toDescriptor(filePath, stats));
      } finally {
        options.onMetadataEnd?.();
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => metadataWorker()));

  return candidates.flatMap((filePath) => {
    const descriptor = descriptors.get(filePath);
    return descriptor === undefined ? [] : [descriptor];
  });
}

export async function findSessionFiles(logRoots: readonly string[]): Promise<string[]> {
  return (await findSessionFileDescriptors(logRoots)).map(({ filePath }) => filePath);
}
