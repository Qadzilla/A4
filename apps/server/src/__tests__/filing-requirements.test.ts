import { describe, expect, it } from 'vitest';
import { makeAssertion } from '../lib/calc/filing/facts';
import { SCOPE, expectations, requiredForms } from '../lib/calc/filing/requirements';

// ─── A5 acceptance ─────────────────────────────────────────────────
// The two lists everything runs on: what should arrive, and what the year
// requires. The cruel cases from the contract: income without paper still
// creates requirements; holding without selling creates nothing; a
// superseded fact takes its expectations with it; and every unsupported
// form refuses with an explanation, never silently.

let n = 0;
const make = (
  factId: Parameters<typeof makeAssertion>[0]['factId'],
  value: Parameters<typeof makeAssertion>[0]['value'],
  taxYear = 2026,
  supersedes: string | null = null,
  assertionId?: string,
) =>
  makeAssertion({
    assertionId: assertionId ?? `a${++n}`,
    factId,
    taxYear,
    value,
    source: { kind: 'person', conversationId: null },
    assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
    supersedes,
  } as Parameters<typeof makeAssertion>[0]);

const citizen = () => [
  make('us-citizen', { kind: 'bool', value: true }),
  make('married', { kind: 'bool', value: false }),
];

describe('expectations', () => {
  it('P1: one W-2, nothing else', () => {
    const facts = [...citizen(), make('w2-employer-count', { kind: 'number', value: 1 })];
    const docs = expectations(facts, 2026);
    expect(docs.map((d) => d.document)).toEqual(['W-2']);
    expect(docs[0]?.mandatory).toBe(true);
    expect(docs[0]?.arrivesBy).toBe('2027-01-31');
  });

  it('names every employer when there are several', () => {
    const facts = [...citizen(), make('w2-employer-count', { kind: 'number', value: 3 })];
    const docs = expectations(facts, 2026);
    expect(docs[0]?.from).toContain('3 employers');
  });

  it('a brokerage that only held produces no paperwork at all', () => {
    const facts = [...citizen(), make('brokerage-account', { kind: 'bool', value: true })];
    expect(expectations(facts, 2026)).toEqual([]);
  });

  it('a sale fact turns the same brokerage into a 1099-B expectation', () => {
    const facts = [
      ...citizen(),
      make('brokerage-account', { kind: 'bool', value: true }),
      make('sold-investments', { kind: 'bool', value: true }),
    ];
    const docs = expectations(facts, 2026);
    expect(docs.map((d) => d.document)).toEqual(['1099-B']);
    // Brokerage paper runs on the February cycle, not January's.
    expect(docs[0]?.arrivesBy).toBe('2027-02-15');
  });

  it('P4: $1,800 of gig income produces no expectation in 2026 — the form will never come', () => {
    const facts = [...citizen(), make('contract-income', { kind: 'number', value: 1800 })];
    expect(expectations(facts, 2026)).toEqual([]);
  });

  it('the same $1,800 in 2025 was above that year’s $600 threshold — year data decides', () => {
    const facts = [
      make('us-citizen', { kind: 'bool', value: true }, 2025),
      make('married', { kind: 'bool', value: false }, 2025),
      make('contract-income', { kind: 'number', value: 1800 }, 2025),
    ];
    const docs = expectations(facts, 2025);
    expect(docs.map((d) => d.document)).toEqual(['1099-NEC']);
    expect(docs[0]?.mandatory).toBe(false); // per-payer threshold — may still not come
  });

  it('marks the 1095-A mandatory — the return cannot finish without it', () => {
    const facts = [
      ...citizen(),
      make('marketplace-health-insurance', { kind: 'bool', value: true }),
    ];
    const docs = expectations(facts, 2026);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.document).toBe('1095-A');
    expect(docs[0]?.mandatory).toBe(true);
  });

  it('expects a 1042-S only for a nonresident scholarship', () => {
    const f1 = [
      make('us-citizen', { kind: 'bool', value: false }),
      make('green-card-holder', { kind: 'bool', value: false }),
      make('visa-type', { kind: 'string', value: 'F' }),
      make('visa-first-entry-year', { kind: 'number', value: 2024 }),
      make('scholarship-income', { kind: 'bool', value: true }),
    ];
    const docs = expectations(f1, 2026);
    expect(docs.map((d) => d.document)).toContain('1042-S');

    const resident = [...citizen(), make('scholarship-income', { kind: 'bool', value: true })];
    expect(expectations(resident, 2026).map((d) => d.document)).not.toContain('1042-S');
  });

  it('a superseded fact takes its expectation with it', () => {
    const sold = make('sold-investments', { kind: 'bool', value: true }, 2026, null, 'sold-1');
    const facts = [...citizen(), make('brokerage-account', { kind: 'bool', value: true }), sold];
    expect(expectations(facts, 2026).map((d) => d.document)).toEqual(['1099-B']);

    const corrected = [
      ...facts,
      make('sold-investments', { kind: 'bool', value: false }, 2026, 'sold-1'),
    ];
    expect(expectations(corrected, 2026)).toEqual([]);
  });

  it('every expectation names the facts it stands on', () => {
    const facts = [
      ...citizen(),
      make('w2-employer-count', { kind: 'number', value: 1 }),
      make('unemployment-income', { kind: 'number', value: 3200 }),
      make('retirement-distribution', { kind: 'number', value: 9000 }),
    ];
    for (const doc of expectations(facts, 2026)) {
      expect(doc.because.length).toBeGreaterThan(0);
    }
  });
});

describe('required forms', () => {
  it('P4: requirements without expectations — the design asymmetry', () => {
    const facts = [...citizen(), make('contract-income', { kind: 'number', value: 1800 })];
    expect(expectations(facts, 2026)).toEqual([]); // no paper will come
    const forms = requiredForms(facts, [], 2026).map((f) => f.form);
    expect(forms).toContain('sch-c'); // the income is taxable anyway
    expect(forms).toContain('sch-se'); // and carries SE tax at $400+
  });

  it('keeps Schedule SE off a sub-$400 year', () => {
    const facts = [...citizen(), make('contract-income', { kind: 'number', value: 350 })];
    const forms = requiredForms(facts, [], 2026).map((f) => f.form);
    expect(forms).toContain('sch-c');
    expect(forms).not.toContain('sch-se');
  });

  it('P3: a nonresident year requires the 1040-NR and the 8843, not the 1040', () => {
    const f1 = [
      make('us-citizen', { kind: 'bool', value: false }),
      make('green-card-holder', { kind: 'bool', value: false }),
      make('visa-type', { kind: 'string', value: 'F' }),
      make('visa-first-entry-year', { kind: 'number', value: 2024 }),
    ];
    const forms = requiredForms(f1, [], 2026);
    const ids = forms.map((f) => f.form);
    expect(ids).toContain('form-1040-nr');
    expect(ids).toContain('form-8843');
    expect(ids).not.toContain('form-1040');
    // Both are honest refusals until E-phase.
    const nr = forms.find((f) => f.form === 'form-1040-nr');
    expect(nr?.supported).toBe(false);
    expect(nr?.ifUnsupported?.whatItMeans.length).toBeGreaterThan(0);
  });

  it('P2: the kiddie requirement rides the dependency machinery, with the amounts named', () => {
    const facts = [
      ...citizen(),
      make('birth-date', { kind: 'date', value: '2006-03-10' }),
      make('full-time-student-months', { kind: 'number', value: 9 }),
      make('lived-with-parents-months', { kind: 'number', value: 12 }),
      make('self-support-share-pct', { kind: 'number', value: 20 }),
      make('brokerage-account', { kind: 'bool', value: true }),
      make('sold-investments', { kind: 'bool', value: true }),
      make('realized-long-gains', { kind: 'number', value: 3100 }),
    ];
    const forms = requiredForms(facts, [], 2026);
    const kiddie = forms.find((f) => f.form === 'form-8615');
    if (!kiddie) throw new Error('expected the 8615 requirement');
    expect(kiddie.supported).toBe(false);
    expect(kiddie.ifUnsupported?.whyItApplies).toContain('$3100');
    expect(kiddie.ifUnsupported?.whyItApplies).toContain('$2700');
    expect(kiddie.ifUnsupported?.whatItMeans).toContain('kiddie');
  });

  it('P7: marketplace insurance requires the 8962 — supported since D3, no refusal text', () => {
    const facts = [
      ...citizen(),
      make('marketplace-health-insurance', { kind: 'bool', value: true }),
    ];
    const forms = requiredForms(facts, [], 2026);
    const ptc = forms.find((f) => f.form === 'form-8962');
    expect(ptc?.supported).toBe(true);
    expect(ptc?.ifUnsupported).toBeNull();
  });

  it('an arrived document can create a requirement the facts missed', () => {
    const facts = [...citizen()];
    const forms = requiredForms(facts, [{ kind: '1099-R', fileId: 'f1' }], 2026).map((f) => f.form);
    expect(forms).toContain('form-5329');
  });

  it('a supported state produces its return row, honestly unsupported until F-phase', () => {
    const facts = [...citizen(), make('state-of-residence', { kind: 'string', value: 'CA' })];
    const ca = requiredForms(facts, [], 2026).find((f) => f.form === 'state-ca-540');
    expect(ca?.supported).toBe(false);
    expect(ca?.ifUnsupported?.whyItApplies).toContain('CA');
  });

  it('digital-asset activity requires the sale forms with no document to stand on', () => {
    const facts = [...citizen(), make('digital-asset-activity', { kind: 'bool', value: true })];
    const forms = requiredForms(facts, [], 2026).map((f) => f.form);
    expect(forms).toContain('form-8949');
    expect(forms).toContain('sch-d');
    // And no expectation exists — crypto's paper trail mostly doesn't.
    expect(expectations(facts, 2026)).toEqual([]);
  });
});

describe('the scope object', () => {
  it('explains every unsupported form — the acceptance the appendix alarms on', () => {
    for (const [form, entry] of Object.entries(SCOPE.forms)) {
      if (!entry.supported) {
        expect(entry.whatItMeans.length, `${form} needs an explanation`).toBeGreaterThan(20);
        expect(entry.plannedAt, `${form} needs a planned slice`).toBeTruthy();
      }
    }
  });

  it('claims support only where a shipped feature backs it', () => {
    const supported = Object.entries(SCOPE.forms)
      .filter(([, e]) => e.supported)
      .map(([id]) => id)
      .sort();
    // The lot engine + exports build 8949/Sch D worksheets; the estimator
    // computes the 1040 core; D3 ships the 8962 reconciliation; D4 ships
    // the simple-expense Schedule C and the SE arithmetic. Nothing else
    // has shipped — nothing else claims.
    expect(supported).toEqual(['form-1040', 'form-8949', 'form-8962', 'sch-c', 'sch-d', 'sch-se']);
  });
});
