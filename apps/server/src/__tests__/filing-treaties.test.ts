import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { makeAssertion } from '../lib/calc/filing/facts';
import { TREATY_FIXTURES } from '../lib/calc/filing/fixtures/treaties';
import { assertionsOf } from '../lib/calc/filing/fixtures/types';
import { determineTreatyBenefits } from '../lib/calc/filing/treaties';

// ─── E3 acceptance ─────────────────────────────────────────────────
// The corpus pins the table (two coded benefits, the teaching refusals,
// clean nothing everywhere else); this file adds the money — India
// zeroing P3's tax on the 1040-NR, China's $5,000 off the top of a
// nonresident's wages, and the survival case: the same exemption on a
// plain 1040 after the residency flip.

describe('the treaty corpus', () => {
  for (const fixture of TREATY_FIXTURES) {
    it(fixture.id, () => {
      const result = determineTreatyBenefits(assertionsOf(fixture), fixture.taxYear);

      expect(result.benefits, 'benefit count').toHaveLength(fixture.expected.benefitCount);
      const first = result.benefits[0];
      if (fixture.expected.kind !== undefined) {
        expect(first?.kind, 'kind').toBe(fixture.expected.kind);
      }
      if (fixture.expected.amount !== undefined) {
        expect(first?.amount, 'amount').toBe(fixture.expected.amount);
      }
      if (fixture.expected.survivesResidency !== undefined) {
        expect(first?.survivesResidency, 'survives').toBe(fixture.expected.survivesResidency);
      }
      if (fixture.expected.requires8833 !== undefined) {
        expect(first?.requires8833, '8833').toBe(fixture.expected.requires8833);
      }
      if (fixture.expected.refusalsContain !== undefined) {
        expect(JSON.stringify(result.refusals)).toContain(fixture.expected.refusalsContain);
      }
      if (fixture.expected.notesContain !== undefined) {
        expect(JSON.stringify(result.explanation.notes)).toContain(fixture.expected.notesContain);
      }
    });
  }

  it('every coded benefit carries a citation and the 8833 flag', () => {
    for (const country of ['IN', 'CN']) {
      const facts = [
        makeAssertion({
          assertionId: `cite-${country}-1`,
          factId: 'citizenship-country',
          taxYear: 2026,
          value: { kind: 'string', value: country },
          source: { kind: 'person', conversationId: null },
          assertedAt: '2026-01-01T00:00:00Z',
          supersedes: null,
        } as Parameters<typeof makeAssertion>[0]),
        makeAssertion({
          assertionId: `cite-${country}-2`,
          factId: 'visa-type',
          taxYear: 2026,
          value: { kind: 'string', value: 'F' },
          source: { kind: 'person', conversationId: null },
          assertedAt: '2026-01-01T00:00:01Z',
          supersedes: null,
        } as Parameters<typeof makeAssertion>[0]),
      ];
      for (const b of determineTreatyBenefits(facts, 2026).benefits) {
        expect(b.citation.length, `${b.country} citation`).toBeGreaterThan(20);
        expect(typeof b.requires8833, `${b.country} 8833 flag`).toBe('boolean');
      }
    }
  });
});

describe('the wiring', () => {
  let n = 0;
  const make = (
    factId: Parameters<typeof makeAssertion>[0]['factId'],
    value: Parameters<typeof makeAssertion>[0]['value'],
  ) =>
    makeAssertion({
      assertionId: `tw${++n}`,
      factId,
      taxYear: 2026,
      value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
      supersedes: null,
    } as Parameters<typeof makeAssertion>[0]);

  const student = (country: string, entryYear = 2024) => [
    make('us-citizen', { kind: 'bool', value: false }),
    make('green-card-holder', { kind: 'bool', value: false }),
    make('visa-type', { kind: 'string', value: 'F' }),
    make('visa-first-entry-year', { kind: 'number', value: entryYear }),
    make('citizenship-country', { kind: 'string', value: country }),
    make('married', { kind: 'bool', value: false }),
    make('full-time-student-months', { kind: 'number', value: 9 }),
  ];

  it("India's treaty is worth P3's entire tax bill on the 1040-NR", () => {
    const result = evaluateYear(
      [...student('IN'), make('w2-wages', { kind: 'number', value: 12000 })],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    expect(result.liability.deduction).toBe(16100);
    expect(result.liability.taxableIncome).toBe(0);
    expect(result.liability.incomeTax).toBe(0);
    expect(JSON.stringify(result.notes)).toContain('21(2)');
    // The same facts minus the passport: $1,200 of tax. The treaty IS the
    // difference, and the note prices it.
    const noTreaty = evaluateYear(
      [
        ...student('IN').filter((a) => a.factId !== 'citizenship-country'),
        make('w2-wages', { kind: 'number', value: 12000 }),
      ],
      2026,
    );
    expect(noTreaty.liability?.incomeTax).toBeCloseTo(1200, 0);
  });

  it("China's $5,000 comes off the top of a nonresident's wages", () => {
    const result = evaluateYear(
      [...student('CN'), make('w2-wages', { kind: 'number', value: 12000 })],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    expect(result.liability.taxableIncome).toBe(7000);
    expect(result.liability.incomeTax).toBeCloseTo(700, 0);
    expect(result.treaties?.benefits[0]?.survivesResidency).toBe(true);
  });

  it('the survival case: the exemption follows the student onto a plain 1040', () => {
    const result = evaluateYear(
      [
        ...student('CN', 2021), // 2021–2025 consumed the exempt years
        make('days-present', { kind: 'number', value: 330 }),
        make('gross-income', { kind: 'number', value: 30000 }),
        make('w2-wages', { kind: 'number', value: 30000 }),
      ],
      2026,
    );
    expect(result.residency.status).toBe('resident');
    if (result.liability === null) throw new Error('expected liability');
    // $5,000 out before AGI; the resident standard deduction on top.
    expect(result.liability.agi).toBe(25000);
    expect(result.liability.deduction).toBe(16100);
    expect(result.liability.taxableIncome).toBe(8900);
    expect(JSON.stringify(result.notes)).toContain('survives');

    // The Indian twin gets nothing here — 21(2) does not survive the flip
    // (and a resident has the standard deduction anyway).
    const indian = evaluateYear(
      [
        ...student('IN', 2021),
        make('days-present', { kind: 'number', value: 330 }),
        make('gross-income', { kind: 'number', value: 30000 }),
        make('w2-wages', { kind: 'number', value: 30000 }),
      ],
      2026,
    );
    expect(indian.liability?.agi).toBe(30000);
    expect(indian.treaties).toBeNull();
  });

  it('a named-but-uncoded treaty teaches instead of applying', () => {
    const result = evaluateYear(
      [...student('KR'), make('w2-wages', { kind: 'number', value: 12000 })],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    // Nothing applied: full nonresident arithmetic…
    expect(result.liability.deduction).toBe(0);
    expect(result.liability.taxableIncome).toBe(12000);
    // …and the refusal names the country's article so the person can ask.
    expect(JSON.stringify(result.notes)).toContain('Article 21');
    expect(JSON.stringify(result.notes)).toContain('preparer');
  });
});
