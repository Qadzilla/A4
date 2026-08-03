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
];
