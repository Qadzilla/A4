// ─── C5 · Retirement, benefits & winnings become facts ─────────────
// The three documents that ambush this audience: the job-change 401(k)
// cashout, taxable unemployment, and gambling wins that are taxable even
// when the year was a net loss. The 1099-R's box 7 code drives everything:
// a G is not income at all (the pleasant finding), a 1 is D6's penalty
// question, and an unreadable code stays honestly unclassified for the
// fork to price.
//
// The rules, from BASIS_FILING.md C5:
//  - Code classification is a table, not a vibe: G/H rollover, J/T/Q Roth
//    (ordering rules a named scope gap), 1 early, 2/3/4/7 regular,
//    anything else unclassified.
//  - The cruel case: a direct rollover WITH withholding is a partial-
//    rollover trap — money left the retirement system on the way — and the
//    provenance says so where a preparer will read it.
//  - Unemployment has no no-form path: states always issue the 1099-G, so
//    the form replaces an estimate in either direction, delta surfaced.
//  - Winnings follow the floor rule: W-2Gs only exist above per-game
//    thresholds, so a person's higher total stands — and losses are a
//    separate person-asserted fact that nothing here nets, because they
//    only ever count against wins by itemizing (D-phase's asymmetry).
//  - A state refund asserts raw; whether it is taxable is the evaluation's
//    gate on last year's itemizing, not a number invented here.
//  - No penalty math (D6). No Roth ordering (named).

import type { FactAssertion, FactId } from '../lib/calc/filing/facts';
import { makeAssertion } from '../lib/calc/filing/facts';

export type BenefitFormKind = '1099-R' | '1099-G' | 'W-2G';

export interface ExtractedBenefitForm {
  kind: BenefitFormKind;
  payerName: string | null;
  payerTin: string | null;
  corrected: boolean;
  taxYear: number;
  r1099: {
    box1: number | null; // gross distribution
    box2a: number | null; // taxable amount, as printed — never derived
    box2bNotDetermined: boolean | null; // "taxable amount not determined"
    box4: number | null; // federal income tax withheld
    box7Codes: string | null; // distribution code(s), e.g. "1", "G", "1B"
    iraSepSimple: boolean | null;
  } | null;
  g1099: {
    box1: number | null; // unemployment compensation
    box2: number | null; // state or local income tax refund
    box4: number | null; // federal income tax withheld
    state: string | null;
  } | null;
  w2g: {
    box1: number | null; // reportable winnings
    box4: number | null; // federal income tax withheld
  } | null;
}

export interface StoredBenefitFormRow {
  fileId: string;
  kind: BenefitFormKind;
  payerTin: string | null;
  corrected: boolean;
  createdAt: number;
  extracted: ExtractedBenefitForm;
}

export const BENEFIT_FACT_IDS: FactId[] = [
  'retirement-distribution',
  'retirement-distribution-taxable',
  'retirement-early-distribution',
  'retirement-rollover',
  'retirement-roth-distribution',
  'retirement-distribution-unclassified',
  'retirement-federal-withheld',
  'unemployment-income',
  'state-refund-received',
  'gambling-winnings',
];

/**
 * The box 7 table. Priority matters: a combined code containing G is a
 * direct rollover whatever else rides along; Roth codes outrank the early
 * code because the ordering rules differ and are a named gap.
 */
export type DistributionBucket = 'rollover' | 'roth' | 'early' | 'regular' | 'unclassified';

export function classifyBox7(codes: string | null): DistributionBucket {
  if (codes === null || codes.trim() === '') return 'unclassified';
  const set = new Set(
    codes
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      .split(''),
  );
  if (set.has('G') || set.has('H')) return 'rollover';
  if (set.has('J') || set.has('T') || set.has('Q')) return 'roth';
  if (set.has('1')) return 'early';
  if (set.has('2') || set.has('3') || set.has('4') || set.has('7')) return 'regular';
  return 'unclassified';
}

/** Corrected forms retire predecessors by (kind, payer TIN, year). */
export function liveBenefitFormRows(rows: StoredBenefitFormRow[]): StoredBenefitFormRow[] {
  const byKey = new Map<string, StoredBenefitFormRow[]>();
  const noTin: StoredBenefitFormRow[] = [];
  for (const row of rows) {
    if (row.payerTin === null || row.payerTin.trim() === '') {
      noTin.push(row);
      continue;
    }
    const key = `${row.kind}:${row.payerTin.trim()}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  const live: StoredBenefitFormRow[] = [...noTin];
  for (const group of byKey.values()) {
    const corrected = group.filter((r) => r.corrected).sort((a, b) => b.createdAt - a.createdAt);
    if (corrected.length > 0) live.push(corrected[0] as StoredBenefitFormRow);
    else live.push(...group);
  }
  return live.sort((a, b) => a.createdAt - b.createdAt);
}

export interface BenefitFactPlanInput {
  live: StoredBenefitFormRow[];
  /** Live DOCUMENT-sourced assertions of this planner's facts. */
  prevLive: FactAssertion[];
  /** Live PERSON-sourced estimates of the shared facts. */
  personLive: FactAssertion[];
  taxYear: number;
  triggeringFileId: string;
  nowIso: string;
}

const numberOf = (a: FactAssertion | undefined): number | null =>
  a !== undefined && a.value.kind === 'number' ? a.value.value : null;

export function planBenefitFacts(input: BenefitFactPlanInput): FactAssertion[] {
  const { live, prevLive, personLive, taxYear, triggeringFileId, nowIso } = input;
  const out: FactAssertion[] = [];
  const prevByFact = new Map(prevLive.map((a) => [a.factId, a]));
  const personByFact = new Map(personLive.map((a) => [a.factId, a]));

  if (live.length === 0) return out;

  const doc = (factId: FactId, value: number, field: string, supersedes?: string | null) => {
    out.push(
      makeAssertion({
        assertionId: `benefit:${factId}:${triggeringFileId}:${nowIso}`,
        factId,
        taxYear,
        value: { kind: 'number', value },
        source: { kind: 'document', fileId: triggeringFileId, field },
        assertedAt: nowIso,
        supersedes:
          supersedes !== undefined ? supersedes : (prevByFact.get(factId)?.assertionId ?? null),
      } as Parameters<typeof makeAssertion>[0]),
    );
  };

  // ── 1099-R: the code table decides what each dollar is ──
  const rRows = live.filter((r) => r.kind === '1099-R');
  if (rRows.length > 0) {
    const buckets: Record<DistributionBucket, number> = {
      rollover: 0,
      roth: 0,
      early: 0,
      regular: 0,
      unclassified: 0,
    };
    let gross = 0;
    let grossSeen = false;
    let taxable = 0;
    let taxableSeen = false;
    let withheld = 0;
    let withheldSeen = false;
    let rolloverWithWithholding = 0;

    for (const row of rRows) {
      const r = row.extracted.r1099;
      if (!r) continue;
      const bucket = classifyBox7(r.box7Codes);
      if (r.box1 !== null) {
        buckets[bucket] += r.box1;
        // A rollover is not income and stays out of the gross-distribution
        // figure the estimator would ever touch.
        if (bucket !== 'rollover') {
          gross += r.box1;
          grossSeen = true;
        }
      }
      if (r.box2a !== null && bucket !== 'rollover') {
        taxable += r.box2a;
        taxableSeen = true;
      }
      if (r.box4 !== null) {
        withheld += r.box4;
        withheldSeen = true;
        if (bucket === 'rollover' && r.box4 > 0) rolloverWithWithholding += r.box4;
      }
    }

    if (grossSeen) doc('retirement-distribution', gross, '1099-R box 1 (rollovers excluded)');
    if (taxableSeen) {
      doc('retirement-distribution-taxable', taxable, '1099-R box 2a as printed');
    }
    if (buckets.rollover > 0) {
      doc(
        'retirement-rollover',
        buckets.rollover,
        rolloverWithWithholding > 0
          ? `1099-R code G/H — a direct rollover is not income. But $${rolloverWithWithholding} of federal withholding on a rollover means money LEFT the retirement system on the way: a partial-rollover trap with a 60-day clock, worth a preparer's eyes.`
          : '1099-R code G/H — a direct rollover is not income at all; if software taxed it, that is why',
      );
    }
    if (buckets.early > 0) {
      doc(
        'retirement-early-distribution',
        buckets.early,
        '1099-R code 1 — early distribution; the 10% additional tax and its exceptions are Form 5329',
      );
    }
    if (buckets.roth > 0) {
      doc(
        'retirement-roth-distribution',
        buckets.roth,
        '1099-R codes J/T/Q — Roth ordering rules are not yet modelled; named for a preparer rather than guessed',
      );
    }
    if (buckets.unclassified > 0) {
      doc(
        'retirement-distribution-unclassified',
        buckets.unclassified,
        '1099-R with no readable box 7 code — the treatment is genuinely undecided until the code is known',
      );
    }
    if (withheldSeen) doc('retirement-federal-withheld', withheld, '1099-R box 4');
  }

  // ── 1099-G: unemployment (exact, form replaces estimate) + raw refund ──
  const gRows = live.filter((r) => r.kind === '1099-G');
  if (gRows.length > 0) {
    let unemployment = 0;
    let unemploymentSeen = false;
    let refund = 0;
    let refundSeen = false;
    for (const row of gRows) {
      const g = row.extracted.g1099;
      if (!g) continue;
      if (g.box1 !== null) {
        unemployment += g.box1;
        unemploymentSeen = true;
      }
      if (g.box2 !== null) {
        refund += g.box2;
        refundSeen = true;
      }
    }
    if (unemploymentSeen) {
      const person = personByFact.get('unemployment-income');
      const estimate = numberOf(person);
      if (person !== undefined && estimate !== null && estimate !== unemployment) {
        doc(
          'unemployment-income',
          unemployment,
          `1099-G box 1: $${unemployment} — replaces the $${estimate} estimate; the state's record is the exact figure`,
          person.assertionId,
        );
      } else if (person === undefined || estimate === null) {
        doc('unemployment-income', unemployment, '1099-G box 1');
      }
      // Equal estimate: the document corroborates silently — no new assertion.
    }
    if (refundSeen) {
      doc(
        'state-refund-received',
        refund,
        "1099-G box 2 — scarier than it is: only taxable if last year's deductions were itemized, which almost nobody here does",
      );
    }
  }

  // ── W-2G: the floor rule — thresholds mean the person can know more ──
  const wRows = live.filter((r) => r.kind === 'W-2G');
  if (wRows.length > 0) {
    let winnings = 0;
    let seen = false;
    for (const row of wRows) {
      const w = row.extracted.w2g;
      if (w?.box1 !== null && w !== null) {
        winnings += w.box1 ?? 0;
        seen = true;
      }
    }
    if (seen) {
      const person = personByFact.get('gambling-winnings');
      const estimate = numberOf(person);
      if (person !== undefined && estimate !== null) {
        if (estimate < winnings) {
          doc(
            'gambling-winnings',
            winnings,
            `W-2G total: $${winnings} — replaces the $${estimate} estimate (documents outrank memory; wins below the per-game thresholds still belong on top)`,
            person.assertionId,
          );
        }
        // Estimate at or above the forms: it stands — W-2Gs only exist for
        // big single wins, and the untracked rest is still income.
      } else {
        doc(
          'gambling-winnings',
          winnings,
          'W-2G total — losses never net against this unless deductions are itemized',
        );
      }
    }
  }

  return out;
}
