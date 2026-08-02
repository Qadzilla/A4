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
  verdict: 'our-bug' | 'their-simplification' | 'ambiguity';
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
];
