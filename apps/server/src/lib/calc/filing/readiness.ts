// ─── A6 · Readiness ────────────────────────────────────────────────
// The honest answer to "am I ready to file?". Grown from desk-status.ts and
// keeping its founding rule: a line that reports resolved because it had
// nothing to check is the worst thing this surface can do — so an empty year
// is not-started, never ready.
//
// This module computes nothing itself. It aggregates the determinations
// (A2–A3 via the evaluation), the priced unknowns (A4), and the two lists
// (A5) into lines, blockers and cautions. Narration is the AI's job over
// this structure; details stay about the data, never about the person.
//
// What blocks and what merely cautions, decided once, here:
//   blocked   — contradictions; a mandatory document past due and absent; a
//               required form Basis can't compute (out of scope or an
//               evaluation block like an unmade election or a 1040-NR year)
//   cautions  — unknowns with a price or a blocked branch (cheap unknowns
//               never stop anyone — the $40-combined case files); documents
//               not yet due (the calendar truth: "ready" before the papers
//               can exist is a caution, not a green light)

import type { DualStatusBrief } from './dual-status';
import { type EvaluationExtras, evaluateYear } from './evaluation';
import {
  FACT_REGISTRY,
  type FactAssertion,
  type FactId,
  factSet,
  factState,
  liveAssertions,
  contradictions as liveContradictions,
} from './facts';
import { determineFicaRefund } from './fica-refund';
import { type RankedUnknown, rankUnknowns } from './forks';
import { determineForm8843 } from './form-8843';
import {
  type ArrivedDoc,
  type Expectation,
  type FormRequirement,
  expectations,
  requiredForms,
} from './requirements';

export type LineStatus = 'resolved' | 'attention' | 'not-started' | 'unknown';

export interface ReadinessLine {
  id: string; // 'form:sch-c' | 'doc:1099-B' | 'fact:self-support-share-pct'
  kind: 'form' | 'document' | 'fact';
  label: string;
  status: LineStatus;
  /** One line, about the data: "due by Feb 15", never "you haven't uploaded". */
  detail: string;
  /** The concrete step, where one exists. */
  action: string | null;
}

export interface Blocker {
  id: string;
  from:
    | 'contradiction'
    | 'mandatory-document'
    | 'unsupported-form'
    | 'computation'
    | 'unanswered-question';
  reason: string;
  /**
   * E5: a dual-status year blocks WITH its brief — detect, name, explain,
   * refuse, and hand over everything already known (Doctrine 7's shape).
   */
  briefing?: DualStatusBrief;
}

export interface Contradiction {
  factId: FactId;
  /** How many live assertions disagree — the sides, for narration. */
  assertionCount: number;
}

export interface Readiness {
  taxYear: number;
  verdict: 'ready' | 'ready-with-cautions' | 'blocked' | 'not-started';
  lines: ReadinessLine[];
  contradictions: Contradiction[];
  blockers: Blocker[];
  /** Priced by A4 — the "worth $1,200 to find out" list, already sorted. */
  unknowns: RankedUnknown[];
  outOfScope: FormRequirement[];
}

/**
 * Assess one tax year. `today` is injectable (the quarterly.ts precedent):
 * document lateness is a fact about the calendar, not about the clock this
 * happened to run on.
 */
export function assessReadiness(
  assertions: FactAssertion[],
  docs: ArrivedDoc[],
  taxYear: number,
  today: Date,
  extras?: EvaluationExtras,
): Readiness {
  // Nothing asserted that touches this year — not-started, with nothing
  // pretending otherwise. Timeless facts alone (a birth date on file from
  // another year's intake) don't make a year started.
  const relevant = liveAssertions(assertions).filter(
    (a) => FACT_REGISTRY[a.factId].scope === 'year' && a.taxYear === taxYear,
  );
  if (relevant.length === 0) {
    return {
      taxYear,
      verdict: 'not-started',
      lines: [],
      contradictions: [],
      blockers: [],
      unknowns: [],
      outOfScope: [],
    };
  }

  const set = factSet(assertions, taxYear);
  const evaluation = evaluateYear(assertions, taxYear, extras);
  const expected = expectations(assertions, taxYear);
  const required = requiredForms(assertions, docs, taxYear);
  const unknowns = rankUnknowns(assertions, taxYear);

  const lines: ReadinessLine[] = [];
  const blockers: Blocker[] = [];

  // ── Contradictions: never averaged, never picked between ──
  const conflicts: Contradiction[] = liveContradictions(set).map((c) => ({
    factId: c.factId,
    assertionCount: c.assertions.length,
  }));
  for (const c of conflicts) {
    blockers.push({
      id: `contradiction:${c.factId}`,
      from: 'contradiction',
      reason: `Two live sources disagree about ${FACT_REGISTRY[c.factId].label.toLowerCase()} — one side has to be corrected before anything downstream is trustworthy.`,
    });
  }

  // ── Required forms ──
  const outOfScope: FormRequirement[] = [];
  for (const req of required) {
    if (req.supported) {
      lines.push({
        id: `form:${req.form}`,
        kind: 'form',
        label: req.form,
        status: 'resolved',
        detail: 'Required this year; Basis computes it.',
        action: null,
      });
      continue;
    }
    outOfScope.push(req);
    lines.push({
      id: `form:${req.form}`,
      kind: 'form',
      label: req.form,
      status: 'attention',
      detail: req.ifUnsupported
        ? `${req.ifUnsupported.whyItApplies} ${req.ifUnsupported.whatItMeans}`
        : 'Required, and not yet computable.',
      action: null,
    });
    blockers.push({
      id: `form:${req.form}`,
      from: 'unsupported-form',
      reason: req.ifUnsupported
        ? `${req.form} is required — ${req.ifUnsupported.whatItMeans}`
        : `${req.form} is required and not yet computable.`,
    });
  }

  // ── The evaluation's own blocks (unmade election, 1040-NR year, …) ──
  // form-1040nr and form-8615 already surface through required forms; the
  // rest are computation states only the evaluation knows.
  for (const item of evaluation.blocked) {
    if (item === 'form-1040nr' || item === 'form-8615') continue;
    if (item === 'dual-status-year') {
      blockers.push({
        id: 'computation:dual-status-year',
        from: 'computation',
        reason:
          'The year straddles residency — a dual-status return is genuinely specialist work Basis refuses to compute. The brief attached here is everything already known, organised so the preparer meeting is twenty minutes instead of two hours.',
        briefing: evaluation.dualStatus ?? undefined,
      });
      continue;
    }
    blockers.push({
      id: `computation:${item}`,
      from: 'computation',
      reason:
        item === 'form-8962'
          ? 'Marketplace coverage is unreconciled: filing without Form 8962 freezes the entire refund — the 1095-A monthly table completes it.'
          : item === 'sch-c'
            ? (evaluation.se?.refusals[0] ??
              'The Schedule C claims an expense outside the simple set — it needs a preparer or the fuller slice.')
            : (evaluation.notes.find((note) => note.length > 0) ??
              `The year cannot be computed: ${item}.`),
    });
  }

  // ── Form 8843: its own line, never a return blocker (E2) ──
  // The requirement row above already covers "this year owes it"; this
  // adds what the row can't say — the standalone mailing reality, the
  // Part III fields still owed, and the protective catch-up list for
  // prior exempt years with no 8843 on record.
  const f8843 = determineForm8843(assertions, taxYear);
  if (f8843.required) {
    const line = lines.find((l) => l.id === 'form:form-8843');
    if (line) {
      line.detail = f8843.standalone
        ? 'Owed even with no income — it is what defends the exemption (and the FICA refund). A standalone 8843 cannot be e-filed; it prints, gets signed, and mails.'
        : 'Rides the 1040-NR — one more sheet in the same filing.';
      if (f8843.missingFacts.length > 0) {
        line.status = 'attention';
        line.action = "Part III wants the school's name — the form's own fields say what's needed.";
      }
    }
  }
  if (f8843.refusals.length > 0) {
    lines.push({
      id: 'form:form-8843',
      kind: 'form',
      label: 'form-8843',
      status: 'attention',
      detail: f8843.refusals[0] as string,
      action: null,
    });
  }
  for (const y of f8843.catchUp) {
    lines.push({
      id: `form:form-8843:${y}`,
      kind: 'form',
      label: `form-8843 (${y})`,
      status: 'attention',
      detail: `No Form 8843 on record for ${y}, an exempt year. Filing it late is protective, not punitive — it is the paper that defends that year's exemption, including for any FICA refund.`,
      action: `Print, sign and mail the ${y} Form 8843 on its own — a standalone 8843 has no e-file.`,
    });
  }

  // ── FICA refund: money outside the return (E4) ──
  // Found money is a line, never a verdict input: $1,240 sitting with
  // the Treasury doesn't make the return less ready, and hiding it
  // until "ready" would bury the single best finding in the product.
  const fica = determineFicaRefund(assertions, taxYear);
  if (fica.status === 'found') {
    lines.push({
      id: 'finding:fica-refund',
      kind: 'fact',
      label: 'FICA withheld in error',
      status: 'attention',
      detail: `$${Math.round(fica.total)} of Social Security and Medicare was withheld from an exempt year — recoverable in full, outside the return. The claim window closes ${fica.claimWindowEnds}.`,
      action:
        'Ask the employer for the refund first (the letter is outlined in the finding); if they refuse or are gone, the Form 843 + 8316 package files on paper.',
    });
  } else if (fica.status === 'refused') {
    lines.push({
      id: 'finding:fica-refund',
      kind: 'fact',
      label: 'FICA withheld — needs a preparer',
      status: 'attention',
      detail: fica.refusals[0] as string,
      action: null,
    });
  }

  // ── The digital-assets question ──
  // On the 1040's face, answered under penalty of perjury, for everyone.
  // A number can be amended later; a false "no" is a different kind of
  // problem — so readiness never says ready while it stands unanswered.
  const digitalAssets = factState(set, 'digital-asset-activity');
  if (digitalAssets.status === 'unasserted' || digitalAssets.status === 'unknown') {
    blockers.push({
      id: 'question:digital-asset-activity',
      from: 'unanswered-question',
      reason:
        'The return asks directly whether digital assets were sold, exchanged or received this year. It must be answered yes or no — it cannot be left blank.',
    });
    lines.push({
      id: 'fact:digital-asset-activity',
      kind: 'fact',
      label: FACT_REGISTRY['digital-asset-activity'].label,
      status: digitalAssets.status === 'unknown' ? 'unknown' : 'not-started',
      detail: 'Asked on the front of the return, under penalty of perjury. Yes or no, never blank.',
      action: 'Answer the digital-assets question either way.',
    });
  }

  // ── Expected documents ──
  // A document satisfies only its own year: P8's corpus case is a 2026 W-2
  // that must not quiet 2025's expectation.
  const arrivedKinds = new Set(
    docs.filter((d) => d.taxYear === undefined || d.taxYear === taxYear).map((d) => d.kind),
  );
  for (const exp of expected) {
    lines.push(documentLine(exp, arrivedKinds, today, blockers));
  }

  // ── Priced unknowns ──
  const worthAsking = unknowns.filter((u) => u.delta > 0 || u.blockedDiffers);
  for (const u of worthAsking) {
    lines.push({
      id: `fact:${u.at}`,
      kind: 'fact',
      label: FACT_REGISTRY[u.at].label,
      status: 'unknown',
      detail:
        u.delta > 0
          ? `Unresolved; the two answers differ by $${u.delta}.`
          : 'Unresolved; the answers lead to different forms.',
      action: null,
    });
  }

  // ── Verdict ──
  const waiting = lines.some((l) => l.kind === 'document' && l.status === 'not-started');
  // Missing prior-year 8843s never block this year's return — but a year
  // with protective filings outstanding is not cleanly "ready" either.
  const verdict =
    blockers.length > 0
      ? 'blocked'
      : worthAsking.length > 0 || waiting || f8843.catchUp.length > 0
        ? 'ready-with-cautions'
        : 'ready';

  return {
    taxYear,
    verdict,
    lines,
    contradictions: conflicts,
    blockers,
    unknowns,
    outOfScope,
  };
}

function documentLine(
  exp: Expectation,
  arrived: Set<string>,
  today: Date,
  blockers: Blocker[],
): ReadinessLine {
  const id = `doc:${exp.document}`;
  if (arrived.has(exp.document)) {
    return {
      id,
      kind: 'document',
      label: exp.document,
      status: 'resolved',
      detail: `On file, from ${exp.from}.`,
      action: null,
    };
  }

  const due = exp.arrivesBy !== null ? new Date(`${exp.arrivesBy}T23:59:59Z`) : null;
  const past = due !== null && today.getTime() > due.getTime();

  if (!past) {
    return {
      id,
      kind: 'document',
      label: exp.document,
      status: 'not-started',
      detail:
        exp.arrivesBy !== null
          ? `Expected from ${exp.from} by ${exp.arrivesBy}.`
          : `Expected from ${exp.from}.`,
      action: null,
    };
  }

  // Past due. Mandatory absence blocks; a threshold document that may
  // legitimately never come only asks for a look.
  if (exp.mandatory) {
    blockers.push({
      id,
      from: 'mandatory-document',
      reason: `The ${exp.document} from ${exp.from} was due by ${exp.arrivesBy} and isn't on file — the year can't be finished without it.`,
    });
    return {
      id,
      kind: 'document',
      label: exp.document,
      status: 'attention',
      detail: `Due by ${exp.arrivesBy}; not on file.`,
      action: `Ask ${exp.from} for it, or pull the IRS Wage & Income transcript — it lists every form they received.`,
    };
  }
  return {
    id,
    kind: 'document',
    label: exp.document,
    status: 'attention',
    detail: `Not on file past ${exp.arrivesBy} — for this document that can be normal (${exp.from}).`,
    action: null,
  };
}
