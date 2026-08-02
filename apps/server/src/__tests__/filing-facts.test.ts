import { describe, expect, it } from 'vitest';
import {
  type FactAssertion,
  contradictions,
  dependents,
  factSet,
  factState,
  liveAssertions,
  makeAssertion,
  nearestFactIds,
  validateAssertion,
} from '../lib/calc/filing/facts';

// ─── A1 acceptance, per BASIS_FILING.md ────────────────────────────
// The fact model is the surface every other slice stands on, so these are
// the cruel versions: supersession chains, the three-way distinction between
// never-asked / asked-and-unknown / answered, contradiction as a state
// rather than a crash, and staleness through rule provenance.

let n = 0;
function assert(
  overrides: Partial<FactAssertion> & Pick<FactAssertion, 'factId' | 'value'>,
): FactAssertion {
  n += 1;
  return makeAssertion({
    assertionId: overrides.assertionId ?? `a${n}`,
    factId: overrides.factId,
    taxYear: overrides.taxYear ?? 2026,
    value: overrides.value,
    source: overrides.source ?? { kind: 'person', conversationId: null },
    assertedAt: overrides.assertedAt ?? `2026-08-01T00:00:${String(n).padStart(2, '0')}Z`,
    supersedes: overrides.supersedes ?? null,
  } as Parameters<typeof makeAssertion>[0]);
}

const doc = (fileId: string, field: string) => ({ kind: 'document' as const, fileId, field });
const rule = (ruleId: string, consumed: Parameters<typeof dependents>[1][]) => ({
  kind: 'rule' as const,
  ruleId,
  consumed,
});

describe('supersession', () => {
  it('resolves a chain to the latest assertion', () => {
    const a = assert({
      assertionId: 'a',
      factId: 'days-present',
      value: { kind: 'number', value: 100 },
    });
    const b = assert({
      assertionId: 'b',
      factId: 'days-present',
      value: { kind: 'number', value: 200 },
      supersedes: 'a',
    });
    const c = assert({
      assertionId: 'c',
      factId: 'days-present',
      value: { kind: 'number', value: 300 },
      supersedes: 'b',
    });

    const live = liveAssertions([a, b, c]);
    expect(live).toEqual([c]);

    const state = factState(factSet([a, b, c], 2026), 'days-present');
    expect(state.status).toBe('known');
    if (state.status === 'known') expect(state.value).toEqual({ kind: 'number', value: 300 });
  });

  it('never lets a superseded assertion reach a fact set', () => {
    const a = assert({ assertionId: 'a', factId: 'married', value: { kind: 'bool', value: true } });
    const b = assert({
      assertionId: 'b',
      factId: 'married',
      value: { kind: 'bool', value: false },
      supersedes: 'a',
    });
    const set = factSet([a, b], 2026);
    const state = factState(set, 'married');
    expect(state.status).toBe('known');
    if (state.status === 'known') {
      expect(state.value.value).toBe(false);
      expect(state.assertions).toHaveLength(1);
    }
  });

  it('treats two branches superseding the same assertion as a contradiction, not a pick', () => {
    const a = assert({
      assertionId: 'a',
      factId: 'days-present',
      value: { kind: 'number', value: 90 },
    });
    const b = assert({
      assertionId: 'b',
      factId: 'days-present',
      value: { kind: 'number', value: 120 },
      supersedes: 'a',
    });
    const c = assert({
      assertionId: 'c',
      factId: 'days-present',
      value: { kind: 'number', value: 150 },
      supersedes: 'a',
    });
    const state = factState(factSet([a, b, c], 2026), 'days-present');
    expect(state.status).toBe('contradicted');
  });
});

describe('the three ways of not knowing the same thing', () => {
  it('distinguishes never-asked from asked-and-unknown from answered', () => {
    const askedUnknown = assert({ factId: 'self-support-share-pct', value: { kind: 'unknown' } });
    const answered = assert({
      factId: 'lived-with-parents-months',
      value: { kind: 'number', value: 6 },
    });
    const set = factSet([askedUnknown, answered], 2026);

    expect(factState(set, 'full-time-student-months').status).toBe('unasserted');
    expect(factState(set, 'self-support-share-pct').status).toBe('unknown');
    expect(factState(set, 'lived-with-parents-months').status).toBe('known');
  });

  it('lets a document answer what the person could not, keeping both assertions', () => {
    const shrug = assert({ factId: 'w2-employer-count', value: { kind: 'unknown' } });
    const w2 = assert({
      factId: 'w2-employer-count',
      value: { kind: 'number', value: 2 },
      source: doc('file-1', 'employer-count'),
    });
    const state = factState(factSet([shrug, w2], 2026), 'w2-employer-count');
    expect(state.status).toBe('known');
    if (state.status === 'known') {
      expect(state.value.value).toBe(2);
      expect(state.assertions).toHaveLength(2); // the shrug stays in the record
    }
  });
});

describe('contradiction', () => {
  it('is a state, not a resolution', () => {
    const person = assert({ factId: 'state-of-residence', value: { kind: 'string', value: 'CA' } });
    const w2 = assert({
      factId: 'state-of-residence',
      value: { kind: 'string', value: 'NY' },
      source: doc('file-w2', 'box-15-state'),
    });
    const set = factSet([person, w2], 2026);
    expect(factState(set, 'state-of-residence').status).toBe('contradicted');
    expect(contradictions(set)).toHaveLength(1);
    expect(contradictions(set)[0]?.factId).toBe('state-of-residence');
  });

  it('treats agreement across sources as corroboration, not contradiction', () => {
    const person = assert({ factId: 'state-of-residence', value: { kind: 'string', value: 'MA' } });
    const w2 = assert({
      factId: 'state-of-residence',
      value: { kind: 'string', value: 'MA' },
      source: doc('file-w2', 'box-15-state'),
    });
    const state = factState(factSet([person, w2], 2026), 'state-of-residence');
    expect(state.status).toBe('known');
    if (state.status === 'known') expect(state.assertions).toHaveLength(2);
  });

  it('resolves a contradiction only by superseding one side', () => {
    const person = assert({
      assertionId: 'p',
      factId: 'state-of-residence',
      value: { kind: 'string', value: 'CA' },
    });
    const w2 = assert({
      assertionId: 'w',
      factId: 'state-of-residence',
      value: { kind: 'string', value: 'NY' },
      source: doc('file-w2', 'box-15-state'),
    });
    const correction = assert({
      factId: 'state-of-residence',
      value: { kind: 'string', value: 'NY' },
      supersedes: 'p',
    });
    const state = factState(factSet([person, w2, correction], 2026), 'state-of-residence');
    expect(state.status).toBe('known');
    if (state.status === 'known') expect(state.value.value).toBe('NY');
  });
});

describe('year scoping', () => {
  it('keeps the same fact apart across tax years', () => {
    const y25 = assert({
      factId: 'days-present',
      taxYear: 2025,
      value: { kind: 'number', value: 300 },
    });
    const y26 = assert({
      factId: 'days-present',
      taxYear: 2026,
      value: { kind: 'number', value: 120 },
    });

    const s25 = factState(factSet([y25, y26], 2025), 'days-present');
    const s26 = factState(factSet([y25, y26], 2026), 'days-present');
    if (s25.status !== 'known' || s26.status !== 'known') throw new Error('expected known');
    expect(s25.value.value).toBe(300);
    expect(s26.value.value).toBe(120);
  });

  it('shares a timeless fact into every year', () => {
    const birth = assert({
      factId: 'birth-date',
      taxYear: 2024,
      value: { kind: 'date', value: '2003-05-14' },
    });
    const state = factState(factSet([birth], 2026), 'birth-date');
    expect(state.status).toBe('known');
  });
});

describe('dependents', () => {
  it('walks rule provenance transitively, in dependency order', () => {
    const days = assert({ factId: 'days-present', value: { kind: 'number', value: 320 } });
    const visa = assert({ factId: 'visa-type', value: { kind: 'string', value: 'F' } });
    const residency = assert({
      factId: 'residency-status',
      value: { kind: 'string', value: 'nonresident' },
      source: rule('residency', ['days-present', 'visa-type']),
    });
    const claimed = assert({
      factId: 'can-be-claimed',
      value: { kind: 'string', value: 'no' },
      source: rule('dependency', ['residency-status', 'lived-with-parents-months']),
    });

    expect(dependents([days, visa, residency, claimed], 'days-present')).toEqual([
      'residency-status',
      'can-be-claimed',
    ]);
    expect(dependents([days, visa, residency, claimed], 'lived-with-parents-months')).toEqual([
      'can-be-claimed',
    ]);
    expect(dependents([days, visa, residency, claimed], 'married')).toEqual([]);
  });

  it('flags a rule output as stale when the person contradicts the document it consumed', () => {
    // The A1 cruel case: document asserts, rule consumes, person supersedes —
    // the rule's output must appear downstream of the changed fact.
    const fromDoc = assert({
      assertionId: 'd1',
      factId: 'days-present',
      value: { kind: 'number', value: 340 },
      source: doc('file-i94', 'days'),
    });
    const derived = assert({
      factId: 'residency-status',
      value: { kind: 'string', value: 'resident' },
      source: rule('residency', ['days-present']),
    });
    const personFix = assert({
      factId: 'days-present',
      value: { kind: 'number', value: 40 },
      supersedes: 'd1',
    });

    expect(dependents([fromDoc, derived, personFix], 'days-present')).toEqual(['residency-status']);
  });

  it('ignores edges from superseded rule assertions', () => {
    const old = assert({
      assertionId: 'r1',
      factId: 'residency-status',
      value: { kind: 'string', value: 'resident' },
      source: rule('residency', ['days-present']),
    });
    const rerun = assert({
      factId: 'residency-status',
      value: { kind: 'string', value: 'nonresident' },
      source: rule('residency', ['visa-type']),
      supersedes: 'r1',
    });
    // The re-run consumed different facts; the old edge must not linger.
    expect(dependents([old, rerun], 'days-present')).toEqual([]);
    expect(dependents([old, rerun], 'visa-type')).toEqual(['residency-status']);
  });
});

describe('validation', () => {
  it('rejects an unknown fact id with suggestions that teach', () => {
    const result = validateAssertion({
      assertionId: 'x',
      factId: 'days-in-us',
      taxYear: 2026,
      value: { kind: 'number', value: 100 },
      source: { kind: 'person', conversationId: null },
      assertedAt: '2026-08-01T00:00:00Z',
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.problem.reason === 'unknown-fact-id') {
      expect(result.problem.suggestions).toContain('days-present');
    } else {
      throw new Error('expected unknown-fact-id');
    }
  });

  it('rejects a value of the wrong kind', () => {
    const result = validateAssertion({
      assertionId: 'x',
      factId: 'married',
      taxYear: 2026,
      value: { kind: 'string', value: 'yes' },
      source: { kind: 'person', conversationId: null },
      assertedAt: '2026-08-01T00:00:00Z',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.reason).toBe('wrong-value-kind');
  });

  it('accepts unknown for any fact regardless of its declared kind', () => {
    const result = validateAssertion({
      assertionId: 'x',
      factId: 'married',
      taxYear: 2026,
      value: { kind: 'unknown' },
      source: { kind: 'person', conversationId: null },
      assertedAt: '2026-08-01T00:00:00Z',
    });
    expect(result.ok).toBe(true);
  });

  it('refuses a derived fact from anything but a rule', () => {
    const result = validateAssertion({
      assertionId: 'x',
      factId: 'residency-status',
      taxYear: 2026,
      value: { kind: 'string', value: 'resident' },
      source: { kind: 'person', conversationId: null },
      assertedAt: '2026-08-01T00:00:00Z',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.reason).toBe('derived-fact-needs-rule-source');
  });

  it('suggests by closeness, not registry order', () => {
    expect(nearestFactIds('birth-day', 1)).toEqual(['birth-date']);
    expect(nearestFactIds('visa-first-entry', 1)).toEqual(['visa-first-entry-year']);
  });
});

describe('serialisation', () => {
  it('round-trips assertions through JSON without loss', () => {
    const all = [
      assert({ factId: 'birth-date', value: { kind: 'date', value: '2003-05-14' } }),
      assert({ factId: 'self-support-share-pct', value: { kind: 'unknown' } }),
      assert({
        factId: 'residency-status',
        value: { kind: 'string', value: 'nonresident' },
        source: rule('residency', ['visa-type']),
      }),
    ];
    const revived = JSON.parse(JSON.stringify(all)) as FactAssertion[];
    expect(revived).toEqual(all);

    const before = factSet(all, 2026);
    const after = factSet(revived, 2026);
    expect([...after.byId.entries()]).toEqual([...before.byId.entries()]);
  });
});
