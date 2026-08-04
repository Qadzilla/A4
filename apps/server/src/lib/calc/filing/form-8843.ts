// ─── E2 · Form 8843 ────────────────────────────────────────────────
// The form every exempt individual owes every year, income or none —
// and the paper trail that later defends both the residency status and
// the FICA refund. Nobody bills for it, no tool advertises it, and its
// absence is what turns "obviously exempt" into an argument.
//
// Authority: Form 8843; Pub 519 (exempt individuals).
//
// Everything here rides A2's machinery: whether a year owes the form IS
// residency's form8843Required, computed per calendar year — this module
// adds what A2 doesn't say: the standalone reality (a bare 8843 cannot
// be e-filed; it mails), the Part III fields intake still owes (the
// school), and the catch-up list — prior exempt years with no 8843 on
// record, framed as protective, never punitive (H4 files them).
//
// The fence: J visas cover researchers and scholars too, on a DIFFERENT
// two-year exempt rule Basis doesn't model — a J year with known zero
// student months names that variant and refuses, because the residency
// call underneath it is also in doubt. And the cruel case: a year-six
// resident owes nothing this year — the requirement vanishes rather
// than lingers, while the protective catch-up list for the exempt years
// behind it remains.

import { type FactAssertion, type FactId, factSet, factState } from './facts';
import { determineResidency } from './residency';
import type { RuleTrace } from './trace';

export interface Form8843Determination {
  /** This year owes the form — A2's exempt-individual flag, verbatim. */
  required: boolean;
  /** Required with no return otherwise due — the form still is, by mail. */
  standalone: boolean;
  /** Prior exempt years with no 8843 on record — protective, for H4. */
  catchUp: number[];
  /** Part III wants the school; unresolved fields are named, not guessed. */
  missingFacts: FactId[];
  refusals: string[];
  explanation: RuleTrace;
  consumed: FactId[];
}

const CITE = 'Form 8843; Pub 519 (exempt individuals — students)';

export function determineForm8843(
  assertions: FactAssertion[],
  taxYear: number,
): Form8843Determination {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const notes: string[] = [];

  const read = <T>(id: FactId, kind: 'number' | 'bool' | 'string', at = set): T | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(at, id);
    return s.status === 'known' && s.value.kind === kind ? (s.value.value as T) : null;
  };

  const finish = (
    partial: Partial<Form8843Determination> & { required: boolean },
  ): Form8843Determination => ({
    standalone: false,
    catchUp: [],
    missingFacts: [],
    refusals: [],
    explanation: {
      ruleId: 'form-8843/exempt-year',
      citation: CITE,
      steps: [
        { label: 'Tax year', value: taxYear },
        { label: 'Required', value: partial.required },
      ],
      notes,
    },
    consumed,
    ...partial,
  });

  // ── The J fence: researchers are a different rule, named ──
  const visa = read<string>('visa-type', 'string');
  if (visa === 'J') {
    const months = read<number>('full-time-student-months', 'number');
    if (months !== null && months <= 0) {
      return finish({
        required: false,
        refusals: [
          "A J visa with no student enrollment looks like the researcher/scholar variant — a DIFFERENT two-year exempt rule Basis doesn't model, and the residency call underneath it is in doubt too. The 8843 (and the whole year) needs a preparer; nothing here is guessed.",
        ],
      });
    }
  }

  const residency = determineResidency(assertions, taxYear);
  const required = residency.form8843Required;

  // ── The catch-up list: every prior exempt year with no 8843 on record ──
  // Protective framing on purpose: filing late 8843s defends the exemption
  // (and the FICA refund); it does not create a penalty.
  const firstEntry = read<number>('visa-first-entry-year', 'number');
  const catchUp: number[] = [];
  if (firstEntry !== null) {
    for (let y = firstEntry; y < taxYear; y++) {
      if (!determineResidency(assertions, y).form8843Required) continue;
      const filed = read<boolean>('8843-filed', 'bool', factSet(assertions, y));
      if (filed !== true) catchUp.push(y);
    }
  }
  if (catchUp.length > 0) {
    notes.push(
      `${catchUp.length} earlier exempt year(s) have no Form 8843 on record (${catchUp.join(', ')}). Filing them late is protective, not punitive — each one is the paper that defends the exemption for its year, including for any FICA refund. They mail individually.`,
    );
  }

  if (!required) {
    return finish({ required: false, catchUp });
  }

  // ── Standalone or riding the return ──
  const wages = read<number>('w2-wages', 'number') ?? 0;
  const scholarship = read<number>('taxable-scholarship-income', 'number') ?? 0;
  const standalone = wages <= 0 && scholarship <= 0;
  if (standalone) {
    notes.push(
      'This form is owed even in a year with no income at all — it is what proves the exemption if anyone ever asks, including for the FICA refund. A standalone 8843 cannot be e-filed: it prints, gets signed, and mails to the IRS on its own.',
    );
  } else {
    notes.push('The 8843 rides the 1040-NR — one more sheet in the same filing, due with it.');
  }

  // ── Part III: the form's own fields say what's needed ──
  const missing: FactId[] = [];
  const school = read<string>('school-name', 'string');
  if (school === null) {
    missing.push('school-name');
    notes.push(
      "Part III of the form wants the academic institution's name (and its address and phone, which intake collects with it) — the form's own fields say what's needed; nothing else blocks on it.",
    );
  }

  return finish({ required: true, standalone, catchUp, missingFacts: missing });
}
