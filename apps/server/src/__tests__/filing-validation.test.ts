import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LINE_IDS,
  type RecordedRun,
  compareRun,
  engineLines,
  recordedRunSchema,
  untriagedDivergences,
  validationStatus,
} from '../lib/calc/filing/validation/harness';

// ─── A8 acceptance ─────────────────────────────────────────────────
// The harness runs in CI against whatever recordings exist; producing a
// recording is the only manual step. With none on file the gate must say
// so — never mistake absence for coverage. Every *.json here except the
// template is loaded, schema-checked, and compared.

const EXPECTED_DIR = join(__dirname, '../lib/calc/filing/validation/expected');

function loadRecordings(): RecordedRun[] {
  return readdirSync(EXPECTED_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'TEMPLATE.json')
    .map((f) => {
      const parsed = recordedRunSchema.safeParse(
        JSON.parse(readFileSync(join(EXPECTED_DIR, f), 'utf-8')),
      );
      if (!parsed.success) {
        throw new Error(`recording ${f} is malformed: ${parsed.error.message}`);
      }
      return parsed.data;
    });
}

describe('the engine side of the comparison', () => {
  it('reports P1 as the hand-checked 1040 lines', () => {
    const { lines, blocked } = engineLines('P1', 2026);
    expect(lines.get(LINE_IDS.agi)).toBe(42000);
    expect(lines.get(LINE_IDS.deduction)).toBe(16100);
    expect(lines.get(LINE_IDS.taxableIncome)).toBe(25900);
    // 10% to 12,250 = 1,225; 12% on the remaining 13,650 = 1,638.
    expect(lines.get(LINE_IDS.tax)).toBeCloseTo(2863, 0);
    expect(blocked).toEqual([]);
  });

  it('reports P2 with the limited deduction and the 8615 gap named', () => {
    const { lines, blocked } = engineLines('P2', 2026);
    expect(lines.get(LINE_IDS.deduction)).toBe(8450); // 8,000 earned + 450
    expect(lines.get(LINE_IDS.taxableIncome)).toBe(2650);
    // All of it is long-term gain inside the 0% bracket at her own rates —
    // which is exactly the understatement the blocked form declares.
    expect(lines.get(LINE_IDS.tax)).toBe(0);
    expect(blocked).toContain('form-8615');
  });

  it('yields the 1040-NR lines for the nonresident persona since E1', () => {
    // Before E1 this asserted zero lines; before E3, deduction 0 and
    // $1,200 of tax. P3 is an Indian student, and Article 21(2) returns
    // the standard deduction — the treaty is worth the entire tax bill.
    // The 1040-NR shares the 1040's core line numbering, so a future
    // Sprintax recording compares against exactly these ids.
    const { lines, blocked } = engineLines('P3', 2026);
    expect(blocked).not.toContain('form-1040nr');
    expect(lines.get(LINE_IDS.deduction)).toBe(16100); // India Art 21(2)
    expect(lines.get(LINE_IDS.taxableIncome)).toBe(0);
    expect(lines.get(LINE_IDS.tax)).toBe(0);
  });
});

describe('comparison verdicts', () => {
  const run = (over: Partial<RecordedRun>): RecordedRun => ({
    persona: 'P1',
    taxYear: 2026,
    tool: 'synthetic',
    toolVersion: 'test',
    recordedOn: '2027-02-01',
    recordedBy: 'test',
    assumptions: [],
    lines: [],
    ...over,
  });

  it('agrees within a dollar of IRS rounding', () => {
    const c = compareRun(
      run({
        lines: [
          { id: '1040:11', label: 'AGI', amount: 42000 },
          { id: '1040:16', label: 'Tax', amount: 2864 }, // tool rounded up
        ],
      }),
    );
    expect(c.agreements).toBe(2);
    expect(c.divergences).toBe(0);
  });

  it('flags a real disagreement as a divergence to triage', () => {
    const c = compareRun(run({ lines: [{ id: '1040:12', label: 'Deduction', amount: 15400 }] }));
    expect(c.divergences).toBe(1);
    expect(c.lines[0]?.delta).toBe(700);
  });

  it('marks the 8615-inflated tax line as a known gap, not a surprise', () => {
    const c = compareRun(
      run({
        persona: 'P2',
        lines: [
          { id: '1040:12', label: 'Deduction', amount: 8450 },
          { id: '1040:16', label: 'Tax incl. Form 8615', amount: 372 },
        ],
      }),
    );
    expect(c.agreements).toBe(1);
    expect(c.knownGaps).toBe(1);
    expect(c.divergences).toBe(0);
    expect(c.lines[1]?.because).toContain('form-8615');
  });

  it('calls a line the engine cannot produce untestable, not wrong', () => {
    const c = compareRun(
      run({ lines: [{ id: '1040:25', label: 'Federal withholding', amount: 3800 }] }),
    );
    expect(c.untestable).toBe(1);
    expect(c.divergences).toBe(0);
  });
});

describe('the C-phase gate', () => {
  it('holds the recordings on file to the contract, honestly either way', () => {
    const runs = loadRecordings();
    const status = validationStatus(runs);

    expect(status.required).toEqual(['P1', 'P2']);
    expect(
      status.deferred.some((d) => d.persona === 'P3' && d.until === 'Sprintax recording'),
    ).toBe(true);

    const satisfied = status.required.every((p) => (status.recordedTools[p] ?? []).length >= 2);
    // The gate is exactly its definition — this test passes before the
    // recordings exist (gate closed, and it says which are missing) and
    // after (gate open only with zero untriaged divergences).
    expect(status.gateOpen).toBe(satisfied && untriagedDivergences(runs).length === 0);
    if (!status.gateOpen) {
      expect(status.detail.length).toBeGreaterThan(10);
    }
  });

  it('a triaged divergence counts as coverage; an untriaged one blocks', () => {
    // The real P2/TaxCaster $50 deduction divergence carries a written
    // triage, so it must not appear untriaged.
    const runs = loadRecordings();
    const p2tc = runs.find((r) => r.persona === 'P2' && r.tool === 'taxcaster');
    if (p2tc) {
      expect(compareRun(p2tc).divergences).toBeGreaterThan(0); // it IS a divergence
      expect(untriagedDivergences([p2tc]).filter((d) => d.lineId === '1040:12')).toEqual([]); // and it IS triaged
    }
    // A synthetic disagreement nobody has triaged must block.
    const rogue: RecordedRun = {
      persona: 'P1',
      taxYear: 2026,
      tool: 'synthetic-rogue',
      toolVersion: 'test',
      recordedOn: '2027-02-01',
      recordedBy: 'test',
      assumptions: [],
      lines: [{ id: '1040:11', label: 'AGI', amount: 999 }],
    };
    expect(untriagedDivergences([rogue])).toHaveLength(1);
  });

  it('rejects a malformed recording loudly', () => {
    const parsed = recordedRunSchema.safeParse({ persona: 'P1', lines: [] });
    expect(parsed.success).toBe(false);
  });
});
