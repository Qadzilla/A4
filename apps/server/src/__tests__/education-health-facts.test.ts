import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { dependents, makeAssertion } from '../lib/calc/filing/facts';
import {
  type ExtractedEducationHealthForm,
  type StoredEducationHealthRow,
  liveEducationHealthRows,
  planEducationHealthFacts,
} from '../services/education-health-facts';
import { educationHealthExtractionSchema } from '../services/extract-education-health';

// ─── C4 acceptance ─────────────────────────────────────────────────
// Box 1 and box 5 assert separately and the engine derives the trap;
// billed is not paid; a transfer year's schools aggregate per student;
// and the 1095-A's monthly table survives with printed zeros distinct
// from blanks — the hardest extraction in C-phase, defended at the
// schema level.

const NOW = '2026-08-02T12:00:00.000Z';

let n = 0;
function form(
  kind: StoredEducationHealthRow['kind'],
  over: Partial<StoredEducationHealthRow> & {
    t1098?: ExtractedEducationHealthForm['t1098'];
    e1098?: ExtractedEducationHealthForm['e1098'];
    a1095?: ExtractedEducationHealthForm['a1095'];
  } = {},
): StoredEducationHealthRow {
  n += 1;
  return {
    fileId: over.fileId ?? `file-${n}`,
    kind,
    issuerTin: over.issuerTin !== undefined ? over.issuerTin : `55-00000${n}`,
    corrected: over.corrected ?? false,
    createdAt: over.createdAt ?? n,
    extracted: {
      kind,
      issuerName: `Issuer ${n}`,
      issuerTin: over.issuerTin !== undefined ? over.issuerTin : `55-00000${n}`,
      corrected: over.corrected ?? false,
      taxYear: 2026,
      t1098: over.t1098 ?? null,
      e1098: over.e1098 ?? null,
      a1095: over.a1095 ?? null,
    },
  };
}

const t = (box1: number | null, box5: number | null, box2: number | null = null) => ({
  box1,
  box2,
  box5,
  box8HalfTime: true,
  box9Graduate: false,
});

function plan(live: StoredEducationHealthRow[]) {
  return planEducationHealthFacts({
    live,
    prevLive: [],
    taxYear: 2026,
    triggeringFileId: live[live.length - 1]?.fileId ?? 'file-x',
    nowIso: NOW,
  });
}

describe('the taxable-scholarship trap', () => {
  it('box 5 above box 1 derives income, rule-sourced and chain-walkable', () => {
    const out = plan([form('1098-T', { t1098: t(1800, 3000) })]);
    const byId = new Map(out.map((a) => [a.factId, a]));

    expect(byId.get('qualified-tuition-paid')?.value).toEqual({ kind: 'number', value: 1800 });
    expect(byId.get('scholarships-received')?.value).toEqual({ kind: 'number', value: 3000 });

    const trap = byId.get('taxable-scholarship-income');
    if (!trap) throw new Error('expected the derivation');
    expect(trap.value).toEqual({ kind: 'number', value: 1200 });
    expect(trap.source.kind).toBe('rule');

    // Doctrine 8's chain: change what the school reported, and the
    // derivation is downstream of both inputs.
    expect(dependents(out, 'scholarships-received')).toContain('taxable-scholarship-income');
    expect(dependents(out, 'qualified-tuition-paid')).toContain('taxable-scholarship-income');
  });

  it('scholarships fully sheltered by tuition derive zero, not absence', () => {
    const out = plan([form('1098-T', { t1098: t(6500, 3000) })]);
    const trap = out.find((a) => a.factId === 'taxable-scholarship-income');
    expect(trap?.value).toEqual({ kind: 'number', value: 0 });
  });

  it('a legacy billed-only school asserts what is printed and derives nothing', () => {
    const out = plan([form('1098-T', { t1098: t(null, 3000, 5200) })]);
    const byId = new Map(out.map((a) => [a.factId, a]));
    expect(byId.get('tuition-billed-legacy')?.value).toEqual({ kind: 'number', value: 5200 });
    expect(byId.has('qualified-tuition-paid')).toBe(false);
    // Billed is not paid — D1 owns the interpretation, nothing derives here.
    expect(byId.has('taxable-scholarship-income')).toBe(false);
  });

  it('cruel case: a transfer year aggregates per student, not per school', () => {
    const out = plan([
      form('1098-T', { t1098: t(4000, 2500) }),
      form('1098-T', { t1098: t(2500, 4500) }),
    ]);
    const byId = new Map(out.map((a) => [a.factId, a]));
    expect(byId.get('qualified-tuition-paid')?.value).toEqual({ kind: 'number', value: 6500 });
    expect(byId.get('scholarships-received')?.value).toEqual({ kind: 'number', value: 7000 });
    // Neither school alone shows the trap; the student's year does: $500.
    expect(byId.get('taxable-scholarship-income')?.value).toEqual({ kind: 'number', value: 500 });
    if (byId.get('qualified-tuition-paid')?.source.kind === 'document') {
      expect((byId.get('qualified-tuition-paid')?.source as { field: string }).field).toContain(
        'across 2 schools',
      );
    }
  });

  it('a corrected 1098-T retires its predecessor by school TIN', () => {
    const live = liveEducationHealthRows([
      form('1098-T', { issuerTin: '55-1111111', t1098: t(1800, 3000), fileId: 'jan' }),
      form('1098-T', {
        issuerTin: '55-1111111',
        corrected: true,
        createdAt: 99,
        t1098: t(2400, 3000),
        fileId: 'mar',
      }),
    ]);
    expect(live.map((f) => f.fileId)).toEqual(['mar']);
    const out = plan(live);
    expect(out.find((a) => a.factId === 'taxable-scholarship-income')?.value).toEqual({
      kind: 'number',
      value: 600,
    });
  });
});

describe('the quiet deduction and the blocker', () => {
  it('1098-E asserts the interest total and corroborates the bool', () => {
    const out = plan([
      form('1098-E', { e1098: { box1: 410 } }),
      form('1098-E', { e1098: { box1: 220 } }),
    ]);
    const byId = new Map(out.map((a) => [a.factId, a]));
    expect(byId.get('student-loan-interest-paid')?.value).toEqual({ kind: 'number', value: 630 });
    expect(byId.get('paid-student-loan-interest')?.value).toEqual({ kind: 'bool', value: true });
  });

  it('a 1095-A corroborates coverage and asserts no sums — D3 reads months', () => {
    const out = plan([
      form('1095-A', {
        a1095: {
          months: [
            { month: 1, premium: 320, slcsp: 310, aptc: 260 },
            { month: 2, premium: 320, slcsp: 310, aptc: 260 },
          ],
        },
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.factId).toBe('marketplace-health-insurance');
    expect(out[0]?.value).toEqual({ kind: 'bool', value: true });
  });
});

describe('monthly fidelity at the schema boundary', () => {
  it('keeps a printed zero and a blank distinct through validation', () => {
    const parsed = educationHealthExtractionSchema.parse({
      kind: '1095-A',
      issuerName: 'Marketplace',
      issuerTin: '99-1234567',
      corrected: false,
      taxYear: 2026,
      t1098: null,
      e1098: null,
      a1095: {
        months: [
          { month: 1, premium: 320.5, slcsp: 310.25, aptc: 260 },
          { month: 2, premium: 320.5, slcsp: 310.25, aptc: 0 }, // printed $0
          { month: 3, premium: 320.5, slcsp: null, aptc: null }, // blanks
        ],
      },
    });
    const months = parsed.a1095?.months ?? [];
    expect(months[1]?.aptc).toBe(0);
    expect(months[2]?.aptc).toBeNull();
    expect(months[2]?.slcsp).toBeNull();
    expect(months[0]?.premium).toBe(320.5);
  });

  it('rejects a thirteenth month and out-of-range month numbers', () => {
    const base = {
      kind: '1095-A' as const,
      issuerName: 'Marketplace',
      issuerTin: '99-1234567',
      corrected: false,
      taxYear: 2026,
      t1098: null,
      e1098: null,
    };
    const thirteen = Array.from({ length: 13 }, (_, i) => ({
      month: (i % 12) + 1,
      premium: 100,
      slcsp: 100,
      aptc: 50,
    }));
    expect(
      educationHealthExtractionSchema.safeParse({ ...base, a1095: { months: thirteen } }).success,
    ).toBe(false);
    expect(
      educationHealthExtractionSchema.safeParse({
        ...base,
        a1095: { months: [{ month: 13, premium: 100, slcsp: 100, aptc: 50 }] },
      }).success,
    ).toBe(false);
  });
});

describe('the trap reaches the liability', () => {
  it('taxable scholarship raises AGI as income', () => {
    let m = 0;
    const make = (
      factId: Parameters<typeof makeAssertion>[0]['factId'],
      value: Parameters<typeof makeAssertion>[0]['value'],
    ) =>
      makeAssertion({
        assertionId: `s${++m}`,
        factId,
        taxYear: 2026,
        value,
        source:
          factId === 'taxable-scholarship-income'
            ? {
                kind: 'rule',
                ruleId: 'c4/taxable-scholarship',
                consumed: ['scholarships-received', 'qualified-tuition-paid'],
              }
            : { kind: 'person', conversationId: null },
        assertedAt: `2026-01-01T00:00:${String(m).padStart(2, '0')}Z`,
        supersedes: null,
      } as Parameters<typeof makeAssertion>[0]);

    const result = evaluateYear(
      [
        make('us-citizen', { kind: 'bool', value: true }),
        make('married', { kind: 'bool', value: false }),
        make('birth-date', { kind: 'date', value: '1999-06-01' }),
        make('gross-income', { kind: 'number', value: 42000 }),
        make('w2-wages', { kind: 'number', value: 42000 }),
        make('full-time-student-months', { kind: 'number', value: 0 }),
        make('taxable-scholarship-income', { kind: 'number', value: 1200 }),
      ],
      2026,
    );
    if (result.liability === null) throw new Error('expected liability');
    expect(result.liability.agi).toBe(43200);
  });
});
