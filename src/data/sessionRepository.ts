import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ParsedSession } from '../domain/types';
import { parseSessionFileWithDiagnostics } from './jsonlSessionParser';
import { findSessionFiles } from './sessionScanner';

interface CachedSession {
  mtimeMs: number;
  ctimeMs: number;
  size: number;
  session: ParsedSession | null;
  warnings: string[];
}

export interface LoadSessionsResult {
  sessions: ParsedSession[];
  warnings: string[];
  filesCount: number;
}

export interface SessionRepositoryOptions {
  concurrency?: number;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  });

  await Promise.all(workers);
  return results;
}

function diagnosticsWarnings(
  filePath: string,
  diagnostics: Awaited<ReturnType<typeof parseSessionFileWithDiagnostics>>['diagnostics']
): string[] {
  const label = path.basename(filePath);
  const warnings: string[] = [];

  if (diagnostics.malformedLines > 0) {
    warnings.push(`${label}: skipped ${diagnostics.malformedLines} malformed JSONL line(s).`);
  }
  if (diagnostics.invalidTimestamps > 0) {
    warnings.push(`${label}: skipped ${diagnostics.invalidTimestamps} invalid timestamp(s).`);
  }
  if (diagnostics.invalidTokenUsageRecords > 0) {
    warnings.push(`${label}: skipped ${diagnostics.invalidTokenUsageRecords} invalid token usage record(s).`);
  }

  return warnings;
}

export class SessionRepository {
  private readonly cache = new Map<string, CachedSession>();
  private readonly concurrency: number;

  constructor(options: SessionRepositoryOptions = {}) {
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 8));
  }

  async load(logRoots: readonly string[]): Promise<LoadSessionsResult> {
    const filePaths = await findSessionFiles(logRoots);
    const currentFiles = new Set(filePaths);

    for (const cachedPath of this.cache.keys()) {
      if (!currentFiles.has(cachedPath)) {
        this.cache.delete(cachedPath);
      }
    }

    const entries = await mapWithConcurrency(filePaths, this.concurrency, async (filePath) => {
      try {
        const stat = await fs.stat(filePath);
        const cached = this.cache.get(filePath);
        if (cached && cached.mtimeMs === stat.mtimeMs && cached.ctimeMs === stat.ctimeMs && cached.size === stat.size) {
          return cached;
        }

        const parsed = await parseSessionFileWithDiagnostics(filePath);
        const entry: CachedSession = {
          mtimeMs: stat.mtimeMs,
          ctimeMs: stat.ctimeMs,
          size: stat.size,
          session: parsed.session,
          warnings: diagnosticsWarnings(filePath, parsed.diagnostics)
        };
        this.cache.set(filePath, entry);
        return entry;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown read error';
        const entry: CachedSession = {
          mtimeMs: -1,
          ctimeMs: -1,
          size: -1,
          session: null,
          warnings: [`${path.basename(filePath)}: could not be read (${message}).`]
        };
        this.cache.delete(filePath);
        return entry;
      }
    });

    return {
      sessions: entries.flatMap((entry) => entry.session ? [entry.session] : []),
      warnings: entries.flatMap((entry) => entry.warnings),
      filesCount: filePaths.length
    };
  }
}
