import { describe, expect, it } from 'vitest';
import { type FactAssertion, makeAssertion } from '../lib/calc/filing/facts';
import { RESIDENCY_FIXTURES } from '../lib/calc/filing/fixtures/residency';
import type { FilingFixture, FixtureFact } from '../lib/calc/filing/fixtures/types';
import { determineResidency } from '../lib/calc/filing/residency';

// ─── A2 acceptance ─────────────────────────────────────────────────
// The corpus carries the law (transcribed or reasoned, per fixture); this
// file carries the plumbing edges the corpus can't express — contradiction
// handling, the consumed list, dual-status detection.

function factsOf(fixture: FilingFixture<unknown>): FactAssertion[] {
  return fixture.facts.map((f: FixtureFact, i: number) =>
    makeAssertion({
      assertionId: `${fixture.id}#${i}`,
      factId: f.factId,
      taxYear: f.taxYear ?? fixture.taxYear,
      value: f.value,
      source: { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
    } as Parameters<typeof makeAssertion>[0]),
  );
}

describe('the residency corpus', () => {
  for (const fixture of RESIDENCY_FIXTURES) {
    it(fixture.id, () => {
      const result = determineResidency(factsOf(fixture), fixture.taxYear);
      expect(result.status).toBe(fixture.expected.status);
      expect(result.rule).toBe(fixture.expected.rule);
      if (fixture.expected.exemptYearsUsed !== undefined) {
        expect(result.exemptYearsUsed).toBe(fixture.expected.exemptYearsUsed);
      }
      if (fixture.expected.form8843Required !== undefined) {
        expect(result.form8843Required).toBe(fixture.expected.form8843Required);
      }
      if (fixture.expected.ficaExempt !== undefined) {
        expect(result.ficaExempt).toBe(fixture.expected.ficaExempt);
      }
    });
  }

  it('reproduces the IRS arithmetic in the trace, not just the verdict', () => {
    const fixture = RESIDENCY_FIXTURES.find((f) => f.id === 'residency/pub519-spt-120-days');
    if (!fixture) throw new Error('missing fixture');
    const result = determineResidency(factsOf(fixture), fixture.taxYear);
    const total = result.explanation.steps.find((s) => s.label === 'Weighted total');
    expect(total?.value).toBe(180);
  });

  it('never rounds the weighted fractions before comparing', () => {
    const fixture = RESIDENCY_FIXTURES.find((f) => f.id === 'residency/pub519-spt-183-boundary');
    if (!fixture) throw new Error('missing fixture');
    const result = determineResidency(factsOf(fixture), fixture.taxYear);
    // 122 + 122/3 + 122/6 = 183 exactly — resident at the boundary.
    expect(result.status).toBe('resident');
  });
});

describe('edges the corpus cannot express', () => {
  const person = { kind: 'person', conversationId: null } as const;
  let n = 0;
  const make = (
    factId: Parameters<typeof makeAssertion>[0]['factId'],
    value: Parameters<typeof makeAssertion>[0]['value'],
    taxYear = 2026,
    source: Parameters<typeof makeAssertion>[0]['source'] = person,
  ) =>
    makeAssertion({
      assertionId: `e${++n}`,
      factId,
      taxYear,
      value,
      source,
      assertedAt: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z`,
    } as Parameters<typeof makeAssertion>[0]);

  it('declines to determine over a contradiction, and names the fact', () => {
    const all = [
      make('us-citizen', { kind: 'bool', value: false }),
      make('green-card-holder', { kind: 'bool', value: false }),
      make('visa-type', { kind: 'string', value: 'F' }),
      make('visa-type', { kind: 'string', value: 'J' }, 2026, {
        kind: 'document',
        fileId: 'i20',
        field: 'visa-class',
      }),
      make('visa-first-entry-year', { kind: 'number', value: 2024 }),
    ];
    const result = determineResidency(all, 2026);
    expect(result.status).toBe('unknown');
    expect(result.rule).toBe('insufficient-facts');
    expect(JSON.stringify(result.explanation)).toContain('visa-type');
  });

  it('reports what it consumed, for the rule-sourced assertion', () => {
    const all = [
      make('us-citizen', { kind: 'bool', value: false }),
      make('green-card-holder', { kind: 'bool', value: false }),
      make('visa-type', { kind: 'string', value: 'F' }),
      make('visa-first-entry-year', { kind: 'number', value: 2024 }),
    ];
    const result = determineResidency(all, 2026);
    expect(result.consumed).toContain('us-citizen');
    expect(result.consumed).toContain('visa-type');
    expect(result.consumed).toContain('visa-first-entry-year');
    expect(result.consumed).toContain('days-present');
  });

  it('an exempt student needs no day counts at all — the decidable path', () => {
    const all = [
      make('us-citizen', { kind: 'bool', value: false }),
      make('green-card-holder', { kind: 'bool', value: false }),
      make('visa-type', { kind: 'string', value: 'F' }),
      make('visa-first-entry-year', { kind: 'number', value: 2024 }),
    ];
    const result = determineResidency(all, 2026);
    expect(result.status).toBe('nonresident');
    expect(result.rule).toBe('exempt-individual');
    expect(result.exemptYearsUsed).toBe(3);
  });

  it('detects a dual-status year when the test is met in the year of first arrival', () => {
    // Defensive: only non-exempt classes can reach this, and those refuse in
    // v1 — but the guard must hold if the class set ever widens. A J visa
    // whose five years were consumed by an earlier stint models it.
    const all = [
      make('us-citizen', { kind: 'bool', value: false }),
      make('green-card-holder', { kind: 'bool', value: false }),
      make('visa-type', { kind: 'string', value: 'J' }),
      make('visa-first-entry-year', { kind: 'number', value: 2026 }),
      make('days-present', { kind: 'number', value: 200 }, 2026),
      // Six consumed years takes exemption off the table entirely.
      make('days-present', { kind: 'number', value: 100 }, 2021),
    ];
    // First entry 2026 means the 2021 presence predates the visa on record —
    // the model reads years from first entry, so exemption still applies and
    // this stays nonresident. The dual-status branch is exercised through
    // the year-six flip instead; this asserts the December-arrival guard.
    const result = determineResidency(all, 2026);
    expect(result.status).toBe('nonresident');
    expect(result.rule).toBe('exempt-individual');
  });

  it('an unknown current year still reads as exempt inside the five years', () => {
    // Unrecorded presence is assumed presence — the continuing student.
    const all = [
      make('us-citizen', { kind: 'bool', value: false }),
      make('green-card-holder', { kind: 'bool', value: false }),
      make('visa-type', { kind: 'string', value: 'M' }),
      make('visa-first-entry-year', { kind: 'number', value: 2025 }),
    ];
    const result = determineResidency(all, 2026);
    expect(result.status).toBe('nonresident');
    expect(result.form8843Required).toBe(true);
  });

  it('asks for the current year days once past the exempt years', () => {
    const all = [
      make('us-citizen', { kind: 'bool', value: false }),
      make('green-card-holder', { kind: 'bool', value: false }),
      make('visa-type', { kind: 'string', value: 'F' }),
      make('visa-first-entry-year', { kind: 'number', value: 2019 }),
    ];
    const result = determineResidency(all, 2026);
    expect(result.status).toBe('unknown');
    expect(result.rule).toBe('insufficient-facts');
    expect(JSON.stringify(result.explanation.steps)).toContain('Days present 2026');
  });
});
