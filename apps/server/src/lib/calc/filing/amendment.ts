// ─── H2 · Amendments ───────────────────────────────────────────────
// The March reality. The return went in on the 3rd; the corrected 1099
// lands on the 12th. The difference between panic and a worksheet is
// this module.
//
// Authority (verified 2026-08-07):
//   IRC §6511(a) / IRS Topic 308 — a claim for refund must be filed
//     within THREE years of filing the return or TWO years of paying
//     the tax, whichever is LATER.
//   IRC §6513(a) — a return filed before the due date is treated as
//     filed ON the due date. So filing in February buys nothing; the
//     clock starts in April either way.
//   IRC §6513(b) — tax withheld from wages is deemed paid on the due
//     date too. For anyone whose only payments are withholding, both
//     limbs therefore start on the same day and the three-year one
//     always wins. That is most of this product's audience, and the
//     module says so rather than presenting two clocks as a live race.
//
// THE DIFF IS SNAPSHOT-VERSUS-LIVE, not a log of supersessions. That
// choice is what makes the cruel case fall out for free: two corrections
// before anyone files an amendment produce ONE amendment carrying the
// combined change, because the question was never "what changed?" but
// "what does the return say now that it didn't say then?"
//
// De-minimis: the spec assumed the IRS publishes a math-error tolerance
// to compare against. It doesn't — Topic 308 says only that the IRS "may
// correct certain errors" and that no amendment is needed in those
// cases. So no threshold is invented here. The line is the return's own
// unit: a change that rounds to zero whole dollars changes no line on
// any form, and is reported as needing nothing.

import type { FactId, FactValue } from './facts';
import type { Manifest } from './manifest';

export interface AmendedLine {
  id: string;
  label: string;
  /** Column A — as filed, from the snapshot. Null if the line is new. */
  asFiled: number | null;
  /** Column C — as corrected, from the live year. Null if it went away. */
  asCorrected: number | null;
  /** Column B — the change. Always C − A, with absent read as zero. */
  change: number;
}

export interface AmendmentCause {
  factId: FactId;
  /** The question it was asked as. */
  label: string;
  before: FactValue | null;
  /** Null when the fact stopped being cited at all. */
  after: FactValue | null;
  origin: 'person' | 'document' | 'rule';
  /** The document that carried the new figure, when one did. */
  fileId: string | null;
}

export type ClaimLimb = 'three-years-from-filing' | 'two-years-from-payment';

export interface ClaimClock {
  /** The later of the two limbs — §6511(a). */
  deadline: string;
  boundBy: ClaimLimb;
  daysRemaining: number;
  status: 'open' | 'closing-soon' | 'closed';
  note: string;
}

export type AmendmentStatus =
  /** Nothing about the return moved. */
  | 'no-change'
  /** It moved, but not by enough to change a line on any form. */
  | 'no-action-needed'
  /** A real change, and the worksheet below is it. */
  | 'amend'
  /** A refund is owed and the window to claim it has shut. */
  | 'refund-window-closed';

export interface Amendment {
  taxYear: number;
  status: AmendmentStatus;
  baseline: { snapshotId: string; takenAt: string; filedAt: string | null };
  lines: AmendedLine[];
  /** What the year's tax became, minus what it was. */
  taxChange: number;
  /** Negative: more money back. Positive: more owed. */
  refundChange: number;
  causes: AmendmentCause[];
  /** Form 1040-X Part III, drafted from the diff. */
  explanation: string;
  claimClock: ClaimClock | null;
  notes: string[];
}

const DAY_MS = 86_400_000;
const CLOSING_SOON_DAYS = 90;

const money = (n: number): string => `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

/** The lines a 1040-X actually reconciles on. */
const TOTAL_TAX = '1040:24';
const OWED = '1040:37';
const REFUND = '1040:34';

function amountOf(manifest: Manifest, id: string): number | null {
  for (const form of manifest.forms) {
    const line = form.lines.find((l) => l.id === id);
    if (line !== undefined) return line.amount;
  }
  return null;
}

/** Signed: positive means owed, negative means refunded. */
function bottomLine(manifest: Manifest): number {
  const owed = amountOf(manifest, OWED);
  if (owed !== null) return owed;
  const refund = amountOf(manifest, REFUND);
  return refund !== null ? -refund : 0;
}

export interface AmendmentInput {
  taxYear: number;
  /** The frozen manifest — column A. */
  snapshot: Manifest;
  snapshotId: string;
  /** When the person says they filed it. Null means they haven't said. */
  filedAt: string | null;
  /** The year as it stands now — column C. */
  live: Manifest;
  today: Date;
}

export function buildAmendment(input: AmendmentInput): Amendment {
  const { snapshot, live, taxYear, today } = input;
  const notes: string[] = [];

  // ── The columns ──
  // Federal only. A 1040-X amends a federal return; every state has its
  // own amended form with its own rules and its own clock, and none of
  // them is modelled yet. A state line quietly appearing in this
  // worksheet would read as "handled".
  const ids: string[] = [];
  const stateMoved: string[] = [];
  for (const manifest of [snapshot, live]) {
    for (const form of manifest.forms) {
      const isState = String(form.form).startsWith('state-');
      for (const line of form.lines) {
        if (isState) {
          const delta = (amountOf(live, line.id) ?? 0) - (amountOf(snapshot, line.id) ?? 0);
          if (Math.round(delta) !== 0 && !stateMoved.includes(form.label)) {
            stateMoved.push(form.label);
          }
          continue;
        }
        if (!ids.includes(line.id)) ids.push(line.id);
      }
    }
  }

  const lines: AmendedLine[] = [];
  for (const id of ids) {
    const asFiled = amountOf(snapshot, id);
    const asCorrected = amountOf(live, id);
    const change = (asCorrected ?? 0) - (asFiled ?? 0);
    if (Math.round(change) === 0) continue;
    lines.push({
      id,
      label: labelOf(live, id) ?? labelOf(snapshot, id) ?? id,
      asFiled,
      asCorrected,
      change,
    });
  }

  const taxChange = (amountOf(live, TOTAL_TAX) ?? 0) - (amountOf(snapshot, TOTAL_TAX) ?? 0);
  const refundChange = bottomLine(live) - bottomLine(snapshot);

  // ── What caused it ──
  const causes = causesOf(snapshot, live);

  // ── The clock ──
  const clock = claimClock(taxYear, input.filedAt, today);

  // ── Status ──
  let status: AmendmentStatus;
  if (lines.length === 0 && Math.round(taxChange) === 0) {
    status = 'no-change';
  } else if (Math.round(taxChange) === 0) {
    // Lines moved but the tax didn't. Nothing to file: an amendment
    // exists to change what is owed, and nothing here is owed
    // differently.
    status = 'no-action-needed';
    notes.push(
      'Figures on the return moved, but the tax they produce did not change by a whole dollar. Nothing needs to be filed — an amended return exists to change what you owe, and that has not changed.',
    );
  } else if (refundChange < 0 && clock !== null && clock.status === 'closed') {
    status = 'refund-window-closed';
    notes.push(
      `This change would have brought back ${money(refundChange)}, but the window to claim a refund for ${taxYear} closed on ${clock.deadline}. The money stays with the Treasury; nothing gives it back after that date.`,
    );
  } else {
    status = 'amend';
  }

  // An amendment that INCREASES tax is never barred by the refund
  // clock — §6511 limits claims for money back, not payments in. Saying
  // "too late" to someone who owes more would be both wrong and the
  // more expensive kind of wrong.
  if (status === 'amend' && refundChange > 0 && clock !== null && clock.status === 'closed') {
    notes.push(
      'The refund-claim window for this year has closed, which does not apply here: this change increases what you owe, and a return can be amended to pay more at any time.',
    );
  }

  for (const label of stateMoved) {
    notes.push(
      `${label} also changed. Basis does not produce amended state returns — each state has its own form, its own rules and its own deadline, and none of them is a copy of the 1040-X. The state's own figures are on your year, and this is the one thing on this page to hand to someone else.`,
    );
  }

  // The CP2000 posture, recorded where it belongs. The reconciliation
  // work exists so this letter never arrives; if one does, the same
  // diff below is what explains it — but writing the response is not
  // something this product does, and saying so is better than a page
  // that quietly stops being useful at the hard part.
  if (status === 'amend' || status === 'refund-window-closed') {
    notes.push(
      'If the IRS has written to you about a mismatch for this year, the worksheet below is what explains it — it shows exactly which line disagrees and why. Replying to that letter is a different job, and not one Basis does: the response goes on their form, in their words, and it is worth having someone read it first.',
    );
  }

  if (input.filedAt === null && status === 'amend') {
    notes.push(
      'This snapshot has no filing date on it, so the deadline below assumes the return went in on time. Mark when you actually filed and the clock recomputes.',
    );
  }

  return {
    taxYear,
    status,
    baseline: {
      snapshotId: input.snapshotId,
      takenAt: snapshot.builtAt,
      filedAt: input.filedAt,
    },
    lines,
    taxChange,
    refundChange,
    causes,
    explanation: draftExplanation(status, causes, lines, taxChange, refundChange, taxYear),
    claimClock: clock,
    notes,
  };
}

function labelOf(manifest: Manifest, id: string): string | null {
  for (const form of manifest.forms) {
    const line = form.lines.find((l) => l.id === id);
    if (line !== undefined) return line.label;
  }
  return null;
}

/**
 * What changed underneath. Read off the provenance both manifests
 * already carry: a fact whose live assertion id differs from the one the
 * snapshot cited is a fact that has been superseded since.
 */
function causesOf(snapshot: Manifest, live: Manifest): AmendmentCause[] {
  const before = new Map<FactId, { value: FactValue; assertionId: string }>();
  for (const form of snapshot.forms) {
    for (const line of form.lines) {
      for (const f of line.provenance.facts) {
        before.set(f.factId, { value: f.value, assertionId: f.assertionId });
      }
    }
  }

  const causes: AmendmentCause[] = [];
  const seen = new Set<FactId>();
  for (const form of live.forms) {
    for (const line of form.lines) {
      for (const f of line.provenance.facts) {
        if (seen.has(f.factId)) continue;
        const was = before.get(f.factId);
        // Unchanged assertion id means the same answer is still standing.
        if (was !== undefined && was.assertionId === f.assertionId) continue;
        seen.add(f.factId);
        causes.push({
          factId: f.factId,
          label: f.label,
          before: was?.value ?? null,
          after: f.value,
          origin: f.origin,
          fileId: f.fileId,
        });
      }
    }
  }
  return causes;
}

// ─── The claim clock ───────────────────────────────────────────────

function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${y + years}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * §6511(a), with §6513 doing the quiet work.
 *
 * Filing early buys nothing: the return is treated as filed on the due
 * date, so the three-year clock starts there regardless. Filing late
 * starts it on the day it actually went in — which is the one case
 * where the two limbs can come apart.
 */
export function claimClock(taxYear: number, filedAt: string | null, today: Date): ClaimClock {
  const dueDate = `${taxYear + 1}-04-15`;
  // §6513(a): a return filed before the due date is filed ON the due date.
  const effectiveFiling = filedAt !== null && filedAt > dueDate ? filedAt : dueDate;
  const threeYears = addYears(effectiveFiling, 3);
  // §6513(b): withholding is deemed paid on the due date, so for anyone
  // paying through payroll this limb starts there too.
  const twoYears = addYears(dueDate, 2);

  const boundBy: ClaimLimb =
    threeYears >= twoYears ? 'three-years-from-filing' : 'two-years-from-payment';
  const deadline = threeYears >= twoYears ? threeYears : twoYears;

  // Floor, and decide `closed` off the raw difference rather than the
  // rounded day count. Rounding reported a deadline that had passed an
  // hour ago as still open, which for a forfeit clock is the wrong
  // direction to be wrong in: the money is already gone.
  const msRemaining = new Date(`${deadline}T23:59:59Z`).getTime() - today.getTime();
  const daysRemaining = Math.floor(msRemaining / DAY_MS);
  const status =
    msRemaining < 0 ? 'closed' : daysRemaining <= CLOSING_SOON_DAYS ? 'closing-soon' : 'open';

  const note =
    filedAt !== null && filedAt > dueDate
      ? `Filed late, on ${filedAt}, so the three-year clock runs from that day rather than the deadline.`
      : filedAt !== null && filedAt < dueDate
        ? `Filed on ${filedAt}, before the deadline — which counts as filing on ${dueDate}, so the clock starts there either way.`
        : `Three years from the ${dueDate} deadline. Tax taken out of your pay counts as paid on that date too, so the two-year rule starts on the same day and never runs longer.`;

  return { deadline, boundBy, daysRemaining, status, note };
}

// ─── Part III ──────────────────────────────────────────────────────

/**
 * The 1040-X's explanation box, drafted from what actually moved.
 *
 * Written to be edited rather than sent: it names the cause, the lines,
 * and the direction, in the register the form expects.
 */
function draftExplanation(
  status: AmendmentStatus,
  causes: AmendmentCause[],
  lines: AmendedLine[],
  taxChange: number,
  refundChange: number,
  taxYear: number,
): string {
  if (status === 'no-change') {
    return `Nothing about the ${taxYear} return has changed since it was filed.`;
  }

  const sourceWords = causes.map((c) => {
    const from = c.before !== null ? describe(c.before) : 'nothing recorded';
    const to = c.after !== null ? describe(c.after) : 'nothing recorded';
    const how =
      c.origin === 'document'
        ? 'A document received after filing'
        : c.origin === 'rule'
          ? 'A recomputation'
          : 'A corrected answer';
    // The label is the intake's question, verbatim and fenced. It has to
    // be quoted rather than spliced into the sentence — "changed did you
    // get tips in cash" is what splicing produces.
    return `${how} to "${c.label}" moved it from ${from} to ${to}.`;
  });

  const lineWords = lines
    .filter((l) => l.id !== TOTAL_TAX && l.id !== OWED && l.id !== REFUND)
    .map(
      (l) =>
        `${l.label} (line ${l.id.split(':')[1]}) changes from ${money(l.asFiled ?? 0)} to ${money(l.asCorrected ?? 0)}.`,
    );

  if (status === 'no-action-needed') {
    return [
      ...sourceWords,
      ...lineWords,
      'The tax for the year is unchanged, so no amended return is being filed.',
    ].join(' ');
  }

  const direction =
    refundChange < 0
      ? `This increases the refund due by ${money(refundChange)}.`
      : `This increases the tax owed by ${money(refundChange)}.`;

  return [...sourceWords, ...lineWords, direction].join(' ');
}

function describe(value: FactValue): string {
  if (value.kind === 'unknown') return 'unknown';
  if (value.kind === 'number') return money(value.value);
  if (value.kind === 'bool') return value.value ? 'yes' : 'no';
  return String(value.value);
}
