// ─── C4 · Education & health documents become facts ────────────────
// Three documents: the one behind the demographic's biggest credit
// (1098-T), its quietest deduction (1098-E), and its only refund-freezing
// blocker (1095-A). The planner asserts what is printed, and derives
// exactly one thing: the taxable-scholarship trap.
//
// The rules, from BASIS_FILING.md C4:
//  - Box 1 and box 5 assert separately, and the engine derives the
//    comparison: scholarships above tuition are income, and no one will
//    have told them. Derived as a rule-sourced fact consuming both, so the
//    provenance chain is walkable and D1's election can supersede it later.
//  - Schools report inconsistently: a legacy box-2 school asserts
//    tuition-billed-legacy verbatim, and NO derivation happens — amounts
//    billed are not amounts paid, and D1 owns the interpretation.
//  - QTRE aggregates per student, not per school — a transfer year's two
//    1098-Ts sum.
//  - The 1095-A's monthly table stays in the stored payload with full
//    fidelity (printed zeros distinct from blanks) — D3 reconciles
//    month-wise, never from sums, so no sum is asserted at all.
//  - No credit math, no reconciliation math. Extraction and the one
//    derivation only.

import type { FactAssertion, FactId } from '../lib/calc/filing/facts';
import { makeAssertion } from '../lib/calc/filing/facts';

export type EducationHealthKind = '1098-T' | '1098-E' | '1095-A';

export interface Extracted1095AMonth {
  /** 1–12. Only months the form actually lists. */
  month: number;
  premium: number | null;
  slcsp: number | null;
  aptc: number | null;
}

export interface ExtractedEducationHealthForm {
  kind: EducationHealthKind;
  issuerName: string | null;
  issuerTin: string | null;
  corrected: boolean;
  taxYear: number;
  t1098: {
    box1: number | null; // payments received for qualified tuition
    box2: number | null; // the retired amounts-billed box some schools still print
    box5: number | null; // scholarships or grants
    box8HalfTime: boolean | null;
    box9Graduate: boolean | null;
  } | null;
  e1098: { box1: number | null } | null;
  a1095: { months: Extracted1095AMonth[] } | null;
}

export interface StoredEducationHealthRow {
  fileId: string;
  kind: EducationHealthKind;
  issuerTin: string | null;
  corrected: boolean;
  createdAt: number;
  extracted: ExtractedEducationHealthForm;
}

export const TAXABLE_SCHOLARSHIP_RULE = 'c4/taxable-scholarship';

/**
 * Fact ids this planner may write. The three shared bools corroborate the
 * person's own answers; the delete cascade wipes only the document- and
 * c4-rule-sourced sides, so a person's answers survive a deleted form.
 */
export const EDU_HEALTH_FACT_IDS: FactId[] = [
  'qualified-tuition-paid',
  'tuition-billed-legacy',
  'scholarships-received',
  'taxable-scholarship-income',
  'student-loan-interest-paid',
  'paid-tuition',
  'paid-student-loan-interest',
  'marketplace-health-insurance',
];

/** Corrected forms retire predecessors by (kind, issuer TIN, year). */
export function liveEducationHealthRows(
  rows: StoredEducationHealthRow[],
): StoredEducationHealthRow[] {
  const byKey = new Map<string, StoredEducationHealthRow[]>();
  const noTin: StoredEducationHealthRow[] = [];
  for (const row of rows) {
    if (row.issuerTin === null || row.issuerTin.trim() === '') {
      noTin.push(row);
      continue;
    }
    const key = `${row.kind}:${row.issuerTin.trim()}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  const live: StoredEducationHealthRow[] = [...noTin];
  for (const group of byKey.values()) {
    const corrected = group.filter((r) => r.corrected).sort((a, b) => b.createdAt - a.createdAt);
    if (corrected.length > 0) live.push(corrected[0] as StoredEducationHealthRow);
    else live.push(...group);
  }
  return live.sort((a, b) => a.createdAt - b.createdAt);
}

export interface EducationHealthPlanInput {
  live: StoredEducationHealthRow[];
  /** Live document- or c4-rule-sourced assertions of this planner's facts. */
  prevLive: FactAssertion[];
  taxYear: number;
  triggeringFileId: string;
  nowIso: string;
}

export function planEducationHealthFacts(input: EducationHealthPlanInput): FactAssertion[] {
  const { live, prevLive, taxYear, triggeringFileId, nowIso } = input;
  const out: FactAssertion[] = [];
  const prevByFact = new Map(prevLive.map((a) => [a.factId, a]));

  if (live.length === 0) return out;

  const doc = (
    factId: FactId,
    value: { kind: 'number'; value: number } | { kind: 'bool'; value: boolean },
    field: string,
  ) => {
    out.push(
      makeAssertion({
        assertionId: `eduhealth:${factId}:${triggeringFileId}:${nowIso}`,
        factId,
        taxYear,
        value,
        source: { kind: 'document', fileId: triggeringFileId, field },
        assertedAt: nowIso,
        supersedes: prevByFact.get(factId)?.assertionId ?? null,
      } as Parameters<typeof makeAssertion>[0]),
    );
  };

  const sum = (
    kind: EducationHealthKind,
    pick: (f: ExtractedEducationHealthForm) => number | null,
  ) => {
    let total = 0;
    let seen = 0;
    for (const row of live) {
      if (row.kind !== kind) continue;
      const v = pick(row.extracted);
      if (v !== null) {
        total += v;
        seen += 1;
      }
    }
    return { total, seen };
  };

  // ── 1098-T: paid and scholarship totals, per student across schools ──
  const tCount = live.filter((r) => r.kind === '1098-T').length;
  const tSuffix = tCount > 1 ? ` (total across ${tCount} schools)` : '';
  const paid = sum('1098-T', (f) => f.t1098?.box1 ?? null);
  const billed = sum('1098-T', (f) => f.t1098?.box2 ?? null);
  const scholarships = sum('1098-T', (f) => f.t1098?.box5 ?? null);

  if (paid.seen > 0) {
    doc('qualified-tuition-paid', { kind: 'number', value: paid.total }, `1098-T box 1${tSuffix}`);
    doc('paid-tuition', { kind: 'bool', value: true }, '1098-T on file');
  }
  if (billed.seen > 0) {
    doc(
      'tuition-billed-legacy',
      { kind: 'number', value: billed.total },
      `1098-T box 2${tSuffix} — amounts billed, not amounts paid; the retired box some schools still print`,
    );
  }
  if (scholarships.seen > 0) {
    doc(
      'scholarships-received',
      { kind: 'number', value: scholarships.total },
      `1098-T box 5${tSuffix}`,
    );
  }

  // ── The trap, derived: scholarships above tuition PAID are income ──
  // Only when both sides are printed. A legacy billed-only school never
  // derives — billed is not paid, and D1 owns that interpretation.
  if (paid.seen > 0 && scholarships.seen > 0) {
    const excess = Math.max(0, scholarships.total - paid.total);
    out.push(
      makeAssertion({
        assertionId: `eduhealth:taxable-scholarship-income:${triggeringFileId}:${nowIso}`,
        factId: 'taxable-scholarship-income',
        taxYear,
        value: { kind: 'number', value: excess },
        source: {
          kind: 'rule',
          ruleId: TAXABLE_SCHOLARSHIP_RULE,
          consumed: ['scholarships-received', 'qualified-tuition-paid'],
        },
        assertedAt: nowIso,
        supersedes: prevByFact.get('taxable-scholarship-income')?.assertionId ?? null,
      } as Parameters<typeof makeAssertion>[0]),
    );
  }

  // ── 1098-E: the quiet deduction ──
  const eCount = live.filter((r) => r.kind === '1098-E').length;
  const interest = sum('1098-E', (f) => f.e1098?.box1 ?? null);
  if (interest.seen > 0) {
    doc(
      'student-loan-interest-paid',
      { kind: 'number', value: interest.total },
      `1098-E box 1${eCount > 1 ? ` (total across ${eCount} servicers)` : ''}`,
    );
    doc('paid-student-loan-interest', { kind: 'bool', value: true }, '1098-E on file');
  }

  // ── 1095-A: the blocker's document. The monthly table stays in the
  // stored payload for D3; the fact layer only corroborates coverage. ──
  if (live.some((r) => r.kind === '1095-A')) {
    doc(
      'marketplace-health-insurance',
      { kind: 'bool', value: true },
      '1095-A on file — Form 8962 reconciles it month by month before any refund moves',
    );
  }

  return out;
}
