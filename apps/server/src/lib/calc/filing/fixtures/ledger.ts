// ─── The corpus ledger (A7) ────────────────────────────────────────
// Append-only. Every fixture id ever merged is recorded here, and the
// corpus test holds both directions: an id in the ledger with no fixture
// is a deletion (forbidden — supersede with a note instead), and a fixture
// with no ledger entry is an addition that skipped the record.
//
// This is Doctrine 8 applied to ourselves: the corpus only grows, and a
// fixture that was once right is never quietly removed.

export interface LedgerEntry {
  id: string;
  /** Set when the law moved and a successor fixture replaced this one.
   *  The superseded fixture stays in the corpus, marked, never deleted. */
  supersededBy?: string;
}

export const CORPUS_LEDGER: LedgerEntry[] = [
  // A2 — residency (Pub 519)
  { id: 'residency/pub519-spt-120-days' },
  { id: 'residency/pub519-spt-183-boundary' },
  { id: 'residency/december-arrival-consumes-whole-year' },
  { id: 'residency/year-six-flips-resident' },
  { id: 'residency/year-six-under-183-still-nonresident' },
  { id: 'residency/absent-year-preserves-exemption' },
  { id: 'residency/citizen' },
  { id: 'residency/green-card' },
  { id: 'residency/no-facts-is-not-resident' },
  { id: 'residency/non-student-visa-refused' },
  { id: 'residency/student-without-entry-year' },
  // A3 — dependency & filing status (Pub 501)
  { id: 'dependency/student-away-at-college' },
  { id: 'dependency/age-24-in-december' },
  { id: 'dependency/loans-are-self-support' },
  { id: 'dependency/joint-return-refund-only' },
  { id: 'dependency/joint-return-real' },
  { id: 'dependency/five-months-is-a-student' },
  { id: 'dependency/four-months-is-not' },
  { id: 'dependency/nonresident-cannot-be-claimed' },
  { id: 'dependency/unknown-support-is-the-fork' },
  { id: 'dependency/qr-income-boundary-fails-at-limit' },
  { id: 'dependency/qr-income-boundary-passes-under-limit' },
  // A7 — the personas, end to end
  { id: 'persona/p1-first-paycheck' },
  { id: 'persona/p2-dependent-with-a-robinhood' },
  { id: 'persona/p3-f1-junior' },
  { id: 'persona/p4-two-apps-and-a-bike' },
  { id: 'persona/p5-boston-remote' },
  { id: 'persona/p6-parlay-and-a-401k' },
  { id: 'persona/p7-marketplace-freelancer' },
  { id: 'persona/p8-three-years-behind' },
  // D6 — early-withdrawal penalty (Form 5329 instructions)
  { id: 'penalty/education-kills-it-for-an-ira' },
  { id: 'penalty/education-does-nothing-for-a-401k' },
  { id: 'penalty/unknown-pocket-is-the-fork' },
  { id: 'penalty/first-home-caps-at-ten-thousand' },
  { id: 'penalty/medical-floor-runs-on-agi' },
  { id: 'penalty/age-55-never-helps-an-ira' },
  { id: 'penalty/roth-refuses-instead-of-over-penalising' },
  // D1 — education credits & student-loan interest (Form 8863 / Pub 970 / IRC §221)
  { id: 'education/aotc-full-arithmetic' },
  { id: 'education/refundable-closed-under-24' },
  { id: 'education/age-24-frees-the-credit' },
  { id: 'education/dependents-credit-is-the-parents' },
  { id: 'education/unknown-dependency-is-the-fork' },
  { id: 'education/four-lifetime-years' },
  { id: 'education/double-dip-guard' },
  { id: 'education/scholarship-election-priced' },
  { id: 'education/scholarship-election-made' },
  { id: 'education/mfs-gets-neither' },
  { id: 'education/nonresident-blocked' },
  { id: 'education/sli-above-the-line' },
  { id: 'education/sli-phaseout-midband' },
  { id: 'education/sli-dependent-denied' },
  // D2 — the saver's credit (Form 8880, TY ≤ 2026; Notice 2025-67 tiers)
  { id: 'savers/fifty-percent-tier' },
  { id: 'savers/boundary-exact' },
  { id: 'savers/one-dollar-over' },
  { id: 'savers/over-the-ceiling' },
  { id: 'savers/student-disqualified' },
  { id: 'savers/student-unknown-is-the-fork' },
  { id: 'savers/dependent-disqualified' },
  { id: 'savers/under-18' },
  { id: 'savers/distributions-reduce' },
  { id: 'savers/rollover-does-not-reduce' },
  { id: 'savers/prior-year-distribution-reduces' },
  { id: 'savers/ira-and-w2-compose' },
  { id: 'savers/nothing-contributed-yet' },
  { id: 'savers/2027-refuses-by-name' },
  // D3 — premium tax credit (Form 8962; Rev. Proc. 2025-25; FS-2025-10)
  { id: 'ptc/2026-at-200pct-repays' },
  { id: 'ptc/2025-same-facts-gets-credit' },
  { id: 'ptc/2025-cap-is-the-mercy' },
  { id: 'ptc/2026-same-shape-uncapped' },
  { id: 'ptc/2025-above-400-no-cliff' },
  { id: 'ptc/2026-above-400-cliff' },
  { id: 'ptc/below-100-with-aptc-refused' },
  { id: 'ptc/below-100-nothing-advanced' },
  { id: 'ptc/mfs-refused' },
  { id: 'ptc/blank-slcsp-is-a-handoff' },
  { id: 'ptc/partial-year-month-wise' },
  { id: 'ptc/own-dependent-refused' },
  // D4 — Schedule C/SE & misclassification (Sch SE instructions; 8919/SS-8)
  { id: 'se/p4-the-fifteen-three-surprise' },
  { id: 'se/floor-measured-on-net-earnings' },
  { id: 'se/one-dollar-over-the-floor' },
  { id: 'se/mileage-2026-floor-rate' },
  { id: 'se/mileage-2025-single-rate' },
  { id: 'se/platform-decomposition-nets' },
  { id: 'se/nec-k-overlap-never-double-counts' },
  { id: 'se/wage-base-offset' },
  { id: 'se/home-office-refuses-by-name' },
  { id: 'se/other-expenses-refuse-too' },
  { id: 'se/unknown-miles-price-not-silence' },
  { id: 'se/misclassification-two-signals-lean' },
  { id: 'se/misclassification-one-signal-does-not' },
  { id: 'se/same-payer-alone-leans' },
  { id: 'se/no-income-is-none' },
  // D5 — capital gains wiring (8949/Sch D instructions; Pub 550; lot engine as spec)
  { id: 'cg/fifo-short-arithmetic' },
  { id: 'cg/long-term-boundary-pair' },
  { id: 'cg/wash-sale-carried-forward' },
  { id: 'cg/uncovered-units-honesty' },
  { id: 'cg/year-filter-matches-across-history' },
  { id: 'cg/category-printed-wins' },
  { id: 'cg/category-derived-covered-pair' },
  { id: 'cg/category-noncovered-derived' },
  { id: 'cg/crypto-long-person-row' },
  { id: 'cg/crypto-unknown-term-defaults-short' },
  { id: 'cg/crypto-missing-basis-is-priced' },
  { id: 'cg/estimate-superseded-not-contradicted' },
  { id: 'cg/no-trades-no-crypto-none' },
];
