import { describe, expect, it } from 'vitest';
import { type FactAssertion, factSet, factState, makeAssertion } from '../lib/calc/filing/facts';
import {
  type StoredIncomeFormRow,
  liveIncomeFormRows,
  planIncomeFormFacts,
} from '../services/income-form-facts';

// ─── C2 acceptance ─────────────────────────────────────────────────
// Forms are a floor, not the truth; gross is not income; duplicates are
// never summed; and the cruel case from the contract: a person says
// "about $2,000", a $2,050 1099-NEC arrives, and the engine reconciles to
// the form with the change surfaced — while a $3,850 estimate covering
// no-form income stands untouched above a $2,050 form.

const NOW = '2026-08-02T12:00:00.000Z';

let n = 0;
function row(
  overrides: Partial<StoredIncomeFormRow> & {
    kind: StoredIncomeFormRow['kind'];
    amount: number | null;
  },
): StoredIncomeFormRow {
  n += 1;
  const { kind, amount, ...rest } = overrides;
  return {
    fileId: rest.fileId ?? `file-${n}`,
    kind,
    payerTin: rest.payerTin !== undefined ? rest.payerTin : `12-34567${n}`,
    corrected: rest.corrected ?? false,
    createdAt: rest.createdAt ?? n,
    extracted: {
      kind,
      payerName: `Payer ${n}`,
      payerTin: rest.payerTin !== undefined ? rest.payerTin : `12-34567${n}`,
      corrected: rest.corrected ?? false,
      taxYear: 2026,
      nec: kind === '1099-NEC' ? { box1: amount, box4: null } : null,
      k: kind === '1099-K' ? { box1a: amount, box4: null, transactionCount: null } : null,
    },
  };
}

function personEstimate(factId: 'contract-income' | 'platform-income', value: number) {
  return makeAssertion({
    assertionId: `person:${factId}`,
    factId,
    taxYear: 2026,
    value: { kind: 'number', value },
    source: { kind: 'person', conversationId: null },
    assertedAt: '2026-07-01T00:00:00Z',
    supersedes: null,
  } as Parameters<typeof makeAssertion>[0]);
}

function plan(
  live: StoredIncomeFormRow[],
  personLive: FactAssertion[] = [],
  prevLive: FactAssertion[] = [],
) {
  return planIncomeFormFacts({
    live,
    prevLive,
    personLive,
    taxYear: 2026,
    triggeringFileId: live[live.length - 1]?.fileId ?? 'file-x',
    nowIso: NOW,
  });
}

describe('live rows', () => {
  it('replaces by payer TIN + kind when a corrected form arrives', () => {
    const original = row({ kind: '1099-NEC', amount: 2050, payerTin: '11-1111111', fileId: 'a' });
    const corrected = row({
      kind: '1099-NEC',
      amount: 2400,
      payerTin: '11-1111111',
      corrected: true,
      fileId: 'b',
      createdAt: 99,
    });
    const live = liveIncomeFormRows([original, corrected]);
    expect(live).toHaveLength(1);
    expect(live[0]?.fileId).toBe('b');
  });

  it('does not let a NEC correction retire a K from the same payer', () => {
    const nec = row({ kind: '1099-NEC', amount: 2050, payerTin: '11-1111111' });
    const k = row({ kind: '1099-K', amount: 5000, payerTin: '11-1111111' });
    const necCorrected = row({
      kind: '1099-NEC',
      amount: 2100,
      payerTin: '11-1111111',
      corrected: true,
      createdAt: 99,
    });
    const live = liveIncomeFormRows([nec, k, necCorrected]);
    expect(live.map((r) => r.kind).sort()).toEqual(['1099-K', '1099-NEC']);
  });

  it('keeps no-TIN rows live individually rather than guessing identity', () => {
    const a = row({ kind: '1099-NEC', amount: 900, payerTin: null });
    const b = row({ kind: '1099-NEC', amount: 900, payerTin: null, corrected: true });
    expect(liveIncomeFormRows([a, b])).toHaveLength(2);
  });
});

describe('the floor rule', () => {
  it('cruel case: "about $2,000" meets a $2,050 form — reconciled to the form, delta surfaced', () => {
    const person = personEstimate('contract-income', 2000);
    const out = plan([row({ kind: '1099-NEC', amount: 2050 })], [person]);

    const floor = out.find((a) => a.factId === 'contract-income');
    if (!floor) throw new Error('expected the floor assertion');
    expect(floor.value).toEqual({ kind: 'number', value: 2050 });
    expect(floor.supersedes).toBe('person:contract-income');
    if (floor.source.kind !== 'document') throw new Error('expected document source');
    expect(floor.source.field).toContain('$2000 estimate');
    expect(floor.source.field).toContain('never got a form');

    // And the fact model reads one live value, the form's.
    const state = factState(factSet([person, ...out], 2026), 'contract-income');
    expect(state.status).toBe('known');
    if (state.status === 'known') expect(state.value.value).toBe(2050);
  });

  it('an estimate above the forms total stands — the difference is the no-form income', () => {
    // P4's shape: $1,800 of DoorDash never got a form; a $2,050 client did.
    const person = personEstimate('contract-income', 3850);
    const out = plan([row({ kind: '1099-NEC', amount: 2050 })], [person]);
    expect(out.some((a) => a.factId === 'contract-income')).toBe(false);
    expect(out.find((a) => a.factId === 'nec-income')?.value).toEqual({
      kind: 'number',
      value: 2050,
    });
  });

  it('asserts the figure outright when no estimate exists', () => {
    const out = plan([
      row({ kind: '1099-NEC', amount: 2050 }),
      row({ kind: '1099-NEC', amount: 900 }),
    ]);
    const contract = out.find((a) => a.factId === 'contract-income');
    const nec = out.find((a) => a.factId === 'nec-income');
    expect(contract?.value).toEqual({ kind: 'number', value: 2950 });
    expect(nec?.value).toEqual({ kind: 'number', value: 2950 });
    if (nec?.source.kind === 'document') {
      expect(nec.source.field).toContain('across 2 payers');
    }
  });

  it('K gross floors platform-income and names gross as not-income', () => {
    const person = personEstimate('platform-income', 900);
    const out = plan([row({ kind: '1099-K', amount: 2300 })], [person]);
    const floor = out.find((a) => a.factId === 'platform-income');
    if (!floor || floor.source.kind !== 'document') throw new Error('expected document floor');
    expect(floor.value).toEqual({ kind: 'number', value: 2300 });
    expect(floor.source.field).toContain('gross');
    expect(floor.supersedes).toBe('person:platform-income');
  });

  it('leaves a platform estimate above the K gross untouched', () => {
    const person = personEstimate('platform-income', 2500);
    const out = plan([row({ kind: '1099-K', amount: 2300 })], [person]);
    expect(out.some((a) => a.factId === 'platform-income')).toBe(false);
  });
});

describe('the never-sum rule', () => {
  it('two uncorrected forms from one payer contradict rather than sum', () => {
    const a = row({ kind: '1099-NEC', amount: 2050, payerTin: '11-1111111', fileId: 'a' });
    const b = row({ kind: '1099-NEC', amount: 2050, payerTin: '11-1111111', fileId: 'b' });
    const out = plan(liveIncomeFormRows([a, b]));

    const necAssertions = out.filter((a2) => a2.factId === 'nec-income');
    expect(necAssertions).toHaveLength(2);
    // Identical printed values corroborate; the contradiction machinery is
    // for the disagreeing pair below. Either way: never a $4,100 sum.
    expect(necAssertions.every((a2) => a2.value.kind === 'number' && a2.value.value === 2050)).toBe(
      true,
    );
    expect(out.some((a2) => a2.factId === 'contract-income')).toBe(false);
  });

  it('disagreeing duplicates surface as a live contradiction downstream', () => {
    const a = row({ kind: '1099-NEC', amount: 2050, payerTin: '11-1111111', fileId: 'a' });
    const b = row({ kind: '1099-NEC', amount: 3200, payerTin: '11-1111111', fileId: 'b' });
    const out = plan(liveIncomeFormRows([a, b]));
    const state = factState(factSet(out, 2026), 'nec-income');
    expect(state.status).toBe('contradicted');
  });
});

describe('determinism', () => {
  it('re-planning the same state produces the same assertion ids', () => {
    const rows = [row({ kind: '1099-NEC', amount: 2050 }), row({ kind: '1099-K', amount: 2300 })];
    const first = plan(liveIncomeFormRows(rows));
    const second = plan(liveIncomeFormRows(rows));
    expect(second.map((a) => a.assertionId)).toEqual(first.map((a) => a.assertionId));
  });

  it('a null box asserts nothing — absent is not zero', () => {
    const out = plan([row({ kind: '1099-NEC', amount: null })]);
    expect(out).toEqual([]);
  });
});
