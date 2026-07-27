import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { jobs } from '../db/schema';
import {
  clearJobHandlers,
  enqueueJob,
  processNextJob,
  registerJobHandler,
} from '../services/job-queue';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      last_error TEXT,
      run_after INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

async function getJob(db: TestDb, id: string) {
  const rows = await db.select().from(jobs).where(eq(jobs.id, id));
  return rows[0]!;
}

describe('job queue', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
    clearJobHandlers();
  });

  it('enqueues and processes a job through its handler', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerJobHandler('test-job', handler);

    const id = await enqueueJob('test-job', { fileId: 'f1' }, { db });
    const outcome = await processNextJob(db);

    expect(outcome).toBe('done');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ fileId: 'f1' }, db);

    const job = await getJob(db, id);
    expect(job.status).toBe('done');
    expect(job.attempts).toBe(1);
    expect(job.lastError).toBeNull();
  });

  it('returns idle when no jobs are runnable', async () => {
    expect(await processNextJob(db)).toBe('idle');
  });

  it('retries a failing job with backoff and increments attempts', async () => {
    registerJobHandler('flaky', vi.fn().mockRejectedValue(new Error('transient failure')));

    const id = await enqueueJob('flaky', {}, { db, runAfter: new Date(0) });
    const now = new Date('2026-07-27T12:00:00Z');
    const outcome = await processNextJob(db, now);

    expect(outcome).toBe('retried');
    const job = await getJob(db, id);
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(1);
    expect(job.lastError).toBe('transient failure');
    // First retry backs off 2^1 = 2 seconds
    expect(job.runAfter.getTime()).toBe(now.getTime() + 2000);
  });

  it('does not run jobs whose runAfter is in the future', async () => {
    registerJobHandler('flaky', vi.fn().mockRejectedValue(new Error('boom')));
    await enqueueJob('flaky', {}, { db, runAfter: new Date(0) });

    const now = new Date('2026-07-27T12:00:00Z');
    expect(await processNextJob(db, now)).toBe('retried');

    // Backoff window not yet elapsed
    expect(await processNextJob(db, new Date(now.getTime() + 1000))).toBe('idle');
    // Window elapsed — job runs again
    expect(await processNextJob(db, new Date(now.getTime() + 2000))).toBe('retried');
  });

  it('marks a job failed after maxAttempts and records lastError', async () => {
    registerJobHandler('doomed', vi.fn().mockRejectedValue(new Error('permanent failure')));

    const id = await enqueueJob('doomed', {}, { db, maxAttempts: 2, runAfter: new Date(0) });
    const t0 = new Date('2026-07-27T12:00:00Z');

    expect(await processNextJob(db, t0)).toBe('retried');
    expect(await processNextJob(db, new Date(t0.getTime() + 60_000))).toBe('failed');

    const job = await getJob(db, id);
    expect(job.status).toBe('failed');
    expect(job.attempts).toBe(2);
    expect(job.lastError).toBe('permanent failure');

    // Failed jobs never run again
    expect(await processNextJob(db, new Date(t0.getTime() + 120_000))).toBe('idle');
  });

  it('processes jobs oldest-first', async () => {
    const order: string[] = [];
    registerJobHandler('ordered', async (payload) => {
      order.push((payload as { n: string }).n);
    });

    // Explicit createdAt via direct insert to guarantee distinct timestamps
    await db.insert(jobs).values([
      {
        id: 'j-second',
        type: 'ordered',
        payload: JSON.stringify({ n: 'second' }),
        runAfter: new Date(0),
        createdAt: new Date('2026-07-27T12:00:01Z'),
        updatedAt: new Date(),
      },
      {
        id: 'j-first',
        type: 'ordered',
        payload: JSON.stringify({ n: 'first' }),
        runAfter: new Date(0),
        createdAt: new Date('2026-07-27T12:00:00Z'),
        updatedAt: new Date(),
      },
    ]);

    await processNextJob(db);
    await processNextJob(db);
    expect(order).toEqual(['first', 'second']);
  });

  it('marks unknown job types failed immediately without burning retries', async () => {
    const id = await enqueueJob('no-such-type', {}, { db });
    const outcome = await processNextJob(db);

    expect(outcome).toBe('failed');
    const job = await getJob(db, id);
    expect(job.status).toBe('failed');
    expect(job.lastError).toContain('No handler registered');
  });

  it('marks jobs with invalid JSON payloads failed', async () => {
    registerJobHandler('bad-payload', vi.fn());
    await db.insert(jobs).values({
      id: 'j-bad',
      type: 'bad-payload',
      payload: '{not json',
      runAfter: new Date(0),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(await processNextJob(db)).toBe('failed');
    const job = await getJob(db, 'j-bad');
    expect(job.lastError).toBe('Invalid JSON payload');
  });

  it('does not pick up running or done jobs', async () => {
    registerJobHandler('once', vi.fn().mockResolvedValue(undefined));
    await enqueueJob('once', {}, { db });

    expect(await processNextJob(db)).toBe('done');
    expect(await processNextJob(db)).toBe('idle');
  });

  it('honors a scheduled runAfter on enqueue', async () => {
    registerJobHandler('scheduled', vi.fn().mockResolvedValue(undefined));
    const future = new Date('2026-07-28T00:00:00Z');
    await enqueueJob('scheduled', {}, { db, runAfter: future });

    expect(await processNextJob(db, new Date('2026-07-27T12:00:00Z'))).toBe('idle');
    expect(await processNextJob(db, future)).toBe('done');
  });
});
