import { describe, expect, it } from 'vitest';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { type FactAssertion, makeAssertion } from '../lib/calc/filing/facts';
import { CAPITAL_GAINS_FIXTURES } from '../lib/calc/filing/fixtures/capital-gains';
import { DEPENDENCY_FIXTURES } from '../lib/calc/filing/fixtures/dependency';
import { EDUCATION_FIXTURES } from '../lib/calc/filing/fixtures/education';
import { FORM_8843_FIXTURES } from '../lib/calc/filing/fixtures/form-8843';
import { CORPUS_LEDGER } from '../lib/calc/filing/fixtures/ledger';
import { NONRESIDENT_FIXTURES } from '../lib/calc/filing/fixtures/nonresident';
import { PENALTY_FIXTURES } from '../lib/calc/filing/fixtures/penalty';
import { PERSONA_FIXTURES } from '../lib/calc/filing/fixtures/personas';
import { PTC_FIXTURES } from '../lib/calc/filing/fixtures/ptc';
import { RESIDENCY_FIXTURES } from '../lib/calc/filing/fixtures/residency';
import { SAVERS_FIXTURES } from '../lib/calc/filing/fixtures/savers-credit';
import { SELF_EMPLOYMENT_FIXTURES } from '../lib/calc/filing/fixtures/self-employment';
import { TIPS_OVERTIME_FIXTURES } from '../lib/calc/filing/fixtures/tips-overtime';
import { TREATY_FIXTURES } from '../lib/calc/filing/fixtures/treaties';
import type { FilingFixture, FixtureFact } from '../lib/calc/filing/fixtures/types';
import { assessReadiness } from '../lib/calc/filing/readiness';
import { expectations, requiredForms } from '../lib/calc/filing/requirements';

// ─── A7 acceptance ─────────────────────────────────────────────────
// The corpus is the deliverable. These are its gates: every fixture cited
// or reasoned, every id in the append-only ledger both ways, and the eight
// personas running end to end through the whole Phase A stack — with
// unmet expectations as the expected output, because that is what a real
// year in progress looks like.

const ALL: FilingFixture<unknown>[] = [
  ...RESIDENCY_FIXTURES,
  ...DEPENDENCY_FIXTURES,
  ...PENALTY_FIXTURES,
  ...EDUCATION_FIXTURES,
  ...SAVERS_FIXTURES,
  ...PTC_FIXTURES,
  ...SELF_EMPLOYMENT_FIXTURES,
  ...CAPITAL_GAINS_FIXTURES,
  ...TIPS_OVERTIME_FIXTURES,
  ...NONRESIDENT_FIXTURES,
  ...FORM_8843_FIXTURES,
  ...TREATY_FIXTURES,
  ...PERSONA_FIXTURES,
];

function factsOf(fixture: FilingFixture<unknown>): FactAssertion[] {
  return fixture.facts.map((f: FixtureFact, i: number) =>
    makeAssertion({
      assertionId: `${fixture.id}#${i}`,
      factId: f.factId,
      taxYear: f.taxYear ?? fixture.taxYear,
      value: f.value,
      source: f.rule
        ? { kind: 'rule', ruleId: f.rule.ruleId, consumed: f.rule.consumed }
        : { kind: 'person', conversationId: null },
      assertedAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
    } as Parameters<typeof makeAssertion>[0]),
  );
}

describe('corpus gates', () => {
  it('has no duplicate ids', () => {
    const ids = ALL.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every fixture is cited, reasoned, or a named persona — none merge bare', () => {
    for (const f of ALL) {
      if (f.source.kind === 'authority') {
        expect(f.source.citation.length, `${f.id} citation`).toBeGreaterThan(20);
      } else if (f.source.kind === 'adversarial') {
        expect(f.source.rationale.length, `${f.id} rationale`).toBeGreaterThan(20);
      } else {
        expect(f.source.persona, `${f.id} persona`).toMatch(/^P[1-8]$/);
      }
    }
  });

  it('the ledger holds both ways: no deletions, no unrecorded additions', () => {
    const ledgerIds = new Set(CORPUS_LEDGER.map((e) => e.id));
    const corpusIds = new Set(ALL.map((f) => f.id));

    for (const entry of CORPUS_LEDGER) {
      expect(corpusIds.has(entry.id), `ledger id '${entry.id}' has no fixture — deletion?`).toBe(
        true,
      );
      if (entry.supersededBy) {
        expect(
          ledgerIds.has(entry.supersededBy),
          `${entry.id} superseded by unrecorded '${entry.supersededBy}'`,
        ).toBe(true);
      }
    }
    for (const id of corpusIds) {
      expect(ledgerIds.has(id), `fixture '${id}' missing from the ledger`).toBe(true);
    }
  });

  it('the ledger never shrinks below the Phase A record', () => {
    // The floor at the time A7 shipped. Raising it is fine; lowering it is
    // the alarm this test exists to sound.
    expect(CORPUS_LEDGER.length).toBeGreaterThanOrEqual(30);
  });
});

describe('the personas, end to end', () => {
  for (const persona of PERSONA_FIXTURES) {
    for (const [yearKey, expected] of Object.entries(persona.expected)) {
      const taxYear = Number(yearKey);
      it(`${persona.id} · ${taxYear}`, () => {
        const assertions = factsOf(persona);
        const today = new Date(`${persona.today}T12:00:00Z`);
        const readiness = assessReadiness(assertions, persona.docs, taxYear, today);

        expect(readiness.verdict).toBe(expected.verdict);

        if (expected.residency || expected.canBeClaimed) {
          const evaluation = evaluateYear(assertions, taxYear);
          if (expected.residency) {
            expect(evaluation.residency.status).toBe(expected.residency);
          }
          if (expected.canBeClaimed) {
            expect(evaluation.dependency.canBeClaimed).toBe(expected.canBeClaimed);
          }
        }

        const forms = requiredForms(assertions, persona.docs, taxYear).map((f) => f.form);
        for (const form of expected.formsRequired ?? []) {
          expect(forms, `${persona.id} requires ${form}`).toContain(form);
        }
        for (const form of expected.formsAbsent ?? []) {
          expect(forms, `${persona.id} must not require ${form}`).not.toContain(form);
        }
        for (const form of expected.outOfScopeInclude ?? []) {
          expect(
            readiness.outOfScope.map((f) => f.form),
            `${persona.id} refuses ${form} by name`,
          ).toContain(form);
        }

        const expectedDocs = expectations(assertions, taxYear).map((e) => e.document);
        for (const doc of expected.expectationsInclude ?? []) {
          expect(expectedDocs, `${persona.id} expects ${doc}`).toContain(doc);
        }
        if (expected.expectationsEmpty) {
          expect(expectedDocs, `${persona.id} — the no-form path`).toEqual([]);
        }

        for (const blocker of expected.blockersInclude ?? []) {
          expect(
            readiness.blockers.map((b) => b.id),
            `${persona.id} blocked by ${blocker}`,
          ).toContain(blocker);
        }
      });
    }
  }

  it('every persona from Part IV is in the corpus', () => {
    const covered = new Set(
      PERSONA_FIXTURES.map((f) => (f.source.kind === 'persona' ? f.source.persona : '')),
    );
    for (const p of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']) {
      expect(covered.has(p), `${p} missing from the corpus`).toBe(true);
    }
  });
});
