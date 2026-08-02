// ─── C2 · Contract & platform income becomes facts ─────────────────
// The family where the paper trail died: below the year's thresholds
// ($2,000 NEC / $20,000-and-200 K in 2026) nothing arrives, and the income
// is taxable anyway. So this planner serves two entry paths that assert the
// SAME facts — extraction for forms that came, the intake for income that
// never will — and D4 deliberately cannot tell which was which.
//
// The rules, from BASIS_FILING.md C2:
//  - Forms are a floor, not the truth. A person's estimate below what the
//    forms document is impossible (documents outrank memory) and is
//    superseded up to the forms' total, with the delta surfaced in the
//    provenance — never silently summed. An estimate ABOVE the forms' total
//    stands: the difference is exactly the no-form income this slice exists
//    to keep.
//  - A 1099-K's box 1a is GROSS, not income: fees, refunds and personal
//    items sold at a loss are separately assertable facts, and netting them
//    is D4's job, not extraction's.
//  - A corrected form replaces its predecessor by (payer TIN, kind, year);
//    duplicates from one payer are never summed — they surface as a
//    contradiction and readiness blocks until a human picks a side.

import type { FactAssertion, FactId } from '../lib/calc/filing/facts';
import { makeAssertion } from '../lib/calc/filing/facts';

export type IncomeFormKind = '1099-NEC' | '1099-K';

export interface ExtractedIncomeForm {
  kind: IncomeFormKind;
  payerName: string | null;
  payerTin: string | null;
  corrected: boolean;
  taxYear: number;
  /** Box 1, nonemployee compensation — present when kind is 1099-NEC. */
  nec: { box1: number | null; box4: number | null } | null;
  /** Box 1a gross amount — present when kind is 1099-K. Gross ≠ income. */
  k: { box1a: number | null; box4: number | null; transactionCount: number | null } | null;
}

export interface StoredIncomeFormRow {
  fileId: string;
  kind: IncomeFormKind;
  payerTin: string | null;
  corrected: boolean;
  /** Insertion order stands in for arrival order when timestamps tie. */
  createdAt: number;
  extracted: ExtractedIncomeForm;
}

/**
 * The fact ids this planner may write. contract-income and platform-income
 * are shared with the person's own estimates — the planner only ever writes
 * them with document provenance, and the delete cascade only ever wipes the
 * document-sourced side, so an estimate superseded by a form comes back to
 * life when the form is deleted.
 */
export const INCOME_FORM_FACT_IDS: FactId[] = ['nec-income', 'contract-income', 'platform-income'];

/**
 * Which rows count: per (kind, payer TIN, year), a corrected row retires
 * every uncorrected one; the newest corrected row wins among corrections.
 * Rows with no TIN can't be matched to a predecessor and stay live
 * individually — better a visible contradiction than a guessed identity.
 */
export function liveIncomeFormRows(rows: StoredIncomeFormRow[]): StoredIncomeFormRow[] {
  const byKey = new Map<string, StoredIncomeFormRow[]>();
  const noTin: StoredIncomeFormRow[] = [];
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

  const live: StoredIncomeFormRow[] = [...noTin];
  for (const group of byKey.values()) {
    const corrected = group.filter((r) => r.corrected).sort((a, b) => b.createdAt - a.createdAt);
    if (corrected.length > 0) {
      live.push(corrected[0] as StoredIncomeFormRow);
    } else {
      live.push(...group); // duplicates stay live → contradiction downstream
    }
  }
  return live.sort((a, b) => a.createdAt - b.createdAt);
}

/** Payer groups with more than one live uncorrected row — the never-sum rule. */
function duplicateTins(live: StoredIncomeFormRow[], kind: IncomeFormKind): Set<string> {
  const counts = new Map<string, number>();
  for (const row of live) {
    if (row.kind !== kind) continue;
    const tin = row.payerTin?.trim();
    if (!tin) continue;
    counts.set(tin, (counts.get(tin) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([tin]) => tin));
}

export interface IncomeFormFactPlanInput {
  live: StoredIncomeFormRow[];
  /** Live DOCUMENT-sourced assertions of this planner's facts — what to supersede. */
  prevLive: FactAssertion[];
  /** Live PERSON-sourced estimates of contract-income / platform-income. */
  personLive: FactAssertion[];
  taxYear: number;
  /** The upload that triggered this re-plan, for provenance. */
  triggeringFileId: string;
  nowIso: string;
}

const numberOf = (a: FactAssertion | undefined): number | null =>
  a !== undefined && a.value.kind === 'number' ? a.value.value : null;

/**
 * The assertions the live rows support. Deterministic given its inputs;
 * assertion ids are content-addressed on (fact, trigger) so a re-run of the
 * same state is idempotent.
 */
export function planIncomeFormFacts(input: IncomeFormFactPlanInput): FactAssertion[] {
  const { live, prevLive, personLive, taxYear, triggeringFileId, nowIso } = input;
  const out: FactAssertion[] = [];
  const prevByFact = new Map(prevLive.map((a) => [a.factId, a]));
  const personByFact = new Map(personLive.map((a) => [a.factId, a]));

  const assert = (
    factId: FactId,
    value: number,
    field: string,
    supersedes: string | null,
    fileId = triggeringFileId,
  ) => {
    out.push(
      makeAssertion({
        assertionId: `incform:${factId}:${fileId}:${nowIso}`,
        factId,
        taxYear,
        value: { kind: 'number', value },
        source: { kind: 'document', fileId, field },
        assertedAt: nowIso,
        supersedes,
      } as Parameters<typeof makeAssertion>[0]),
    );
  };

  if (live.length === 0) return out;

  // ── One family at a time; each has a form-total fact and a floor fact ──
  const families: Array<{
    kind: IncomeFormKind;
    formFact: FactId;
    floorFact: FactId;
    formLabel: string;
    pick: (row: StoredIncomeFormRow) => number | null;
  }> = [
    {
      kind: '1099-NEC',
      formFact: 'nec-income',
      floorFact: 'contract-income',
      formLabel: '1099-NEC box 1',
      pick: (r) => r.extracted.nec?.box1 ?? null,
    },
    {
      kind: '1099-K',
      // K forms have no dedicated form-total fact: box 1a IS gross platform
      // receipts, which is what platform-income means. The floor rule alone
      // carries it; the decomposition facts (fees, refunds, personal items)
      // are the person's to assert and D4's to net.
      formFact: 'platform-income',
      floorFact: 'platform-income',
      formLabel:
        '1099-K box 1a (gross — not income until fees, refunds and personal items come out)',
      pick: (r) => r.extracted.k?.box1a ?? null,
    },
  ];

  for (const family of families) {
    const rows = live.filter((r) => r.kind === family.kind);
    if (rows.length === 0) continue;

    const dups = duplicateTins(rows, family.kind);
    if (dups.size > 0) {
      // The never-sum rule: each duplicate row asserts its own figure from
      // its own document — the fact model reads contradiction, readiness
      // blocks, a human picks a side. No floors while the total is untrusted.
      let first = true;
      for (const row of rows) {
        const tin = row.payerTin?.trim();
        if (!tin || !dups.has(tin)) continue;
        const amount = family.pick(row);
        if (amount === null) continue;
        out.push(
          makeAssertion({
            assertionId: `incform:${family.formFact}:${row.fileId}:${nowIso}`,
            factId: family.formFact,
            taxYear,
            value: { kind: 'number', value: amount },
            source: {
              kind: 'document',
              fileId: row.fileId,
              field: `${family.formLabel} — one of two or more uncorrected forms from payer TIN ${tin}`,
            },
            assertedAt: nowIso,
            supersedes: first ? (prevByFact.get(family.formFact)?.assertionId ?? null) : null,
          } as Parameters<typeof makeAssertion>[0]),
        );
        first = false;
      }
      continue;
    }

    let total = 0;
    let seen = false;
    for (const row of rows) {
      const v = family.pick(row);
      if (v !== null) {
        total += v;
        seen = true;
      }
    }
    if (!seen) continue;

    const suffix = rows.length > 1 ? ` (total across ${rows.length} payers)` : '';

    // The form-total fact (NEC only — for K the form fact IS the floor fact).
    if (family.formFact !== family.floorFact) {
      assert(
        family.formFact,
        total,
        family.formLabel + suffix,
        prevByFact.get(family.formFact)?.assertionId ?? null,
      );
    }

    // ── The floor rule ──
    const personAssertion = personByFact.get(family.floorFact);
    const personEstimate = numberOf(personAssertion);

    if (personAssertion !== undefined && personEstimate !== null) {
      if (personEstimate < total) {
        // Documents outrank memory: reconcile to the form, surface the delta,
        // and say plainly that no-form income belongs back on top.
        assert(
          family.floorFact,
          total,
          `${family.formLabel}${suffix}: $${total} — replaces the $${personEstimate} estimate (documents outrank memory; income that never got a form still belongs on top)`,
          personAssertion.assertionId,
        );
      }
      // Estimate at or above the forms' total: the difference is the no-form
      // income this slice exists to keep. The estimate stands untouched.
    } else {
      // No estimate on file — the forms establish the figure outright.
      assert(
        family.floorFact,
        total,
        family.formLabel + suffix,
        prevByFact.get(family.floorFact)?.assertionId ?? null,
      );
    }
  }

  return out;
}
