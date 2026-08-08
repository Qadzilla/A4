// ─── G4 · The absence board ────────────────────────────────────────
// Doctrine 4 gets a face. Every other surface in this product answers
// "what do I have?"; this one answers "what should exist that doesn't?"
// — which is the question that actually costs people money, because a
// document nobody is waiting for is a document nobody chases.
//
// A5 already computes what a year should produce and A6 already folds
// that into a verdict. What neither does is show the wait: an
// expectation flattened into a readiness line loses the two things a
// person needs to act — WHY this is expected of them, and WHETHER the
// date has passed. Both are here, and `because` is carried through as
// fact ids rather than prose so the surface can make it tappable back
// to the answer that caused it.
//
// Five states, and the last two are not the same thing. `arrived` means
// the file is on the desk. `matched` means the engine read it and its
// numbers are in the year. A document sitting unextracted looks
// finished and isn't, and a board that called those both "done" would
// be lying in the most reassuring possible way.

import { FACT_REGISTRY, type FactAssertion, type FactId, factSet, factState } from './facts';
import { INTAKE_QUESTIONS } from './intake';
import type { ArrivedDoc, DocumentKind, Expectation } from './requirements';
import { expectations } from './requirements';

export type ArrivalState = 'waiting' | 'due' | 'late' | 'arrived' | 'matched';

/** How close to its date a document has to be before it reads as due. */
const DUE_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

export interface BoardItem {
  document: DocumentKind;
  /** Who should send it, in plain words. */
  from: string;
  /** The answers that make Basis expect this — tappable, not prose. */
  because: Array<{ factId: FactId; label: string }>;
  arrivesBy: string | null;
  mandatory: boolean;
  state: ArrivalState;
  /** Days past the date when late, days remaining when due. Null otherwise. */
  days: number | null;
  /** One line about the document. Never about the person. */
  detail: string;
  action: string | null;
  /** What satisfied it, when something did. */
  fileIds: string[];
}

export interface NoPaperTrail {
  factId: FactId;
  label: string;
  /** The form that would have confirmed it, where one exists at all. */
  wouldHaveBeen: DocumentKind | null;
  detail: string;
}

export interface UnmatchedArrival {
  document: DocumentKind;
  fileId: string;
  /** The G1 hook: nothing in the year's answers expected this. */
  prompt: string;
}

/**
 * Where the calendar is. Before the first statutory date, waiting is
 * simply the state of the world — a board that shows five "missing"
 * rows on January 3rd is manufacturing alarm out of the calendar.
 */
export type Season = 'too-early' | 'arriving' | 'all-due';

export interface AbsenceBoard {
  taxYear: number;
  season: Season;
  items: BoardItem[];
  /** Income the return reports that no form will ever confirm. */
  noPaperTrail: NoPaperTrail[];
  /** Documents that turned up with nothing expecting them. */
  unmatched: UnmatchedArrival[];
  counts: Record<ArrivalState, number>;
  /** One line: what the year should produce, and what hasn't shown up. */
  headline: string;
}

/**
 * Income that is taxable whether or not paper confirms it. The document
 * named is what WOULD have confirmed it — absent because a threshold
 * wasn't met, or because no such form exists for this kind of money.
 *
 * Each carries its own plain name. The registry's label is written to
 * describe a field ("Tips never reported to the employer (cash the
 * paperwork missed — Form 4137 reports them)") and belongs in a schema,
 * not on a board someone reads — that is the same fence G1 put around
 * the intake's questions, applied to the one other surface that shows
 * fact labels to a person.
 */
const CONFIRMING_DOCUMENT: Partial<
  Record<FactId, { name: string; doc: DocumentKind | null; why: string }>
> = {
  'contract-income': {
    name: 'Freelance and contract pay',
    doc: '1099-NEC',
    why: 'No client paid enough for one to be required. The income is reported either way, from your own records.',
  },
  'platform-income': {
    name: 'Money through payment apps and platforms',
    doc: '1099-K',
    why: 'Below the platform-reporting threshold, so none is coming. The income is reported either way, from the platform statements.',
  },
  'unreported-tips': {
    name: 'Cash tips',
    doc: null,
    why: 'Tips the employer never saw appear on no form at all — the only record is yours.',
  },
  'crypto-proceeds': {
    name: 'Crypto sold or swapped',
    doc: null,
    why: 'Most exchanges issue nothing for a sale or swap. The transaction history is the record.',
  },
  'gambling-winnings': {
    name: 'Betting and gambling winnings',
    doc: 'W-2G',
    why: 'Below the payer-reporting threshold, so no form was issued. Winnings are reported regardless.',
  },
};

/**
 * What to call a fact in front of a person.
 *
 * G1 already wrote a life-language sentence for most facts and put a
 * blocklist test around them, so the "why this is expected" chain reads
 * back the question they actually answered. The registry label is the
 * fallback and is second choice on purpose: it describes a field, and
 * some of them say things like "W-2 box 1 total".
 */
const ASKED_AS = new Map(INTAKE_QUESTIONS.map((q) => [q.factId, q.prompt]));

const nameFor = (factId: FactId): string => {
  const asked = ASKED_AS.get(factId);
  if (asked !== undefined) return asked;
  // No question exists for the document-sourced facts — G1 leaves those
  // out deliberately, since a person shouldn't be asked to read a number
  // off a form they uploaded. Their labels end in a where-to-find-it
  // note ("(W-2 box 1 total)") that is useful in a schema and is form
  // vocabulary on a board, so it comes off here.
  return FACT_REGISTRY[factId].label.replace(/\s*\([^)]*\)\s*$/, '');
};

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function absenceBoard(
  assertions: FactAssertion[],
  docs: ArrivedDoc[],
  taxYear: number,
  today: Date,
): AbsenceBoard {
  const set = factSet(assertions, taxYear);
  const expected = expectations(assertions, taxYear);

  // A document satisfies only its own year: a 2026 W-2 must not quiet
  // 2025's expectation, however tempting the filename is.
  const forYear = docs.filter((d) => d.taxYear === undefined || d.taxYear === taxYear);
  const filesByKind = new Map<string, string[]>();
  for (const d of forYear) {
    filesByKind.set(d.kind, [...(filesByKind.get(d.kind) ?? []), d.fileId]);
  }

  // Which files the engine has actually read. A document-sourced
  // assertion names the file it came from, so this is a fact about the
  // ledger rather than an assumption about the job queue.
  const extractedFiles = new Set<string>();
  for (const [, state] of set.byId) {
    if (state.status === 'unasserted') continue;
    for (const a of state.assertions) {
      if (a.source.kind === 'document') extractedFiles.add(a.source.fileId);
    }
  }

  const items = expected.map((exp) =>
    boardItem(exp, filesByKind.get(exp.document) ?? [], extractedFiles, today),
  );

  // ── The strip: income no form will confirm ──
  const noPaperTrail: NoPaperTrail[] = [];
  const expectedKinds = new Set(expected.map((e) => e.document));
  for (const [factId, entry] of Object.entries(CONFIRMING_DOCUMENT) as Array<
    [FactId, { name: string; doc: DocumentKind | null; why: string }]
  >) {
    const state = factState(set, factId);
    if (state.status !== 'known' || state.value.kind !== 'number' || state.value.value <= 0) {
      continue;
    }
    // A form that IS expected covers it; this strip is only what paper won't.
    if (entry.doc !== null && expectedKinds.has(entry.doc)) continue;
    noPaperTrail.push({
      factId,
      label: entry.name,
      wouldHaveBeen: entry.doc,
      detail: entry.why,
    });
  }

  // ── Arrivals nothing asked for ──
  const unmatched: UnmatchedArrival[] = forYear
    .filter((d) => !expectedKinds.has(d.kind))
    .map((d) => ({
      document: d.kind,
      fileId: d.fileId,
      prompt: `A ${d.kind} arrived for ${taxYear} and nothing in your answers expected one. Tell me about it — whatever it is usually opens something the year hasn't accounted for.`,
    }));

  const counts: Record<ArrivalState, number> = {
    waiting: 0,
    due: 0,
    late: 0,
    arrived: 0,
    matched: 0,
  };
  for (const item of items) counts[item.state] += 1;

  const season = seasonOf(expected, today);
  return {
    taxYear,
    season,
    items,
    noPaperTrail,
    unmatched,
    counts,
    headline: headlineFor(items, counts, season, taxYear),
  };
}

function boardItem(
  exp: Expectation,
  fileIds: string[],
  extractedFiles: Set<string>,
  today: Date,
): BoardItem {
  const because = exp.because.map((factId) => ({
    factId,
    label: nameFor(factId),
  }));
  const base = {
    document: exp.document,
    from: exp.from,
    because,
    arrivesBy: exp.arrivesBy,
    mandatory: exp.mandatory,
    fileIds,
  };

  if (fileIds.length > 0) {
    const read = fileIds.some((id) => extractedFiles.has(id));
    return read
      ? {
          ...base,
          state: 'matched',
          days: null,
          detail: `On file from ${exp.from}, and its figures are in the year.`,
          action: null,
        }
      : {
          ...base,
          state: 'arrived',
          days: null,
          // Uploaded is not the same as read, and the gap is where a
          // person thinks they are finished and isn't.
          detail: `On file from ${exp.from}. Its figures haven't been read into the year yet.`,
          action: 'Give the extraction a moment, or open the document to check it came through.',
        };
  }

  if (exp.arrivesBy === null) {
    return {
      ...base,
      state: 'waiting',
      days: null,
      detail: `Expected from ${exp.from}. No fixed date for this one.`,
      action: null,
    };
  }

  const due = new Date(`${exp.arrivesBy}T23:59:59Z`);
  const remaining = daysBetween(today, due);

  if (remaining < 0) {
    return {
      ...base,
      state: 'late',
      days: Math.abs(remaining),
      detail: exp.mandatory
        ? `Due ${exp.arrivesBy} from ${exp.from}; ${Math.abs(remaining)} days past and not on file.`
        : `Due ${exp.arrivesBy} from ${exp.from} and not on file — though this one is only sent above a threshold, so it may never come.`,
      action: exp.mandatory
        ? `Ask ${exp.from} for it, or pull the IRS Wage & Income transcript — it lists every form they sent.`
        : 'If the amount was small enough, nothing is coming and the income is reported from your own records instead.',
    };
  }

  if (remaining <= DUE_WINDOW_DAYS) {
    return {
      ...base,
      state: 'due',
      days: remaining,
      detail: `Due ${exp.arrivesBy} from ${exp.from} — ${remaining} day${remaining === 1 ? '' : 's'} away.`,
      action: null,
    };
  }

  return {
    ...base,
    state: 'waiting',
    days: remaining,
    detail: `Expected from ${exp.from} by ${exp.arrivesBy}.`,
    action: null,
  };
}

function seasonOf(expected: Expectation[], today: Date): Season {
  const dates = expected
    .map((e) => e.arrivesBy)
    .filter((d): d is string => d !== null)
    .sort();
  if (dates.length === 0) return 'arriving';
  const first = new Date(`${dates[0] as string}T23:59:59Z`);
  const last = new Date(`${dates[dates.length - 1] as string}T23:59:59Z`);
  if (today.getTime() < first.getTime()) return 'too-early';
  return today.getTime() > last.getTime() ? 'all-due' : 'arriving';
}

function headlineFor(
  items: BoardItem[],
  counts: Record<ArrivalState, number>,
  season: Season,
  taxYear: number,
): string {
  if (items.length === 0) {
    return `Nothing in your ${taxYear} answers yet says a document should be coming.`;
  }
  if (season === 'too-early') {
    return `${items.length} document${items.length === 1 ? '' : 's'} should arrive for ${taxYear}. None is late — the first isn't due yet.`;
  }

  const late = items.filter((i) => i.state === 'late');
  if (late.length === 0) {
    const outstanding = counts.waiting + counts.due;
    return outstanding === 0
      ? `Everything ${taxYear} should produce is on file.`
      : `${outstanding} of ${items.length} still to come, and nothing is late.`;
  }
  // The finding this board exists for: name the one thing, not the count.
  // Name the one thing, not the count: a mandatory absence outranks a
  // threshold one, and among equals the one waiting longest.
  const ranked = [...late].sort(
    (a, b) => Number(b.mandatory) - Number(a.mandatory) || (b.days ?? 0) - (a.days ?? 0),
  );
  const worst = ranked[0] as BoardItem;
  return late.length === 1
    ? `Everything else is accounted for. The ${worst.document} from ${worst.from} hasn't shown up.`
    : `${late.length} documents are past their date — the ${worst.document} from ${worst.from} longest.`;
}
