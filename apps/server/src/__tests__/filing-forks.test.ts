import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { fork, rankUnknowns } from '../lib/calc/filing/forks';

// ─── A4 acceptance ─────────────────────────────────────────────────
// The fork is the product's demo: "finding out X is worth $Y." These tests
// hold it to the contract — real dollar deltas where the engine can compute
// them, blocks reported as consequences rather than zeros, and no branch
// ever presented as likely.

let n = 0;
const make = (
  factId: Parameters<typeof makeAssertion>[0]['factId'],
  value: Parameters<typeof makeAssertion>[0]['value'],
) =>
  makeAssertion({
    assertionId: `a${++n}`,
    factId,
    taxYear: 2026,
    value,
    source: { kind: 'person', conversationId: null },
    assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
  } as Parameters<typeof makeAssertion>[0]);

/**
 * P2 with the deciding fact missing: 20, at school, wages and realized
 * long-term gains on file, support share shrugged at. Whether the parents
 * can claim them is exactly what the fork prices.
 */
const p2 = () => [
  make('us-citizen', { kind: 'bool', value: true }),
  make('married', { kind: 'bool', value: false }),
  make('birth-date', { kind: 'date', value: '2006-03-10' }),
  make('full-time-student-months', { kind: 'number', value: 9 }),
  make('lived-with-parents-months', { kind: 'number', value: 3 }),
  make('months-away-at-school', { kind: 'number', value: 9 }),
  make('w2-wages', { kind: 'number', value: 8000 }),
  make('realized-long-gains', { kind: 'number', value: 3100 }),
  make('self-support-share-pct', { kind: 'unknown' }),
];

describe('the P2 dependency fork', () => {
  it('reports the kiddie block as the consequence when dollars alone say nothing', () => {
    // The truthful shape of P2's numbers: $8,000 of wages and $3,100 of
    // long-term gains owe $0 at the person's own rates on BOTH branches —
    // the 0% bracket swallows the deduction difference. The entire jump is
    // Form 8615, and it must arrive as a block, not vanish into delta $0.
    const result = fork(p2(), 2026, 'self-support-share-pct');
    if (!result.ok) throw new Error(`fork refused: ${result.reason}`);

    expect(result.branches).toHaveLength(2);

    const claimed = result.branches.find((b) => b.evaluation.dependency.canBeClaimed === 'yes');
    const independent = result.branches.find((b) => b.evaluation.dependency.canBeClaimed === 'no');
    if (!claimed || !independent) throw new Error('expected one branch each way');

    expect(result.delta).toBe(0);
    expect(claimed.evaluation.liability?.totalTax).toBe(independent.evaluation.liability?.totalTax);

    // $3,100 of gains is over the $2,700 kiddie threshold — and exposure is
    // independent of claimability (a self-supporting-through-loans student
    // is still covered), so BOTH branches carry the Form 8615 block. The
    // jump is visible on the fork; it just doesn't flip with this fact.
    expect(claimed.evaluation.blocked).toContain('form-8615');
    expect(independent.evaluation.blocked).toContain('form-8615');
    expect(result.blockedDiffers.map((b) => b.item)).not.toContain('form-8615');

    // Honest narration: the fork names what else flips with this fact.
    expect(result.alsoChanges).toContain('can-be-claimed');
  });

  it('prices a fork in dollars and reports a form set that differs', () => {
    // Fork the student question instead: nine months makes a claimable
    // dependent (limited deduction, kiddie-covered); four months makes the
    // age test fail (no exposure, full deduction). Short-term gains are
    // ordinary income, so the deduction difference is real dollars — and
    // the branches genuinely need different forms.
    const facts = [
      ...p2().filter(
        (a) =>
          a.factId !== 'realized-long-gains' &&
          a.factId !== 'full-time-student-months' &&
          a.factId !== 'self-support-share-pct',
      ),
      make('realized-short-gains', { kind: 'number', value: 3100 }),
      make('self-support-share-pct', { kind: 'number', value: 20 }),
      make('full-time-student-months', { kind: 'unknown' }),
    ];
    const result = fork(facts, 2026, 'full-time-student-months');
    if (!result.ok) throw new Error(`fork refused: ${result.reason}`);

    const student = result.branches.find((b) => b.evaluation.dependency.canBeClaimed === 'yes');
    const nonStudent = result.branches.find((b) => b.evaluation.dependency.canBeClaimed !== 'yes');
    if (!student || !nonStudent) throw new Error('expected both shapes');

    expect(result.delta).toBeGreaterThan(0);
    expect(result.delta).toBeLessThan(1000);
    expect(student.evaluation.liability?.totalTax ?? 0).toBeGreaterThan(
      nonStudent.evaluation.liability?.totalTax ?? 0,
    );
    // The cruel case from the contract: branches with different form sets —
    // the student branch owes 8615, the other doesn't, and the fork says so.
    expect(student.evaluation.blocked).toContain('form-8615');
    expect(nonStudent.evaluation.blocked).not.toContain('form-8615');
    expect(result.blockedDiffers.map((b) => b.item)).toContain('form-8615');
    expect(result.alsoChanges).toContain('can-be-claimed');
  });

  it('labels representative points as representative', () => {
    const result = fork(p2(), 2026, 'self-support-share-pct');
    if (!result.ok) throw new Error('fork refused');
    for (const branch of result.branches) {
      expect(branch.assumedNote).toContain('Representative value');
    }
  });

  it('holds every other unknown constant and says so', () => {
    const result = fork(p2(), 2026, 'self-support-share-pct');
    if (!result.ok) throw new Error('fork refused');
    expect(result.heldConstant).toContain('Single-fact fork');
  });
});

describe('fork refusals', () => {
  it('refuses to fork a fact that is already known — pricing is not re-deciding', () => {
    const facts = [...p2(), make('self-support-share-pct', { kind: 'number', value: 20 })];
    // The shrug plus a later known value resolves to known.
    const result = fork(facts, 2026, 'self-support-share-pct');
    expect(result).toEqual({ ok: false, at: 'self-support-share-pct', reason: 'not-unknown' });
  });

  it('refuses to fork over a contradiction — resolution comes first', () => {
    const facts = [
      ...p2().filter((a) => a.factId !== 'self-support-share-pct'),
      make('self-support-share-pct', { kind: 'number', value: 20 }),
      makeAssertion({
        assertionId: 'doc-support',
        factId: 'self-support-share-pct',
        taxYear: 2026,
        value: { kind: 'number', value: 80 },
        source: { kind: 'document', fileId: 'worksheet', field: 'support' },
        assertedAt: '2026-02-01T00:00:00Z',
        supersedes: null,
      }),
    ];
    const result = fork(facts, 2026, 'self-support-share-pct');
    expect(result).toEqual({
      ok: false,
      at: 'self-support-share-pct',
      reason: 'contradicted',
    });
  });

  it('declines a numeric fact it has no representative points for', () => {
    const facts = [...p2(), make('w2-employer-count', { kind: 'unknown' })];
    const result = fork(facts, 2026, 'w2-employer-count');
    expect(result).toEqual({
      ok: false,
      at: 'w2-employer-count',
      reason: 'no-representative-points',
    });
  });
});

describe('blocks as consequences', () => {
  it('reports the unmade filing election as a block, never an average', () => {
    const facts = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('birth-date', { kind: 'date', value: '2000-05-01' }),
      make('w2-wages', { kind: 'number', value: 42000 }),
      make('married', { kind: 'unknown' }),
    ];
    const result = fork(facts, 2026, 'married');
    if (!result.ok) throw new Error('fork refused');

    const married = result.branches.find(
      (b) => b.assumed.kind === 'bool' && b.assumed.value === true,
    );
    const single = result.branches.find(
      (b) => b.assumed.kind === 'bool' && b.assumed.value === false,
    );
    if (!married || !single) throw new Error('expected both branches');

    // Married with no joint-or-separate election: no single liability
    // exists, and the fork must say "blocked", not invent one.
    expect(married.evaluation.liability).toBeNull();
    expect(married.evaluation.blocked).toContain('filing-status-election');
    expect(single.evaluation.liability).not.toBeNull();
    expect(result.blockedDiffers.map((b) => b.item)).toContain('filing-status-election');
    expect(result.alsoChanges).toContain('filing-status');
  });
});

describe('rankUnknowns', () => {
  it('puts the deciding fact first and a consequence-free fact last', () => {
    // parents-claimed-me is asserted-unknown but nothing computes from it
    // yet — it must price at $0 and sink below the support fork. Short
    // gains in the mix so the support fork carries real dollars.
    const facts = [
      ...p2().filter((a) => a.factId !== 'realized-long-gains'),
      make('realized-short-gains', { kind: 'number', value: 3100 }),
      make('parents-claimed-me', { kind: 'unknown' }),
    ];
    const ranked = rankUnknowns(facts, 2026);

    const support = ranked.find((r) => r.at === 'self-support-share-pct');
    const claimedFlag = ranked.find((r) => r.at === 'parents-claimed-me');
    if (!support || !claimedFlag) throw new Error('expected both ranked');

    expect(support.delta).toBeGreaterThan(0);
    expect(claimedFlag.delta).toBe(0);
    expect(ranked.indexOf(support)).toBeLessThan(ranked.indexOf(claimedFlag));
  });

  it('is deterministic across runs', () => {
    const facts = [...p2(), make('parents-claimed-me', { kind: 'unknown' })];
    const a = rankUnknowns(facts, 2026);
    const b = rankUnknowns(facts, 2026);
    expect(a).toEqual(b);
  });

  it('includes never-asked facts the determinations wanted, not only shrugs', () => {
    // No marital facts at all: filing status names 'married' as missing,
    // and the ranking must offer it without an explicit unknown assertion.
    const facts = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('birth-date', { kind: 'date', value: '2000-05-01' }),
      make('w2-wages', { kind: 'number', value: 42000 }),
    ];
    const ranked = rankUnknowns(facts, 2026);
    expect(ranked.some((r) => r.at === 'married')).toBe(true);
  });
});

describe('the root fork, wired through', () => {
  /** P3's shape: an F-1 in year three, campus wages on file. */
  const f1 = () => [
    make('us-citizen', { kind: 'bool', value: false }),
    make('green-card-holder', { kind: 'bool', value: false }),
    make('visa-type', { kind: 'string', value: 'F' }),
    make('visa-first-entry-year', { kind: 'number', value: 2024 }),
    make('married', { kind: 'bool', value: false }),
    make('birth-date', { kind: 'date', value: '2004-08-20' }),
    make('full-time-student-months', { kind: 'number', value: 9 }),
    make('w2-wages', { kind: 'number', value: 12000 }),
  ];

  it('computes a nonresident year as the 1040-NR — no standard deduction, ever', () => {
    // Before E1 this asserted the year was blocked; the flip to a computed
    // 1040-NR is E1's acceptance. The shape is the point: taxed from the
    // first dollar, because the standard deduction does not exist here.
    const result = evaluateYear(f1(), 2026);
    expect(result.residency.status).toBe('nonresident');
    expect(result.blocked).not.toContain('form-1040nr');
    if (result.liability === null) throw new Error('expected the 1040-NR liability');
    expect(result.liability.deduction).toBe(0);
    expect(result.liability.taxableIncome).toBe(12000);
    expect(JSON.stringify(result.notes)).toContain('1040-NR');
    expect(result.nonresident?.status).toBe('computed');
  });

  it('feeds residency into dependency without a hand-asserted fact', () => {
    // The chain live: nonresident fails the citizen-or-resident test, so
    // nobody can claim them — no fixture asserting the derived fact by hand.
    const result = evaluateYear(f1(), 2026);
    expect(result.dependency.canBeClaimed).toBe('no');
    expect(result.dependency.failedTests).toContain('citizen-or-resident');
  });

  it('refuses to default an unanswered residency question to resident rates', () => {
    const facts = [
      make('married', { kind: 'bool', value: false }),
      make('w2-wages', { kind: 'number', value: 42000 }),
    ];
    const result = evaluateYear(facts, 2026);
    expect(result.residency.status).toBe('unknown');
    expect(result.liability).toBeNull();
    expect(result.blocked).toContain('residency-unknown');
  });

  it('prices the root fork itself: citizenship flips the whole return', () => {
    const facts = [
      ...f1().filter((a) => a.factId !== 'us-citizen'),
      make('us-citizen', { kind: 'unknown' }),
    ];
    const result = fork(facts, 2026, 'us-citizen');
    if (!result.ok) throw new Error('fork refused');

    const citizen = result.branches.find(
      (b) => b.assumed.kind === 'bool' && b.assumed.value === true,
    );
    const alien = result.branches.find(
      (b) => b.assumed.kind === 'bool' && b.assumed.value === false,
    );
    if (!citizen || !alien) throw new Error('expected both branches');

    expect(citizen.evaluation.liability).not.toBeNull();
    // Since E1 BOTH branches compute — the root fork is priced in dollars
    // now, not in blocked forms: the citizen's standard deduction shelters
    // the $12,000 entirely; the nonresident pays income tax from the
    // first dollar (10% to the bracket top: $1,200).
    expect(alien.evaluation.liability).not.toBeNull();
    expect(alien.evaluation.liability?.deduction).toBe(0);
    expect(citizen.evaluation.liability?.incomeTax).toBe(0);
    expect(alien.evaluation.liability?.incomeTax).toBeCloseTo(1200, 0);
    expect(result.delta).toBeGreaterThan(0);
    expect(result.alsoChanges).toContain('residency-status');
  });
});

describe('the evaluation beneath it', () => {
  it('limits a claimed dependent standard deduction to earned income plus the add-on', () => {
    const facts = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('married', { kind: 'bool', value: false }),
      make('birth-date', { kind: 'date', value: '2006-03-10' }),
      make('full-time-student-months', { kind: 'number', value: 9 }),
      make('lived-with-parents-months', { kind: 'number', value: 12 }),
      make('self-support-share-pct', { kind: 'number', value: 20 }),
      make('w2-wages', { kind: 'number', value: 8000 }),
    ];
    const result = evaluateYear(facts, 2026);
    expect(result.dependency.canBeClaimed).toBe('yes');
    expect(JSON.stringify(result.notes)).toContain('8450'); // 8000 + 450
    expect(result.liability).not.toBeNull();
  });

  it('refuses a year with no data rather than borrowing figures', () => {
    const facts = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('married', { kind: 'bool', value: false }),
      make('w2-wages', { kind: 'number', value: 42000 }),
    ].map((a) => ({ ...a, taxYear: 2019 }));
    const result = evaluateYear(facts, 2019);
    expect(result.liability).toBeNull();
    expect(result.blocked).toContain('year-data');
  });
});
