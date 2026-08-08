import { describe, expect, it } from 'vitest';
import { absenceBoard } from '../lib/calc/filing/board';
import { type FactAssertion, makeAssertion } from '../lib/calc/filing/facts';
import type { ArrivedDoc } from '../lib/calc/filing/requirements';

// ─── G4 acceptance ─────────────────────────────────────────────────
// The board answers a question no other surface asks: what should exist
// that doesn't. Two things carry the slice — the five states (arrived
// and matched are NOT the same), and the calendar (waiting is the
// normal state of the world in early January, and a board that shows
// five red rows on the 3rd is manufacturing alarm out of a date).

let n = 0;
const make = (
  factId: Parameters<typeof makeAssertion>[0]['factId'],
  value: Parameters<typeof makeAssertion>[0]['value'],
) =>
  makeAssertion({
    assertionId: `g4${++n}`,
    factId,
    taxYear: 2025,
    value,
    source: { kind: 'person', conversationId: null },
    assertedAt: `2025-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
    supersedes: null,
  } as Parameters<typeof makeAssertion>[0]);

/** A document-sourced assertion — what makes an arrival `matched`. */
const fromDocument = (
  factId: Parameters<typeof makeAssertion>[0]['factId'],
  value: Parameters<typeof makeAssertion>[0]['value'],
  fileId: string,
): FactAssertion =>
  makeAssertion({
    assertionId: `doc${++n}`,
    factId,
    taxYear: 2025,
    value,
    source: { kind: 'document', fileId, field: 'box1' },
    assertedAt: `2025-02-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
    supersedes: null,
  } as Parameters<typeof makeAssertion>[0]);

const employed = () => [make('w2-employer-count', { kind: 'number', value: 1 })];

const board = (facts: FactAssertion[], docs: ArrivedDoc[], today: string) =>
  absenceBoard(facts, docs, 2025, new Date(`${today}T12:00:00Z`));

const itemFor = (b: ReturnType<typeof board>, kind: string) =>
  b.items.find((i) => i.document === kind);

describe('the five states', () => {
  it('waiting, well before the date', () => {
    const b = board(employed(), [], '2025-12-01');
    expect(itemFor(b, 'W-2')?.state).toBe('waiting');
    expect(b.counts.late).toBe(0);
  });

  it('due, inside the fortnight before it', () => {
    const b = board(employed(), [], '2026-01-25');
    const w2 = itemFor(b, 'W-2');
    expect(w2?.state).toBe('due');
    expect(w2?.days).toBe(6);
  });

  it('late, past it — counting the days and naming the way out', () => {
    const b = board(employed(), [], '2026-02-14');
    const w2 = itemFor(b, 'W-2');
    expect(w2?.state).toBe('late');
    expect(w2?.days).toBe(14);
    expect(w2?.detail).toContain('2026-01-31');
    expect(w2?.action).toContain('Wage & Income transcript');
  });

  it('arrived is NOT matched — a file on the desk the engine has not read', () => {
    const b = board(employed(), [{ kind: 'W-2', fileId: 'f1', taxYear: 2025 }], '2026-02-14');
    const w2 = itemFor(b, 'W-2');
    expect(w2?.state).toBe('arrived');
    // The whole point: it looks finished and isn't.
    expect(w2?.detail).toContain("haven't been read into the year");
    expect(w2?.action).not.toBeNull();
    expect(b.counts.late).toBe(0);
  });

  it('matched, once a document-sourced fact cites the file', () => {
    const b = board(
      [...employed(), fromDocument('w2-wages', { kind: 'number', value: 42000 }, 'f1')],
      [{ kind: 'W-2', fileId: 'f1', taxYear: 2025 }],
      '2026-02-14',
    );
    const w2 = itemFor(b, 'W-2');
    expect(w2?.state).toBe('matched');
    expect(w2?.fileIds).toEqual(['f1']);
    expect(w2?.action).toBeNull();
  });

  it("another year's document satisfies nothing here", () => {
    const b = board(employed(), [{ kind: 'W-2', fileId: 'f9', taxYear: 2026 }], '2026-02-14');
    expect(itemFor(b, 'W-2')?.state).toBe('late');
  });
});

describe('the calendar is not an alarm', () => {
  it('before the first date, nothing is late and the board says why', () => {
    const b = board(employed(), [], '2026-01-03');
    expect(b.season).toBe('too-early');
    expect(b.headline).toContain('None is late');
    expect(b.counts.late).toBe(0);
  });

  it('past every date, the season says so', () => {
    const b = board(employed(), [], '2026-06-01');
    expect(b.season).toBe('all-due');
  });

  it('a year with no expectations at all is honest rather than empty', () => {
    const b = board([make('married', { kind: 'bool', value: false })], [], '2026-02-14');
    expect(b.items).toEqual([]);
    expect(b.headline).toContain('says a document should be coming');
  });
});

describe('why it is expected', () => {
  it('carries the fact chain, as ids and labels rather than prose', () => {
    const b = board(
      [
        make('brokerage-account', { kind: 'bool', value: true }),
        make('sold-investments', { kind: 'bool', value: true }),
      ],
      [],
      '2026-02-20',
    );
    const b1099 = itemFor(b, '1099-B');
    expect(b1099?.because.map((x) => x.factId)).toEqual(['brokerage-account', 'sold-investments']);
    // Tappable back to the answer that caused it — so a label is required.
    expect(b1099?.because.every((x) => x.label.length > 0)).toBe(true);
  });

  it('a threshold document reads as maybe-never, not as missing', () => {
    const b = board(
      [make('earned-bank-interest', { kind: 'bool', value: true })],
      [],
      '2026-03-01',
    );
    const int = itemFor(b, '1099-INT');
    expect(int?.state).toBe('late');
    expect(int?.mandatory).toBe(false);
    // Absence of a non-mandatory document is a note, never an alarm.
    expect(int?.detail).toContain('may never come');
    expect(int?.action).toContain('your own records');
  });
});

describe('the strip: income no paper will confirm', () => {
  it('cash tips appear with no form named, because none exists', () => {
    const b = board(
      [...employed(), make('unreported-tips', { kind: 'number', value: 900 })],
      [],
      '2026-02-14',
    );
    const tips = b.noPaperTrail.find((x) => x.factId === 'unreported-tips');
    expect(tips).toBeDefined();
    expect(tips?.wouldHaveBeen).toBeNull();
    expect(tips?.detail).toContain('no form at all');
  });

  it('contract income under the threshold names the form that will not come', () => {
    const b = board([make('contract-income', { kind: 'number', value: 400 })], [], '2026-02-14');
    const row = b.noPaperTrail.find((x) => x.factId === 'contract-income');
    expect(row?.wouldHaveBeen).toBe('1099-NEC');
    expect(b.items.some((i) => i.document === '1099-NEC')).toBe(false);
  });

  it('income that DOES clear the threshold is an expectation, not a strip row', () => {
    const b = board([make('contract-income', { kind: 'number', value: 9000 })], [], '2026-02-14');
    expect(b.items.some((i) => i.document === '1099-NEC')).toBe(true);
    expect(b.noPaperTrail.some((x) => x.factId === 'contract-income')).toBe(false);
  });

  it('an income fact of zero produces no row', () => {
    const b = board(
      [...employed(), make('unreported-tips', { kind: 'number', value: 0 })],
      [],
      '2026-02-14',
    );
    expect(b.noPaperTrail).toEqual([]);
  });
});

describe('arrivals nothing asked for', () => {
  it('surface the tell-me-about-it hook rather than being filed silently', () => {
    const b = board(employed(), [{ kind: '1099-R', fileId: 'f7', taxYear: 2025 }], '2026-02-14');
    expect(b.unmatched).toHaveLength(1);
    expect(b.unmatched[0]?.document).toBe('1099-R');
    expect(b.unmatched[0]?.prompt).toContain('Tell me about it');
  });

  it('an expected document is never unmatched', () => {
    const b = board(employed(), [{ kind: 'W-2', fileId: 'f1', taxYear: 2025 }], '2026-02-14');
    expect(b.unmatched).toEqual([]);
  });
});

describe('the headline names the one thing', () => {
  it('a single absence is named, not counted', () => {
    const b = board(
      [
        ...employed(),
        make('brokerage-account', { kind: 'bool', value: true }),
        make('received-dividends', { kind: 'bool', value: true }),
        fromDocument('dividends-ordinary', { kind: 'number', value: 120 }, 'f2'),
      ],
      [{ kind: '1099-DIV', fileId: 'f2', taxYear: 2025 }],
      '2026-02-20',
    );
    expect(b.headline).toContain('W-2');
    expect(b.headline).toContain('Everything else is accounted for');
  });

  it('several absences rank the mandatory one first', () => {
    const b = board(
      [...employed(), make('earned-bank-interest', { kind: 'bool', value: true })],
      [],
      '2026-03-01',
    );
    expect(b.counts.late).toBe(2);
    // The W-2 is mandatory and the 1099-INT is not, so the W-2 leads even
    // though both are past their date.
    expect(b.headline).toContain('W-2');
  });

  it('nothing outstanding reads as finished', () => {
    const b = board(
      [...employed(), fromDocument('w2-wages', { kind: 'number', value: 42000 }, 'f1')],
      [{ kind: 'W-2', fileId: 'f1', taxYear: 2025 }],
      '2026-02-20',
    );
    expect(b.headline).toContain('on file');
    expect(b.counts.matched).toBe(1);
  });
});

describe('what a person actually reads', () => {
  it('the why-chain reads back the question, not the schema label', () => {
    // Caught on screen: the registry's label for w2-wages is "Wages paid
    // through employers for the year (W-2 box 1 total)". That belongs in
    // a schema, not on a board — G1 already wrote a fenced life-language
    // sentence for these, so the chain uses that.
    // Where a question exists, it wins outright.
    const asked = board(employed(), [], '2026-02-14');
    expect(itemFor(asked, 'W-2')?.because[0]?.label).toBe(
      'How many places put you on their payroll last year?',
    );

    // Where none does — w2-wages is document-sourced, so G1 never wrote
    // one — the schema label loses its where-to-find-it parenthetical.
    const derived = board([make('w2-wages', { kind: 'number', value: 42000 })], [], '2026-02-14');
    const label = derived.items[0]?.because[0]?.label ?? '';
    expect(label).toBe('Wages paid through employers for the year');
    expect(label).not.toContain('box 1');
  });

  it('the no-paper-trail strip carries its own plain name', () => {
    const b = board(
      [...employed(), make('unreported-tips', { kind: 'number', value: 900 })],
      [],
      '2026-02-14',
    );
    const tips = b.noPaperTrail.find((x) => x.factId === 'unreported-tips');
    expect(tips?.label).toBe('Cash tips');
    // The registry label for this one names a form. A board never does.
    expect(tips?.label).not.toContain('4137');
  });

  it('nothing shown to a person carries a form number it did not mean to', () => {
    const b = board(
      [
        ...employed(),
        make('brokerage-account', { kind: 'bool', value: true }),
        make('sold-investments', { kind: 'bool', value: true }),
        make('unreported-tips', { kind: 'number', value: 900 }),
      ],
      [],
      '2026-02-14',
    );
    // Document names on their own row are the point; a form number buried
    // inside an explanatory label is the leak.
    const prose = [
      ...b.items.flatMap((i) => [...i.because.map((x) => x.label)]),
      ...b.noPaperTrail.map((x) => x.label),
    ].join(' ');
    expect(prose).not.toMatch(/\b(4137|8949|1040|box \d)\b/i);
  });
});
