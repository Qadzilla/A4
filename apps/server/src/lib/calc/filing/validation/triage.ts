// ─── Divergence triage (A8) ────────────────────────────────────────
// The contract: divergences are triaged in writing — our bug (fix it),
// their simplification (document it), or ambiguity in the law (document,
// and prefer the authority's example). An untriaged divergence keeps the
// C-phase gate closed; a triaged one is a recorded disagreement with a
// written reason, which is what honest coverage looks like.
//
// Append-only, like the corpus ledger. An entry is evidence, not a patch:
// it never edits the recording and never bends the engine.

export interface TriageEntry {
  persona: string;
  tool: string;
  lineId: string;
  verdict: 'our-bug' | 'their-simplification' | 'their-stale-data' | 'ambiguity';
  /** The written reason, with the authority that decides it. */
  explanation: string;
  recordedOn: string;
}

export const DIVERGENCE_TRIAGE: TriageEntry[] = [
  {
    persona: 'P2',
    tool: 'taxcaster',
    lineId: '1040:12',
    verdict: 'their-simplification',
    explanation:
      'TaxCaster shows a dependent standard deduction of 8,500 for 8,000 of earned income. The statute (Rev. Proc. 2024-40, verified 2026-08-02) is the greater of $1,350 or earned income + $450 = 8,450. Dinkytown, the line-accurate implementation, produced 8,450 exactly (taxable 2,650 from the same facts). The $50 is an estimator rounding/approximation on their side and does not change their bottom line.',
    recordedOn: '2026-08-02',
  },
  {
    persona: 'P2',
    tool: 'taxcaster',
    lineId: '1040:15',
    verdict: 'their-simplification',
    explanation:
      'Downstream of the same $50: taxable income 2,600 vs the statutory 2,650. Same triage, same authority; both implementations agree tax is $0 because the long-term gain sits inside the 0% bracket.',
    recordedOn: '2026-08-02',
  },
  {
    persona: 'P1',
    tool: 'dinkytown',
    lineId: '1040:16',
    verdict: 'their-stale-data',
    explanation:
      "Recorded 2,863 vs the engine's 2,860 on 25,900 of taxable income. 2,863 is 10% × 12,250 + 12% × 13,650 — the pre-OBBBA PROJECTED 2026 brackets, which this engine also carried until 2026-08-04. The final figures are Rev. Proc. 2025-32 §4.01 Table 3 (transcribed from the primary source): 10% to 12,400, then 12% to 50,400, giving 1,240 + 1,620 = 2,860. The engine was corrected to the revenue procedure; the recording preserves what the tool displayed on 2026-08-02 and is not edited. Re-running Dinkytown would show whether they have since updated.",
    recordedOn: '2026-08-04',
  },
  {
    persona: 'P1',
    tool: 'dinkytown',
    lineId: '1040:24',
    verdict: 'their-stale-data',
    explanation:
      'Downstream of the same $3: the total-tax line carries the income-tax line unchanged for this persona (no other taxes apply). Same authority, same verdict as 1040:16.',
    recordedOn: '2026-08-04',
  },
];
