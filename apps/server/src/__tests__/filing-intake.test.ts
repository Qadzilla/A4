import { describe, expect, it } from 'vitest';
import {
  FACT_REGISTRY,
  type FactId,
  factEntry,
  factSet,
  makeAssertion,
} from '../lib/calc/filing/facts';
import {
  INTAKE_QUESTIONS,
  type IntakeQuestion,
  SECTION_ORDER,
  intakeFindings,
  intakePlan,
} from '../lib/calc/filing/intake';

// ─── G1 acceptance ─────────────────────────────────────────────────
// Two fences and a behaviour. The fences are mechanical on purpose:
// Doctrine 1 ("ask life, derive tax") survives forty questions only if
// something other than good intentions is checking.

// Vocabulary that presumes the reader already knows how tax works. A
// question containing any of it has stopped asking about a life.
//
// Matched on word boundaries, which matters more than it sounds: a
// naive substring check reads "IRS" inside "first", "FICA" inside
// "qualification" and "form" inside "platform", and a fence that cries
// wolf gets deleted by the next person in a hurry.
const TAX_VOCABULARY = [
  'form 1040',
  '1040',
  '1098',
  '1099',
  '1095',
  '8863',
  '8949',
  '8962',
  'w-2',
  'w2',
  'schedule',
  'agi',
  'adjusted gross',
  'taxable',
  'deduct',
  'deduction',
  'deductible',
  'tax credit',
  'withheld',
  'withholding',
  'exemption',
  'dependent',
  'filing status',
  'itemize',
  'itemized',
  'capital gain',
  'capital gains',
  'short-term',
  'long-term',
  'fica',
  'aotc',
  'gross income',
  'cost basis',
  'distribution',
  'irs',
  'standard deduction',
  'nonresident',
  'resident alien',
  'self-employment',
  'earned income',
  'taxpayer',
  'tax year',
];

const escapeRegex = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const usesTaxVocabulary = (haystack: string): string[] =>
  TAX_VOCABULARY.filter((term) =>
    new RegExp(`(^|[^a-z0-9-])${escapeRegex(term)}($|[^a-z0-9-])`, 'i').test(haystack),
  );

describe('the intake asks about a life, not about a return', () => {
  for (const q of INTAKE_QUESTIONS) {
    it(`${q.factId} — the prompt is in life language`, () => {
      const found = usesTaxVocabulary(`${q.prompt} ${q.why ?? ''}`);
      expect(found, `tax vocabulary in the question for ${q.factId}`).toEqual([]);
    });
  }

  it('every question ends in a question mark — it is asking, not labelling', () => {
    const notAsking = INTAKE_QUESTIONS.filter((q) => !q.prompt.trim().endsWith('?'));
    expect(notAsking.map((q) => q.factId)).toEqual([]);
  });

  it('no prompt is merely the fact label with a question mark bolted on', () => {
    // Short labels are exempt: "US citizen" is already the plainest way to
    // ask it, and forcing a paraphrase would make the question worse. What
    // this catches is a long registry label — written to describe data —
    // reused verbatim as if it were a question.
    const lazy = INTAKE_QUESTIONS.filter((q) => {
      const label = FACT_REGISTRY[q.factId].label.toLowerCase().replace(/[^a-z ]/g, '');
      if (label.split(' ').filter(Boolean).length < 4) return false;
      const prompt = q.prompt.toLowerCase().replace(/[^a-z ]/g, '');
      return prompt.includes(label);
    });
    expect(lazy.map((q) => q.factId)).toEqual([]);
  });
});

describe('the structural fences', () => {
  it('no question exists twice, and none for a derived fact', () => {
    const seen = new Set<FactId>();
    for (const q of INTAKE_QUESTIONS) {
      expect(seen.has(q.factId), `duplicate question for ${q.factId}`).toBe(false);
      seen.add(q.factId);
      expect(factEntry(q.factId).derived, `${q.factId} is asserted by a rule`).toBeUndefined();
    }
  });

  it('the control matches the value the fact holds', () => {
    const expected: Record<IntakeQuestion['input']['kind'], string> = {
      'yes-no': 'bool',
      date: 'date',
      text: 'string',
      'us-state': 'string',
      choice: 'string',
      number: 'number',
    };
    for (const q of INTAKE_QUESTIONS) {
      expect(FACT_REGISTRY[q.factId].kind, `${q.factId} control mismatch`).toBe(
        expected[q.input.kind],
      );
    }
  });

  it('every section has questions, and every question a known section', () => {
    for (const section of SECTION_ORDER) {
      expect(
        INTAKE_QUESTIONS.some((q) => q.section === section),
        `${section} is empty`,
      ).toBe(true);
    }
  });
});

// ─── The plan ──────────────────────────────────────────────────────

let n = 0;
const make = (
  factId: Parameters<typeof makeAssertion>[0]['factId'],
  value: Parameters<typeof makeAssertion>[0]['value'],
) =>
  makeAssertion({
    assertionId: `g1${++n}`,
    factId,
    taxYear: 2025,
    value,
    source: { kind: 'person', conversationId: null },
    assertedAt: `2025-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
    supersedes: null,
  } as Parameters<typeof makeAssertion>[0]);

const plan = (assertions: ReturnType<typeof make>[]) =>
  intakePlan(assertions, 2025, factSet(assertions, 2025));

const flat = (p: ReturnType<typeof plan>) => p.sections.flatMap((s) => s.questions);
const asked = (p: ReturnType<typeof plan>, id: FactId) => flat(p).some((q) => q.factId === id);

describe('gates: a question that cannot matter is never asked', () => {
  it('a citizen in Boston is never asked about a visa or about Yonkers', () => {
    const p = plan([
      make('us-citizen', { kind: 'bool', value: true }),
      make('state-of-residence', { kind: 'string', value: 'MA' }),
    ]);
    expect(asked(p, 'visa-type')).toBe(false);
    expect(asked(p, 'months-in-yonkers')).toBe(false);
    expect(asked(p, 'rent-months-california')).toBe(false);
    // But the Massachusetts one that IS worth money shows up.
    expect(asked(p, 'rent-paid-massachusetts')).toBe(true);
  });

  it('saying you are not a citizen opens the visa branch', () => {
    const p = plan([make('us-citizen', { kind: 'bool', value: false })]);
    expect(asked(p, 'visa-type')).toBe(true);
    expect(asked(p, 'citizenship-country')).toBe(true);
    expect(asked(p, 'days-present')).toBe(true);
  });

  it('the convenience-rule question appears only when the two states differ', () => {
    const same = plan([
      make('state-of-residence', { kind: 'string', value: 'NY' }),
      make('employer-state', { kind: 'string', value: 'NY' }),
    ]);
    expect(asked(same, 'work-outside-employer-necessity')).toBe(false);

    const split = plan([
      make('state-of-residence', { kind: 'string', value: 'MA' }),
      make('employer-state', { kind: 'string', value: 'NY' }),
    ]);
    expect(asked(split, 'work-outside-employer-necessity')).toBe(true);
    // And New York's own questions arrive with it, because NY is now in play.
    expect(asked(split, 'ny-permanent-abode')).toBe(true);
  });
});

describe('status: the four states of an answer are all distinguishable', () => {
  const base = () => [
    make('us-citizen', { kind: 'bool', value: true }),
    make('state-of-residence', { kind: 'string', value: 'MA' }),
  ];

  it('unasked, answered and skipped are three different things', () => {
    const assertions = [
      ...base(),
      // Asked and answered.
      make('married', { kind: 'bool', value: false }),
      // Asked, and they did not know — an assertion, not an absence.
      make('self-support-share-pct', { kind: 'unknown' }),
    ];
    const p = plan(assertions);
    const byId = new Map(flat(p).map((q) => [q.factId, q]));

    expect(byId.get('married')?.status).toBe('answered');
    expect(byId.get('self-support-share-pct')?.status).toBe('skipped');
    expect(byId.get('lived-with-parents-months')?.status).toBe('unasked');
  });

  it("a document's answer reads as the document's, not as something you said", () => {
    const assertions = [
      ...base(),
      makeAssertion({
        assertionId: 'doc1',
        factId: 'w2-employer-count',
        taxYear: 2025,
        value: { kind: 'number', value: 2 },
        source: { kind: 'document', fileId: 'f1', field: 'employers' },
        assertedAt: '2025-02-01T00:00:00Z',
        supersedes: null,
      }),
    ];
    const q = flat(plan(assertions)).find((x) => x.factId === 'w2-employer-count');
    expect(q?.status).toBe('from-document');
    expect(q?.answeredBy).toBe('document');
    expect(q?.value).toEqual({ kind: 'number', value: 2 });
  });
});

describe('order: the intake reorders itself around dollars', () => {
  it('outstanding questions come first, and among them the priced one leads', () => {
    const p = plan([
      make('us-citizen', { kind: 'bool', value: true }),
      make('state-of-residence', { kind: 'string', value: 'MA' }),
      make('married', { kind: 'bool', value: false }),
      make('birth-date', { kind: 'date', value: '2003-04-04' }),
      make('gross-income', { kind: 'number', value: 42000 }),
      make('w2-wages', { kind: 'number', value: 42000 }),
    ]);

    for (const section of p.sections) {
      const statuses = section.questions.map((q) => q.status === 'unasked');
      const firstAnswered = statuses.indexOf(false);
      if (firstAnswered === -1) continue;
      expect(
        statuses.slice(firstAnswered).every((u) => !u),
        `${section.section} interleaves answered and unasked`,
      ).toBe(true);
    }

    // Within the outstanding block, price descends.
    for (const section of p.sections) {
      const worths = section.questions
        .filter((q) => q.status === 'unasked')
        .map((q) => q.worth ?? 0);
      const sorted = [...worths].sort((a, b) => b - a);
      expect(worths, `${section.section} is not priced-ordered`).toEqual(sorted);
    }
  });

  it('a real price actually moves a question to the front of its section', () => {
    // Without this the ordering test above passes vacuously on a year where
    // every price is zero. Here they are not: with wages on file, the cash-
    // tips question is worth several hundred dollars and has to lead Work,
    // ahead of the questions authored before it.
    const p = plan([
      make('us-citizen', { kind: 'bool', value: true }),
      make('married', { kind: 'bool', value: false }),
      make('state-of-residence', { kind: 'string', value: 'MA' }),
      make('w2-wages', { kind: 'number', value: 42000 }),
      make('gross-income', { kind: 'number', value: 42000 }),
    ]);
    const work = p.sections.find((s) => s.section === 'work');
    if (!work) throw new Error('expected a work section');

    const lead = work.questions[0];
    expect(lead?.factId).toBe('unreported-tips');
    expect(lead?.worth ?? 0).toBeGreaterThan(0);
    // And it did not lead by authoring order — it is written fifth.
    const authored = INTAKE_QUESTIONS.filter((q) => q.section === 'work').findIndex(
      (q) => q.factId === 'unreported-tips',
    );
    expect(authored).toBeGreaterThan(0);
  });

  it('nextUp is the three most valuable unanswered questions in the whole year', () => {
    const p = plan([
      make('us-citizen', { kind: 'bool', value: true }),
      make('state-of-residence', { kind: 'string', value: 'CA' }),
      make('gross-income', { kind: 'number', value: 42000 }),
      make('w2-wages', { kind: 'number', value: 42000 }),
    ]);
    expect(p.nextUp.length).toBe(3);
    const best = Math.max(
      ...flat(p)
        .filter((q) => q.status === 'unasked')
        .map((q) => q.worth ?? 0),
    );
    expect(p.nextUp[0]?.worth ?? 0).toBe(best);
  });
});

describe('the finding: the surface says what just changed', () => {
  it('an answer that opens a branch reports the questions it opened', () => {
    const before = [
      make('us-citizen', { kind: 'bool', value: true }),
      make('state-of-residence', { kind: 'string', value: 'MA' }),
      make('gross-income', { kind: 'number', value: 42000 }),
    ];
    const after = [...before, make('platform-income', { kind: 'number', value: 9000 })];

    const findings = intakeFindings(plan(before), plan(after));
    const opened = findings.filter((f) => f.kind === 'opened').map((f) => f.factId);
    expect(opened).toContain('platform-fees');
    expect(opened).toContain('payer-controlled-how');
    expect(findings.every((f) => f.line.length > 0)).toBe(true);
  });

  it('an answer that closes a branch says so rather than silently removing it', () => {
    const before = [make('us-citizen', { kind: 'bool', value: false })];
    const after = [
      make('us-citizen', { kind: 'bool', value: false }),
      make('green-card-holder', { kind: 'bool', value: true }),
    ];
    const closed = intakeFindings(plan(before), plan(after)).filter((f) => f.kind === 'closed');
    expect(closed.map((f) => f.factId)).toContain('visa-type');
  });

  it('nothing changing produces no findings at all', () => {
    const facts = [make('us-citizen', { kind: 'bool', value: true })];
    expect(intakeFindings(plan(facts), plan(facts))).toEqual([]);
  });
});
