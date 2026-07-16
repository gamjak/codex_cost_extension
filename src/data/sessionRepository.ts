import * as path from 'node:path';

import type { ParsedSession } from '../domain/types';
import {
  appendSessionToCheckpoint,
  checkpointPrefixMatches,
  parseSessionToCheckpoint,
  type SessionParseCheckpoint,
  type SessionParseDiagnostics
} from './sessionParseCheckpoint';
import {
  findSessionFileDescriptors,
  type SessionFileDescriptor
} from './sessionScanner';

interface CachedSession {
  descriptor: SessionFileDescriptor;
  checkpoint: SessionParseCheckpoint;
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
  scannerConcurrency?: number;
  onParse?: (kind: 'full' | 'append', filePath: string) => void;
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
  diagnostics: SessionParseDiagnostics
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

function sameIdentity(left: SessionFileDescriptor, right: SessionFileDescriptor): boolean {
  const leftHasNativeIdentity = left.dev !== undefined || left.ino !== undefined;
  const rightHasNativeIdentity = right.dev !== undefined || right.ino !== undefined;
  if (leftHasNativeIdentity || rightHasNativeIdentity) {
    if (!left.dev || !left.ino || !right.dev || !right.ino) {
      return false;
    }
    return left.dev === right.dev && left.ino === right.ino;
  }
  return left.ctimeMs === right.ctimeMs;
}

function unchanged(cached: CachedSession, next: SessionFileDescriptor): boolean {
  const previous = cached.descriptor;
  return sameIdentity(previous, next) && previous.size === next.size && previous.mtimeMs === next.mtimeMs;
}

function safeAppend(cached: CachedSession, next: SessionFileDescriptor): boolean {
  return sameIdentity(cached.descriptor, next) && next.size > cached.descriptor.size &&
    cached.checkpoint.bytesRead === cached.descriptor.size;
}

export class SessionRepository {
  private readonly cache = new Map<string, CachedSession>();
  private readonly concurrency: number;
  private readonly scannerConcurrency: number;
  private readonly onParse?: SessionRepositoryOptions['onParse'];

  constructor(options: SessionRepositoryOptions = {}) {
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 8));
    this.scannerConcurrency = Math.max(1, Math.floor(options.scannerConcurrency ?? 8));
    this.onParse = options.onParse;
  }

  async load(logRoots: readonly string[]): Promise<LoadSessionsResult> {
    const descriptors = await findSessionFileDescriptors(logRoots, { concurrency: this.scannerConcurrency });
    const currentFiles = new Set(descriptors.map(({ filePath }) => filePath));

    for (const cachedPath of this.cache.keys()) {
      if (!currentFiles.has(cachedPath)) {
        this.cache.delete(cachedPath);
      }
    }

    const entries = await mapWithConcurrency(descriptors, this.concurrency, async (descriptor) => {
      const { filePath } = descriptor;
      try {
        const cached = this.cache.get(filePath);
        if (cached && unchanged(cached, descriptor)) {
          return cached;
        }

        const kind = cached && safeAppend(cached, descriptor) &&
          await checkpointPrefixMatches(filePath, cached.checkpoint) ? 'append' : 'full';
        this.onParse?.(kind, filePath);
        const parsed = kind === 'append'
          ? await appendSessionToCheckpoint(filePath, cached!.checkpoint)
          : await parseSessionToCheckpoint(filePath);
        const entry: CachedSession = {
          descriptor,
          checkpoint: parsed.checkpoint,
          session: parsed.result.session,
          warnings: diagnosticsWarnings(filePath, parsed.result.diagnostics)
        };
        this.cache.set(filePath, entry);
        return entry;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown read error';
        this.cache.delete(filePath);
        return {
          session: null,
          warnings: [`${path.basename(filePath)}: could not be read (${message}).`]
        };
      }
    });

    return {
      sessions: entries.flatMap((entry) => entry.session ? [entry.session] : []),
      warnings: entries.flatMap((entry) => entry.warnings),
      filesCount: descriptors.length
    };
  }
}
