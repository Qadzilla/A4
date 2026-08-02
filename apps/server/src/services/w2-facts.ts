// ─── C1 · W-2 rows become facts ────────────────────────────────────
// The pure half of the extractor: given every stored W-2 row for a year,
// decide which rows are live, and produce the fact assertions the live set
// supports — with supersession links so a corrected form re-runs exactly
// what depended on the old numbers (A1's `dependents`, end to end).
//
// The rules, from BASIS_FILING.md C1:
//  - A W-2c replaces its predecessor by (employer EIN, year). The old row
//    stays stored; it just stops being live.
//  - Two uncorrected W-2s from the same employer and year are NEVER summed —
//    each asserts its own wages figure, the fact model reads that as a
//    contradiction, and readiness blocks until a human picks a side.
//  - A box nobody read asserts nothing. Zero is a value; absent is absent.
//  - Extraction reports boxes as printed: box 1 and box 3 routinely differ
//    (401(k) money is in 3 but not 1), and nothing here "fixes" that.

import type { FactAssertion, FactId } from '../lib/calc/filing/facts';
import { makeAssertion } from '../lib/calc/filing/facts';

export interface ExtractedW2 {
  employerName: string | null;
  employerEin: string | null;
  corrected: boolean;
  taxYear: number;
  boxes: {
    box1: number | null; // wages
    box2: number | null; // federal income tax withheld
    box3: number | null; // SS wages — stored, never blended into box 1
    box4: number | null; // SS tax withheld (E4's raw material)
    box5: number | null; // Medicare wages
    box6: number | null; // Medicare tax withheld
    box12: Array<{ code: string; amount: number }>;
    box14: string | null;
    stateRows: Array<{ state: string; stateWages: number | null; stateTax: number | null }>;
  };
}

export interface StoredW2Row {
  fileId: string;
  employerEin: string | null;
  corrected: boolean;
  /** Insertion order stands in for arrival order when timestamps tie. */
  createdAt: number;
  extracted: ExtractedW2;
}

/** Elective deferrals that count as retirement contributions (D2's input). */
export const RETIREMENT_CODES = new Set(['D', 'E', 'F', 'G', 'S', 'AA', 'BB']);
export const HSA_CODE = 'W';

/** The fact ids this planner owns — wiped and re-planned as a unit. */
export const W2_FACT_IDS: FactId[] = [
  'w2-employer-count',
  'w2-wages',
  'w2-federal-withheld',
  'w2-ss-tax-withheld',
  'w2-medicare-tax-withheld',
  'w2-retirement-contributions',
  'w2-hsa-contributions',
  'w2-state-tax-withheld',
];

/**
 * Which rows count: per (EIN, year), a corrected row retires every
 * uncorrected one; the newest corrected row wins among corrections.
 * Rows with no EIN can't be matched to a predecessor and stay live
 * individually — better a visible contradiction than a guessed identity.
 */
export function liveW2Rows(rows: StoredW2Row[]): StoredW2Row[] {
  const byEin = new Map<string, StoredW2Row[]>();
  const noEin: StoredW2Row[] = [];
  for (const row of rows) {
    if (row.employerEin === null || row.employerEin.trim() === '') {
      noEin.push(row);
      continue;
    }
    const key = row.employerEin.trim();
    const list = byEin.get(key) ?? [];
    list.push(row);
    byEin.set(key, list);
  }

  const live: StoredW2Row[] = [...noEin];
  for (const group of byEin.values()) {
    const corrected = group.filter((r) => r.corrected).sort((a, b) => b.createdAt - a.createdAt);
    if (corrected.length > 0) {
      live.push(corrected[0] as StoredW2Row);
    } else {
      live.push(...group); // duplicates stay live → contradiction downstream
    }
  }
  return live.sort((a, b) => a.createdAt - b.createdAt);
}

/** EIN groups with more than one live uncorrected row — the never-sum rule. */
function duplicateEins(live: StoredW2Row[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of live) {
    const ein = row.employerEin?.trim();
    if (!ein) continue;
    counts.set(ein, (counts.get(ein) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([ein]) => ein));
}

export interface W2FactPlanInput {
  live: StoredW2Row[];
  /** Live assertions for W2_FACT_IDS from previous plans — what to supersede. */
  prevLive: FactAssertion[];
  workspaceKey: { taxYear: number };
  /** The upload that triggered this re-plan, for provenance. */
  triggeringFileId: string;
  nowIso: string;
}

/**
 * The assertions the live rows support. Deterministic given its inputs;
 * assertion ids are content-addressed on (fact, trigger) so a re-run of the
 * same state is idempotent.
 */
export function planW2Facts(input: W2FactPlanInput): FactAssertion[] {
  const { live, prevLive, workspaceKey, triggeringFileId, nowIso } = input;
  const taxYear = workspaceKey.taxYear;
  const out: FactAssertion[] = [];
  const prevByFact = new Map(prevLive.map((a) => [a.factId, a]));

  const assert = (factId: FactId, value: number, field: string, fileId = triggeringFileId) => {
    out.push(
      makeAssertion({
        assertionId: `w2:${factId}:${fileId}:${nowIso}`,
        factId,
        taxYear,
        value: { kind: 'number', value },
        source: { kind: 'document', fileId, field },
        assertedAt: nowIso,
        supersedes: prevByFact.get(factId)?.assertionId ?? null,
      } as Parameters<typeof makeAssertion>[0]),
    );
  };

  if (live.length === 0) return out;

  const dups = duplicateEins(live);
  if (dups.size > 0) {
    // The never-sum rule: each duplicate row asserts wages from its own
    // document. Same fact, different sources, different values — the fact
    // model reads contradiction, readiness blocks, a human picks a side.
    // Only the first assertion carries the supersedes link; a chain can't
    // fork from one predecessor without reading as its own contradiction.
    let first = true;
    for (const row of live) {
      const ein = row.employerEin?.trim();
      if (!ein || !dups.has(ein)) continue;
      const wages = row.extracted.boxes.box1;
      if (wages === null) continue;
      out.push(
        makeAssertion({
          assertionId: `w2:w2-wages:${row.fileId}:${nowIso}`,
          factId: 'w2-wages',
          taxYear,
          value: { kind: 'number', value: wages },
          source: {
            kind: 'document',
            fileId: row.fileId,
            field: `W-2 box 1 — one of ${dups.size > 1 ? 'several' : 'two'} uncorrected forms from EIN ${ein}`,
          },
          assertedAt: nowIso,
          supersedes: first ? (prevByFact.get('w2-wages')?.assertionId ?? null) : null,
        } as Parameters<typeof makeAssertion>[0]),
      );
      first = false;
    }
    return out;
  }

  // Aggregates over the live set — only where at least one form has the box.
  const employers = new Set(live.map((r) => r.employerEin?.trim() || r.fileId));
  assert('w2-employer-count', employers.size, `count of employers across ${live.length} W-2(s)`);

  const sum = (pick: (w2: ExtractedW2) => number | null): { total: number; seen: boolean } => {
    let total = 0;
    let seen = false;
    for (const row of live) {
      const v = pick(row.extracted);
      if (v !== null) {
        total += v;
        seen = true;
      }
    }
    return { total, seen };
  };

  const fields: Array<[FactId, string, (w2: ExtractedW2) => number | null]> = [
    ['w2-wages', 'W-2 box 1', (w) => w.boxes.box1],
    ['w2-federal-withheld', 'W-2 box 2', (w) => w.boxes.box2],
    ['w2-ss-tax-withheld', 'W-2 box 4', (w) => w.boxes.box4],
    ['w2-medicare-tax-withheld', 'W-2 box 6', (w) => w.boxes.box6],
    [
      'w2-retirement-contributions',
      'W-2 box 12 (retirement codes)',
      (w) => {
        const entries = w.boxes.box12.filter((e) => RETIREMENT_CODES.has(e.code.toUpperCase()));
        return entries.length > 0 ? entries.reduce((s, e) => s + e.amount, 0) : null;
      },
    ],
    [
      'w2-hsa-contributions',
      'W-2 box 12 code W',
      (w) => {
        const entries = w.boxes.box12.filter((e) => e.code.toUpperCase() === HSA_CODE);
        return entries.length > 0 ? entries.reduce((s, e) => s + e.amount, 0) : null;
      },
    ],
    [
      'w2-state-tax-withheld',
      'W-2 box 17',
      (w) => {
        const entries = w.boxes.stateRows.filter((r) => r.stateTax !== null);
        return entries.length > 0 ? entries.reduce((s, r) => s + (r.stateTax ?? 0), 0) : null;
      },
    ],
  ];

  const suffix = live.length > 1 ? ` (total across ${live.length} employers)` : '';
  for (const [factId, field, pick] of fields) {
    const { total, seen } = sum(pick);
    if (seen) assert(factId, total, field + suffix);
  }

  return out;
}
