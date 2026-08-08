import { z } from 'zod';
import { factSet } from '../../lib/calc/filing/facts';
import { type IntakePlan, intakeFindings, intakePlan } from '../../lib/calc/filing/intake';
import { amendmentFor } from '../../services/amendment';
import { extensionFor } from '../../services/extension';
import { assertFact, loadFacts } from '../../services/facts';
import { absenceBoardFor, readinessFor } from '../../services/filing-year';
import { listSnapshots, manifestFor, markFiled, snapshotManifest } from '../../services/manifest';
import { protectedProcedure, router } from '../trpc';

/**
 * G1 — the intake, over the wire.
 *
 * Everything here is a thin shell: the ordering, the gates, the pricing
 * and the findings all live in `lib/calc/filing/intake.ts`, which is pure
 * and tested without a database in sight. This file's only jobs are to
 * fetch the year's assertions, hand them to that module, and write new
 * ones back.
 *
 * `answer` returns the findings by construction — it builds the plan
 * before the write and again after, and diffs them. That is what makes
 * the surface a finding-machine rather than a form: the moment an answer
 * opens a question worth $2,500, the response already says so.
 */

const valueSchema = z.union([
  z.object({ kind: z.literal('bool'), value: z.boolean() }),
  z.object({ kind: z.literal('number'), value: z.number() }),
  z.object({ kind: z.literal('string'), value: z.string().min(1) }),
  z.object({
    kind: z.literal('date'),
    value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  // Skip. An assertion, not an absence — "we asked, they didn't know" is
  // a different state from "never asked", and the whole engine can tell.
  z.object({ kind: z.literal('unknown') }),
]);

const desk = z.object({
  workspaceId: z.string().uuid(),
  taxYear: z.number().int().min(2000).max(2100),
});

export const filingRouter = router({
  /** The whole intake for a year: sections, order, status, prices. */
  intake: protectedProcedure.input(desk).query(async ({ ctx, input }) => {
    const keys = { userId: ctx.userId, workspaceId: input.workspaceId };
    const assertions = await loadFacts(ctx.db, keys);
    return intakePlan(assertions, input.taxYear, factSet(assertions, input.taxYear));
  }),

  /**
   * Answer one question — or skip it. Both are assertions; the difference
   * is the value kind, and the difference is load-bearing downstream.
   */
  answer: protectedProcedure
    .input(desk.extend({ factId: z.string().min(1), value: valueSchema }))
    .mutation(async ({ ctx, input }) => {
      const keys = { userId: ctx.userId, workspaceId: input.workspaceId };

      const before = await loadFacts(ctx.db, keys);
      const beforePlan: IntakePlan = intakePlan(
        before,
        input.taxYear,
        factSet(before, input.taxYear),
      );

      const written = await assertFact(ctx.db, keys, {
        factId: input.factId,
        taxYear: input.taxYear,
        value: input.value,
        source: { kind: 'person', conversationId: null },
      });
      // The rejection teaches — an unknown id comes back with the nearest
      // registry entries rather than a bare 400.
      if (!written.ok) return { ok: false as const, problem: written.problem };

      const after = await loadFacts(ctx.db, keys);
      const afterPlan = intakePlan(after, input.taxYear, factSet(after, input.taxYear));

      return {
        ok: true as const,
        assertionId: written.assertion.assertionId,
        superseded: written.assertion.supersedes,
        plan: afterPlan,
        findings: intakeFindings(beforePlan, afterPlan),
      };
    }),

  /**
   * Where the year stands — A6's verdict verbatim. Progress in this
   * product is a readiness verdict and never a percentage of questions
   * answered, because half the questions do not apply to any one person.
   */
  readiness: protectedProcedure.input(desk).query(async ({ ctx, input }) => {
    const keys = { userId: ctx.userId, workspaceId: input.workspaceId };
    // Through filing-year, so expectations are assessed against the
    // documents that actually arrived. G1 shipped this with an empty
    // document list, which told anyone who had just uploaded their W-2
    // that it was overdue and missing.
    return readinessFor(ctx.db, keys, input.taxYear);
  }),

  /**
   * G4 — what the year should produce, and what hasn't shown up.
   * Distinct from readiness: the verdict says whether the year can be
   * finished, the board says what is being waited on and why.
   */
  board: protectedProcedure.input(desk).query(async ({ ctx, input }) => {
    const keys = { userId: ctx.userId, workspaceId: input.workspaceId };
    return absenceBoardFor(ctx.db, keys, input.taxYear);
  }),

  /**
   * H1 — the deliverable: every line the year concluded, where each
   * number came from, and everything still open. Recomputed on read.
   */
  manifest: protectedProcedure.input(desk).query(async ({ ctx, input }) => {
    const keys = { userId: ctx.userId, workspaceId: input.workspaceId };
    return manifestFor(ctx.db, keys, input.taxYear);
  }),

  /** Freeze the year as it stands. Immutable from this moment on. */
  snapshot: protectedProcedure
    .input(desk.extend({ label: z.string().max(120).nullable().default(null) }))
    .mutation(async ({ ctx, input }) => {
      const keys = { userId: ctx.userId, workspaceId: input.workspaceId };
      return snapshotManifest(ctx.db, keys, input.taxYear, input.label);
    }),

  snapshots: protectedProcedure.input(desk).query(async ({ ctx, input }) => {
    const keys = { userId: ctx.userId, workspaceId: input.workspaceId };
    return listSnapshots(ctx.db, keys, input.taxYear);
  }),

  /** Record that a snapshot was filed. Accepted once, never rewritten. */
  markFiled: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        snapshotId: z.string().min(1),
        filedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const keys = { userId: ctx.userId, workspaceId: input.workspaceId };
      return markFiled(ctx.db, keys, input.snapshotId, input.filedAt);
    }),

  /**
   * H2 — the amendment worksheet, when a snapshotted year has moved
   * since. Null when there is no snapshot to measure against.
   */
  amendment: protectedProcedure.input(desk).query(async ({ ctx, input }) => {
    const keys = { userId: ctx.userId, workspaceId: input.workspaceId };
    return amendmentFor(ctx.db, keys, input.taxYear);
  }),

  /**
   * H3 — the extension option, and the payment that should ride with
   * it. Surfaces only before the deadline, and only when the year is
   * not ready.
   */
  extension: protectedProcedure.input(desk).query(async ({ ctx, input }) => {
    const keys = { userId: ctx.userId, workspaceId: input.workspaceId };
    return extensionFor(ctx.db, keys, input.taxYear);
  }),

  /**
   * Everything ever asserted about one fact, newest first — what the
   * supersession flow shows when an answer contradicts a document.
   */
  history: protectedProcedure
    .input(desk.extend({ factId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const keys = { userId: ctx.userId, workspaceId: input.workspaceId };
      const assertions = await loadFacts(ctx.db, keys);
      const superseded = new Set(
        assertions.map((a) => a.supersedes).filter((v): v is string => v !== null),
      );
      return assertions
        .filter((a) => a.factId === input.factId)
        .sort((a, b) => b.assertedAt.localeCompare(a.assertedAt))
        .map((a) => ({ ...a, live: !superseded.has(a.assertionId) }));
    }),
});
