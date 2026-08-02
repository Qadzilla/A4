// ─── A4 · Fork-and-diff ────────────────────────────────────────────
// The mechanic that makes "I don't know" a priced situation instead of a
// dead end. An unknown fact is evaluated both ways; the difference in
// dollars is what knowing is worth, and the ranked list of those prices is
// the intake's question order.
//
// Fences, from the contract: a fork never resolves an unknown — pricing is
// not deciding. No probability weighting; both branches are shown and
// neither is "likely". Single-fact forks only in v1: every other unknown
// stays exactly as it is in both branches, and the UI says so.

import { type YearEvaluation, evaluateYear } from './evaluation';
import {
  FACT_REGISTRY,
  type FactAssertion,
  type FactId,
  type KnownFactValue,
  factSet,
  factState,
  makeAssertion,
} from './facts';

/**
 * Representative points for numeric unknowns, chosen to straddle the rule
 * boundary the fact feeds — the reason each pair is what it is lives here,
 * because "engine-chosen" must mean chosen for a reason.
 */
const REPRESENTATIVE_POINTS: Partial<Record<FactId, { values: KnownFactValue[]; why: string }>> = {
  'self-support-share-pct': {
    values: [
      { kind: 'number', value: 25 },
      { kind: 'number', value: 75 },
    ],
    why: 'Either side of the more-than-half line the support test turns on.',
  },
  'full-time-student-months': {
    values: [
      { kind: 'number', value: 4 },
      { kind: 'number', value: 9 },
    ],
    why: 'Either side of the five-month line that makes a student for the year.',
  },
  'lived-with-parents-months': {
    values: [
      { kind: 'number', value: 3 },
      { kind: 'number', value: 12 },
    ],
    why: 'Either side of the more-than-half-year residency line.',
  },
  'gross-income': {
    values: [
      { kind: 'number', value: 4000 },
      { kind: 'number', value: 8000 },
    ],
    why: 'Either side of the qualifying-relative income limit.',
  },
};

export interface ForkBranch {
  assumed: KnownFactValue;
  /** Present when the assumed value is a representative point, not a fact. */
  assumedNote: string | null;
  evaluation: YearEvaluation;
}

export type ForkResult =
  | {
      ok: true;
      at: FactId;
      branches: ForkBranch[];
      /** |liability difference| across branches whose liability computed. */
      delta: number;
      /** Blocked items present in some branches but not others — a branch
       *  that can't compute is a consequence, not a zero. */
      blockedDiffers: BlockedDiff[];
      /** Derived facts that flip between branches, for honest narration. */
      alsoChanges: FactId[];
      /** Single-fact fork: everything else held exactly as asserted. */
      heldConstant: string;
    }
  | { ok: false; at: FactId; reason: 'not-unknown' | 'contradicted' | 'no-representative-points' };

export interface BlockedDiff {
  item: string;
  inBranches: number[];
}

function candidatesFor(at: FactId): { values: KnownFactValue[]; note: string | null } | null {
  const entry = FACT_REGISTRY[at];
  if (entry.kind === 'bool') {
    return {
      values: [
        { kind: 'bool', value: true },
        { kind: 'bool', value: false },
      ],
      note: null,
    };
  }
  const points = REPRESENTATIVE_POINTS[at];
  if (points) {
    return { values: points.values, note: `Representative value — ${points.why}` };
  }
  return null;
}

export function fork(assertions: FactAssertion[], taxYear: number, at: FactId): ForkResult {
  const state = factState(factSet(assertions, taxYear), at);
  if (state.status === 'contradicted') return { ok: false, at, reason: 'contradicted' };
  if (state.status === 'known') return { ok: false, at, reason: 'not-unknown' };

  const candidates = candidatesFor(at);
  if (candidates === null) return { ok: false, at, reason: 'no-representative-points' };

  const branches: ForkBranch[] = candidates.values.map((assumed, i) => {
    const hypothetical = makeAssertion({
      assertionId: `fork:${at}:${i}`,
      factId: at,
      taxYear,
      value: assumed,
      // A rule source, so even derived facts can be forked; the ruleId makes
      // the hypothesis visible in any trace that ever sees it.
      source: { kind: 'rule', ruleId: 'fork/hypothetical', consumed: [] },
      assertedAt: '9999-12-31T00:00:00Z',
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);
    return {
      assumed,
      assumedNote: candidates.note,
      evaluation: evaluateYear([...assertions, hypothetical], taxYear),
    };
  });

  const liabilities = branches
    .map((b) => b.evaluation.liability?.totalTax)
    .filter((v): v is number => v !== undefined && v !== null);
  const delta = liabilities.length >= 2 ? Math.max(...liabilities) - Math.min(...liabilities) : 0;

  const blockedDiffers: BlockedDiff[] = [];
  const allBlocked = new Set(branches.flatMap((b) => b.evaluation.blocked));
  for (const item of allBlocked) {
    const inBranches = branches
      .map((b, i) => (b.evaluation.blocked.includes(item as never) ? i : -1))
      .filter((i) => i >= 0);
    if (inBranches.length < branches.length) blockedDiffers.push({ item, inBranches });
  }

  const alsoChanges: FactId[] = [];
  const claims = new Set(branches.map((b) => b.evaluation.dependency.canBeClaimed));
  if (claims.size > 1) alsoChanges.push('can-be-claimed');
  const statuses = new Set(branches.map((b) => b.evaluation.filingStatus.status));
  if (statuses.size > 1) alsoChanges.push('filing-status');

  return {
    ok: true,
    at,
    branches,
    delta: Math.round(delta),
    blockedDiffers,
    alsoChanges,
    heldConstant: 'Single-fact fork: every other unknown stays exactly as it is in both branches.',
  };
}

export interface RankedUnknown {
  at: FactId;
  delta: number;
  /** A branch computes something the other cannot — worth more than $0 says. */
  blockedDiffers: boolean;
  priceable: boolean;
}

/**
 * Every unresolved fact the determinations actually wanted, priced and
 * sorted — the intake's question order. Deterministic: delta descending,
 * then blocked-difference, then fact id.
 */
export function rankUnknowns(assertions: FactAssertion[], taxYear: number): RankedUnknown[] {
  const set = factSet(assertions, taxYear);
  const evaluation = evaluateYear(assertions, taxYear);

  const candidates = new Set<FactId>();
  for (const id of evaluation.dependency.missingFacts) candidates.add(id);
  for (const id of evaluation.filingStatus.missingFacts) candidates.add(id);
  for (const [id, state] of set.byId) {
    if (state.status === 'unknown') candidates.add(id);
  }

  const ranked: RankedUnknown[] = [...candidates].map((at) => {
    const result = fork(assertions, taxYear, at);
    if (!result.ok) return { at, delta: 0, blockedDiffers: false, priceable: false };
    return {
      at,
      delta: result.delta,
      blockedDiffers: result.blockedDiffers.length > 0,
      priceable: true,
    };
  });

  ranked.sort(
    (a, b) =>
      b.delta - a.delta ||
      Number(b.blockedDiffers) - Number(a.blockedDiffers) ||
      a.at.localeCompare(b.at),
  );
  return ranked;
}
