// ─── A8 · External validation, the harness ─────────────────────────
// The answer to "how do we know it's right." Our corpus proves internal
// consistency; agreement with independent implementations is the only
// external evidence there is. A person enters the persona's facts into a
// real filing tool by hand, records every line the tool produced into
// validation/expected/, and this harness compares — in CI, forever after.
//
// The manual step is producing recordings, never running the check. And a
// recording is a frozen artifact with provenance: edited only by
// re-performing the external run — never to make a test pass.

import { z } from 'zod';
import { evaluateYear } from '../evaluation';
import { PERSONA_FIXTURES } from '../fixtures/personas';
import { assertionsOf } from '../fixtures/types';
import { DIVERGENCE_TRIAGE } from './triage';

/**
 * The comparable surface: 1040 lines by their real numbers, so a recording
 * reads exactly like the tool's output. FICA withheld via payroll is not a
 * return line and is deliberately absent.
 */
export const LINE_IDS = {
  agi: '1040:11',
  deduction: '1040:12',
  taxableIncome: '1040:15',
  tax: '1040:16', // income tax incl. the LTCG worksheet
  totalTax: '1040:24', // incl. NIIT; SE tax joins when D4 lands
} as const;

export const recordedRunSchema = z.object({
  persona: z.string().regex(/^P[1-8]$/),
  taxYear: z.number().int(),
  tool: z.string().min(2),
  toolVersion: z.string().min(1), // e.g. "FreeTaxUSA 2026 season, accessed 2027-02-03"
  recordedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recordedBy: z.string().min(1),
  /** Assumptions the tool forced (e.g. the parents' income for Form 8615). */
  assumptions: z.array(z.string()),
  lines: z
    .array(
      z.object({
        id: z.string().min(3),
        label: z.string().min(1),
        amount: z.number(),
      }),
    )
    .min(1),
  notes: z.string().optional(),
});

export type RecordedRun = z.infer<typeof recordedRunSchema>;

export interface LineComparison {
  id: string;
  label: string;
  recorded: number;
  engine: number | null;
  verdict:
    | 'agreement' // within $1 — IRS rounding
    | 'divergence' // real disagreement: triage in writing before anything merges
    | 'known-gap' // the engine flagged its own understatement (a blocked form)
    | 'untestable'; // the engine has no counterpart line yet (e.g. withholding)
  delta: number | null;
  /** For known-gap: the blocked computations that explain it. */
  because: string[];
}

export interface RunComparison {
  persona: string;
  tool: string;
  taxYear: number;
  lines: LineComparison[];
  agreements: number;
  divergences: number;
  knownGaps: number;
  untestable: number;
}

/** IRS rounding: whole dollars, so a dollar of drift is agreement. */
const TOLERANCE = 1;

/**
 * The engine's side of the comparison for a persona fixture, as 1040 lines.
 * Null liability (an unmade election, income E1 refuses) yields no lines
 * and the blocked names. A computed 1040-NR emits the same core line ids —
 * the 1040-NR shares the 1040's numbering for lines 11/12/15/16/24, so a
 * Sprintax recording compares against exactly this surface.
 */
export function engineLines(personaId: string, taxYear: number) {
  const fixture = PERSONA_FIXTURES.find(
    (f) => f.source.kind === 'persona' && f.source.persona === personaId,
  );
  if (!fixture) throw new Error(`no persona fixture for ${personaId}`);
  const evaluation = evaluateYear(assertionsOf(fixture), taxYear);
  const lines = new Map<string, number>();
  if (evaluation.liability !== null) {
    lines.set(LINE_IDS.agi, evaluation.liability.agi);
    lines.set(LINE_IDS.deduction, evaluation.liability.deduction);
    lines.set(LINE_IDS.taxableIncome, evaluation.liability.taxableIncome);
    lines.set(LINE_IDS.tax, evaluation.liability.incomeTax);
    lines.set(LINE_IDS.totalTax, evaluation.liability.federalTax);
  }
  return { lines, blocked: evaluation.blocked as string[] };
}

/**
 * Lines the engine knows it understates while a computation is blocked —
 * a tool that computes Form 8615 will disagree with us on the tax lines,
 * and that disagreement is a recorded gap, not a surprise.
 */
const TAX_LINES: string[] = [LINE_IDS.tax, LINE_IDS.totalTax];

export function compareRun(recorded: RecordedRun): RunComparison {
  const engine = engineLines(recorded.persona, recorded.taxYear);
  const lines: LineComparison[] = recorded.lines.map((line) => {
    const value = engine.lines.get(line.id);
    if (value === undefined) {
      return {
        id: line.id,
        label: line.label,
        recorded: line.amount,
        engine: null,
        verdict: 'untestable' as const,
        delta: null,
        because: engine.blocked,
      };
    }
    const delta = Math.abs(value - line.amount);
    if (delta <= TOLERANCE) {
      return {
        id: line.id,
        label: line.label,
        recorded: line.amount,
        engine: value,
        verdict: 'agreement' as const,
        delta,
        because: [],
      };
    }
    const knownGap = engine.blocked.length > 0 && TAX_LINES.includes(line.id);
    return {
      id: line.id,
      label: line.label,
      recorded: line.amount,
      engine: value,
      verdict: knownGap ? ('known-gap' as const) : ('divergence' as const),
      delta,
      because: knownGap ? engine.blocked : [],
    };
  });

  return {
    persona: recorded.persona,
    tool: recorded.tool,
    taxYear: recorded.taxYear,
    lines,
    agreements: lines.filter((l) => l.verdict === 'agreement').length,
    divergences: lines.filter((l) => l.verdict === 'divergence').length,
    knownGaps: lines.filter((l) => l.verdict === 'known-gap').length,
    untestable: lines.filter((l) => l.verdict === 'untestable').length,
  };
}

// ─── The C-phase gate ──────────────────────────────────────────────

export interface ValidationStatus {
  /** persona → distinct tools with a recording on file. */
  recordedTools: Record<string, string[]>;
  /** Personas the contract requires before C-phase merges anything. */
  required: string[];
  /** Explicitly untested-externally until their phase lands, by design. */
  deferred: Array<{ persona: string; until: string; why: string }>;
  /** True only when every required persona has two tools and no divergences. */
  gateOpen: boolean;
  detail: string;
}

/**
 * Divergences with no written triage — the ones that keep the gate closed.
 * A triaged divergence is a recorded disagreement with a reason and an
 * authority; it counts as coverage, not as a defect.
 */
export function untriagedDivergences(
  runs: RecordedRun[],
): Array<{ persona: string; tool: string; lineId: string; delta: number | null }> {
  const out: Array<{ persona: string; tool: string; lineId: string; delta: number | null }> = [];
  for (const run of runs) {
    const comparison = compareRun(run);
    for (const line of comparison.lines) {
      if (line.verdict !== 'divergence') continue;
      const triaged = DIVERGENCE_TRIAGE.some(
        (t) => t.persona === run.persona && t.tool === run.tool && t.lineId === line.id,
      );
      if (!triaged) {
        out.push({ persona: run.persona, tool: run.tool, lineId: line.id, delta: line.delta });
      }
    }
  }
  return out;
}

export function validationStatus(runs: RecordedRun[]): ValidationStatus {
  const required = ['P1', 'P2'];
  const recordedTools: Record<string, string[]> = {};
  for (const run of runs) {
    const tools = recordedTools[run.persona] ?? [];
    if (!tools.includes(run.tool)) tools.push(run.tool);
    recordedTools[run.persona] = tools;
  }

  const divergences = untriagedDivergences(runs).length;

  const satisfied = required.every((p) => (recordedTools[p] ?? []).length >= 2);
  const gateOpen = satisfied && divergences === 0;

  return {
    recordedTools,
    required,
    deferred: [
      {
        persona: 'P3',
        until: 'Sprintax recording',
        why: 'The engine computes the 1040-NR since E1; what remains is the external run against a nonresident-capable tool (Sprintax or equivalent), recorded like the resident personas.',
      },
    ],
    gateOpen,
    detail: gateOpen
      ? 'P1 and P2 validated against two tools each, no untriaged divergences — C-phase may merge.'
      : satisfied
        ? `Recordings exist but ${divergences} untriaged divergence(s) need a written verdict before C-phase merges.`
        : `C-phase is gated: ${required
            .filter((p) => (recordedTools[p] ?? []).length < 2)
            .map((p) => `${p} has ${(recordedTools[p] ?? []).length}/2 tool recordings`)
            .join('; ')}.`,
  };
}
