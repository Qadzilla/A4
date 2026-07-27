import { and, asc, eq, lte } from 'drizzle-orm';
import { type DB, db as sharedDb } from '../db';
import { jobs } from '../db/schema';

export type JobHandler = (payload: unknown, db: DB) => Promise<void>;

/** Well-known job types — defined here so producers don't import handler modules. */
export const JOB_TYPES = {
  extractEntities: 'extract-entities',
  resolveEntities: 'resolve-entities',
  linkStructured: 'link-structured',
  embedPages: 'embed-pages',
} as const;

export type ProcessOutcome = 'idle' | 'done' | 'retried' | 'failed';

/** Backoff before retry N (1-based): 2s, 4s, 8s, ... */
function backoffMs(attempts: number): number {
  return 2 ** attempts * 1000;
}

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

/** Test helper — resets the handler registry between test cases. */
export function clearJobHandlers(): void {
  handlers.clear();
}

export async function enqueueJob(
  type: string,
  payload: unknown,
  options?: { db?: DB; maxAttempts?: number; runAfter?: Date },
): Promise<string> {
  const db = options?.db ?? sharedDb;
  const id = crypto.randomUUID();
  await db.insert(jobs).values({
    id,
    type,
    payload: JSON.stringify(payload ?? {}),
    ...(options?.maxAttempts !== undefined && { maxAttempts: options.maxAttempts }),
    ...(options?.runAfter !== undefined && { runAfter: options.runAfter }),
  });
  return id;
}

/**
 * Claims and runs the oldest runnable pending job. Claim is a conditional
 * status-transition UPDATE (pending → running), so a concurrent claimer
 * loses cleanly. Failures retry with exponential backoff until maxAttempts,
 * then the job is marked failed with its last error preserved.
 *
 * `now` is injectable for tests. Returns what happened so callers (worker
 * loop, tests) can decide whether to keep draining.
 */
export async function processNextJob(db: DB = sharedDb, now = new Date()): Promise<ProcessOutcome> {
  const candidates = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, 'pending'), lte(jobs.runAfter, now)))
    .orderBy(asc(jobs.createdAt))
    .limit(1);

  const job = candidates[0];
  if (!job) return 'idle';

  const claimed = await db
    .update(jobs)
    .set({ status: 'running', attempts: job.attempts + 1, updatedAt: now })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, 'pending')));
  if (claimed.changes === 0) return 'idle'; // lost the claim race

  const attempts = job.attempts + 1;

  const fail = async (message: string): Promise<ProcessOutcome> => {
    if (attempts >= job.maxAttempts) {
      await db
        .update(jobs)
        .set({ status: 'failed', lastError: message, updatedAt: now })
        .where(eq(jobs.id, job.id));
      return 'failed';
    }
    await db
      .update(jobs)
      .set({
        status: 'pending',
        lastError: message,
        runAfter: new Date(now.getTime() + backoffMs(attempts)),
        updatedAt: now,
      })
      .where(eq(jobs.id, job.id));
    return 'retried';
  };

  const handler = handlers.get(job.type);
  if (!handler) {
    // No registered handler is a permanent condition — don't burn retries
    await db
      .update(jobs)
      .set({
        status: 'failed',
        lastError: `No handler registered for job type "${job.type}"`,
        updatedAt: now,
      })
      .where(eq(jobs.id, job.id));
    return 'failed';
  }

  let payload: unknown;
  try {
    payload = JSON.parse(job.payload);
  } catch {
    await db
      .update(jobs)
      .set({ status: 'failed', lastError: 'Invalid JSON payload', updatedAt: now })
      .where(eq(jobs.id, job.id));
    return 'failed';
  }

  try {
    await handler(payload, db);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }

  await db.update(jobs).set({ status: 'done', updatedAt: now }).where(eq(jobs.id, job.id));
  return 'done';
}

let workerTimer: NodeJS.Timeout | null = null;
let draining = false;

/**
 * Starts the polling worker: every `intervalMs`, drains the queue serially
 * until idle. Ticks never overlap. Call from server boot only (not in tests —
 * tests drive processNextJob directly).
 */
export function startJobWorker(intervalMs = 2000): void {
  if (workerTimer) return;
  workerTimer = setInterval(async () => {
    if (draining) return;
    draining = true;
    try {
      while ((await processNextJob()) !== 'idle') {
        // keep draining
      }
    } catch (err) {
      console.error('[job-queue] worker tick failed:', err);
    } finally {
      draining = false;
    }
  }, intervalMs);
  workerTimer.unref();
}

export function stopJobWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
