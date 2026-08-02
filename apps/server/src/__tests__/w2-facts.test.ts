import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ensureLaunchSchema } from '../db/ensure-schema';
import { factSet, factState } from '../lib/calc/filing/facts';
import {
  type ExtractedW2,
  RETIREMENT_CODES,
  type StoredW2Row,
  liveW2Rows,
  planW2Facts,
} from '../services/w2-facts';

// ─── C1 acceptance ─────────────────────────────────────────────────
// The cruel cases from the contract: multiple employers compose, a W-2c
// replaces its predecessor through the fact model's own supersession, two
// uncorrected forms from one employer contradict rather than sum, a box
// nobody read asserts nothing, and box 1 is never "corrected" from box 3.

const NOW = '2027-02-01T00:00:00.000Z';

function w2(
  over: Omit<Partial<ExtractedW2>, 'boxes'> & { boxes?: Partial<ExtractedW2['boxes']> },
): ExtractedW2 {
  return {
    employerName: over.employerName ?? 'Acme Corp',
    // `undefined` means "use the default"; an explicit null must survive —
    // the no-EIN case is a real shape, not a missing argument.
    employerEin: over.employerEin === undefined ? '12-3456789' : over.employerEin,
    corrected: over.corrected ?? false,
    taxYear: over.taxYear ?? 2026,
    boxes: {
      box1: null,
      box2: null,
      box3: null,
      box4: null,
      box5: null,
      box6: null,
      box12: [],
      box14: null,
      stateRows: [],
      ...over.boxes,
    },
  };
}

function row(fileId: string, extracted: ExtractedW2, createdAt = 1): StoredW2Row {
  return {
    fileId,
    employerEin: extracted.employerEin,
    corrected: extracted.corrected,
    createdAt,
    extracted,
  };
}

const plan = (live: StoredW2Row[], prevLive: Parameters<typeof planW2Facts>[0]['prevLive'] = []) =>
  planW2Facts({
    live,
    prevLive,
    workspaceKey: { taxYear: 2026 },
    triggeringFileId: live[live.length - 1]?.fileId ?? 'none',
    nowIso: NOW,
  });

describe('multiple employers compose', () => {
  it('sums every box family across employers and counts them', () => {
    const a = row(
      'f1',
      w2({
        employerEin: '11-1111111',
        boxes: {
          box1: 18000,
          box2: 900,
          box4: 1116,
          box6: 261,
          box12: [{ code: 'D', amount: 1200 }],
          stateRows: [{ state: 'CA', stateWages: 18000, stateTax: 300 }],
        },
      }),
    );
    const b = row(
      'f2',
      w2({
        employerEin: '22-2222222',
        boxes: {
          box1: 24000,
          box2: 2100,
          box4: 1488,
          box6: 348,
          box12: [{ code: 'AA', amount: 800 }],
          stateRows: [{ state: 'CA', stateWages: 24000, stateTax: 500 }],
        },
      }),
      2,
    );

    const assertions = plan(liveW2Rows([a, b]));
    const set = factSet(assertions, 2026);
    const known = (id: Parameters<typeof factState>[1]) => {
      const s = factState(set, id);
      if (s.status !== 'known' || s.value.kind !== 'number') throw new Error(`${id} not known`);
      return s.value.value;
    };

    expect(known('w2-employer-count')).toBe(2);
    expect(known('w2-wages')).toBe(42000);
    expect(known('w2-federal-withheld')).toBe(3000);
    expect(known('w2-ss-tax-withheld')).toBe(2604);
    expect(known('w2-medicare-tax-withheld')).toBe(609);
    expect(known('w2-retirement-contributions')).toBe(2000); // D + AA both count
    expect(known('w2-state-tax-withheld')).toBe(800);
  });

  it('maps box 12 codes precisely: retirement codes in, W to HSA, DD ignored', () => {
    const assertions = plan(
      liveW2Rows([
        row(
          'f1',
          w2({
            boxes: {
              box1: 30000,
              box12: [
                { code: 'D', amount: 1500 },
                { code: 'W', amount: 900 },
                { code: 'DD', amount: 6000 }, // employer health coverage — informational
              ],
            },
          }),
        ),
      ]),
    );
    const set = factSet(assertions, 2026);
    const retirement = factState(set, 'w2-retirement-contributions');
    const hsa = factState(set, 'w2-hsa-contributions');
    if (retirement.status !== 'known' || hsa.status !== 'known') throw new Error('expected known');
    expect(retirement.value).toEqual({ kind: 'number', value: 1500 });
    expect(hsa.value).toEqual({ kind: 'number', value: 900 });
    expect(RETIREMENT_CODES.has('DD')).toBe(false);
  });
});

describe('absence and printed values', () => {
  it('a box nobody read asserts nothing — absent is not zero', () => {
    const assertions = plan(liveW2Rows([row('f1', w2({ boxes: { box1: 18000 } }))]));
    const set = factSet(assertions, 2026);
    expect(factState(set, 'w2-federal-withheld').status).toBe('unasserted');
    expect(factState(set, 'w2-wages').status).toBe('known');
  });

  it('a printed zero is a value and does assert', () => {
    const assertions = plan(liveW2Rows([row('f1', w2({ boxes: { box1: 18000, box2: 0 } }))]));
    const set = factSet(assertions, 2026);
    const withheld = factState(set, 'w2-federal-withheld');
    expect(withheld.status).toBe('known');
    if (withheld.status === 'known') expect(withheld.value).toEqual({ kind: 'number', value: 0 });
  });

  it('box 1 is the wages fact even when box 3 differs — the 401(k) shape survives', () => {
    const assertions = plan(liveW2Rows([row('f1', w2({ boxes: { box1: 40000, box3: 42000 } }))]));
    const set = factSet(assertions, 2026);
    const wages = factState(set, 'w2-wages');
    if (wages.status !== 'known') throw new Error('expected known');
    expect(wages.value).toEqual({ kind: 'number', value: 40000 });
  });
});

describe('the W-2c and the duplicate', () => {
  it('a corrected form retires its predecessor by EIN and year', () => {
    const original = row('f1', w2({ boxes: { box1: 19200 } }), 1);
    const corrected = row('f2', w2({ corrected: true, boxes: { box1: 19750 } }), 2);
    const live = liveW2Rows([original, corrected]);
    expect(live.map((r) => r.fileId)).toEqual(['f2']);
  });

  it('the corrected facts supersede the old ones through the fact model', () => {
    const original = row('f1', w2({ boxes: { box1: 19200, box2: 800 } }), 1);
    const first = plan(liveW2Rows([original]));

    const corrected = row('f2', w2({ corrected: true, boxes: { box1: 19750, box2: 800 } }), 2);
    const second = plan(liveW2Rows([original, corrected]), first);

    // The full history: both plans' assertions. Supersession must resolve
    // to the corrected figures with no contradiction anywhere.
    const set = factSet([...first, ...second], 2026);
    const wages = factState(set, 'w2-wages');
    expect(wages.status).toBe('known');
    if (wages.status === 'known') {
      expect(wages.value).toEqual({ kind: 'number', value: 19750 });
      expect(wages.assertions).toHaveLength(1); // the old one is gone from view
    }
  });

  it('two uncorrected forms from one EIN contradict — never a silent sum', () => {
    const a = row('f1', w2({ boxes: { box1: 19200 } }), 1);
    const b = row('f2', w2({ boxes: { box1: 19750 } }), 2);
    const assertions = plan(liveW2Rows([a, b]));

    const set = factSet(assertions, 2026);
    expect(factState(set, 'w2-wages').status).toBe('contradicted');
    // And no aggregate facts were asserted alongside the conflict.
    expect(factState(set, 'w2-employer-count').status).toBe('unasserted');
  });

  it('forms without an EIN stay individually live rather than guessing identity', () => {
    const a = row('f1', w2({ employerEin: null, boxes: { box1: 9000 } }), 1);
    const b = row('f2', w2({ employerEin: null, boxes: { box1: 12000 } }), 2);
    const live = liveW2Rows([a, b]);
    expect(live).toHaveLength(2);
    // Different unknown employers sum as two employers — the honest default
    // for two distinct documents that never claimed to be the same one.
    const assertions = plan(live);
    const set = factSet(assertions, 2026);
    const wages = factState(set, 'w2-wages');
    if (wages.status !== 'known') throw new Error('expected known');
    expect(wages.value).toEqual({ kind: 'number', value: 21000 });
  });

  it('is idempotent: replanning the same state produces the same assertion ids', () => {
    const rows = liveW2Rows([row('f1', w2({ boxes: { box1: 18000 } }))]);
    const a = plan(rows);
    const b = plan(rows);
    expect(b.map((x) => x.assertionId)).toEqual(a.map((x) => x.assertionId));
  });
});

describe('the tables behind it', () => {
  it('boot DDL creates w2_forms and fact_assertions, idempotently', () => {
    const sqlite = new Database(':memory:');
    ensureLaunchSchema(sqlite);
    expect(() => ensureLaunchSchema(sqlite)).not.toThrow();
    const tables = new Set(
      (
        sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
          name: string;
        }>
      ).map((t) => t.name),
    );
    expect(tables.has('w2_forms')).toBe(true);
    expect(tables.has('fact_assertions')).toBe(true);
  });
});
