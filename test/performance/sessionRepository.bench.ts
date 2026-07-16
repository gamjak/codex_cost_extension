import { performance } from 'node:perf_hooks';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterAll, bench, describe } from 'vitest';

import { SessionRepository } from '../../src/data/sessionRepository';

const fileCount = positiveInteger(process.env.BENCHMARK_FILES, 100);
const recordsPerFile = positiveInteger(process.env.BENCHMARK_RECORDS, 2_000);
const benchmarkOptions = { iterations: 1, time: 0, warmupIterations: 0, warmupTime: 0 } as const;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function timestamp(record: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, record)).toISOString();
}

let root = '';
let firstFile = '';
let firstFileContents = '';

function sessionContents(fileIndex: number): string {
  const records = [
    JSON.stringify({
      timestamp: timestamp(0),
      type: 'session_meta',
      payload: { id: `benchmark-${fileIndex}`, source: 'cli', originator: 'codex_cli_rs', cwd: root }
    }),
    JSON.stringify({
      timestamp: timestamp(1),
      type: 'turn_context',
      payload: { cwd: root, model: 'gpt-5.4' }
    })
  ];
  for (let record = 0; record < recordsPerFile; record += 1) {
    records.push(tokenRecord(record + 2));
  }
  return `${records.join('\n')}\n`;
}

function tokenRecord(record: number): string {
  const input = record * 10;
  const output = record * 2;
  return JSON.stringify({
    timestamp: timestamp(record),
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: record,
          output_tokens: output,
          total_tokens: input + output
        }
      }
    }
  });
}

function createRepository() {
  const work = { full: 0, append: 0 };
  const repository = new SessionRepository({
    onParse(kind) {
      work[kind] += 1;
    }
  });
  return { repository, work };
}

function reset(work: { full: number; append: number }): void {
  work.full = 0;
  work.append = 0;
}

async function measure(
  scenario: string,
  expected: { full: number; append: number },
  action: () => Promise<{ full: number; append: number }>
): Promise<void> {
  const started = performance.now();
  const work = await action();
  const elapsedMs = performance.now() - started;
  console.log(`${scenario}\t${elapsedMs.toFixed(1)} ms\tfull=${work.full}\tappend=${work.append}`);
  if (work.full !== expected.full || work.append !== expected.append) {
    process.exitCode = 1;
    throw new Error(
      `${scenario}: expected full=${expected.full}, append=${expected.append}; ` +
      `received full=${work.full}, append=${work.append}`
    );
  }
}

async function prepareData(): Promise<void> {
  root = await fs.mkdtemp(path.join(tmpdir(), 'codex-cost-benchmark-data-'));
  const writes: Promise<void>[] = [];
  for (let fileIndex = 0; fileIndex < fileCount; fileIndex += 1) {
    const filePath = path.join(root, `session-${fileIndex.toString().padStart(4, '0')}.jsonl`);
    const contents = sessionContents(fileIndex);
    if (fileIndex === 0) {
      firstFile = filePath;
      firstFileContents = contents;
    }
    writes.push(fs.writeFile(filePath, contents));
  }
  await Promise.all(writes);
}

const dataReady = prepareData();

describe('SessionRepository refresh performance', () => {
  afterAll(async () => {
    await dataReady;
    await fs.rm(root, { force: true, recursive: true });
  });

  bench('cold', async () => {
    await dataReady;
    await measure('cold', { full: fileCount, append: 0 }, async () => {
      const { repository, work } = createRepository();
      await repository.load([root]);
      return work;
    });
  }, benchmarkOptions);

  bench('warm', async () => {
    await dataReady;
    const { repository, work } = createRepository();
    await repository.load([root]);
    reset(work);
    await measure('warm', { full: 0, append: 0 }, async () => {
      await repository.load([root]);
      return work;
    });
  }, benchmarkOptions);

  bench('single-append', async () => {
    await dataReady;
    const { repository, work } = createRepository();
    await repository.load([root]);
    reset(work);
    await fs.appendFile(firstFile, `${tokenRecord(recordsPerFile + 2)}\n`);
    await measure('single-append', { full: 0, append: 1 }, async () => {
      await repository.load([root]);
      return work;
    });
  }, benchmarkOptions);

  bench('replacement', async () => {
    await dataReady;
    const { repository, work } = createRepository();
    await repository.load([root]);
    reset(work);
    const replacement = `${firstFile}.replacement`;
    await fs.writeFile(replacement, firstFileContents);
    await fs.rename(replacement, firstFile);
    await measure('replacement', { full: 1, append: 0 }, async () => {
      await repository.load([root]);
      return work;
    });
  }, benchmarkOptions);
});
