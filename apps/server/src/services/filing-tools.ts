// ─── G2 · The AI's hands ───────────────────────────────────────────
// Four tools, and the discipline is what they DON'T do. Doctrine 2 says
// the engine determines and the AI translates, so none of these compute
// anything: every number they return came out of a module in
// lib/calc/filing, and every citation is the engine's own string rather
// than a paraphrase. A test pins that with string equality, because a
// paraphrased citation is the exact failure this arrangement exists to
// prevent — it reads as authority and isn't.
//
// The other fence is on writing. `record_fact` only ever writes person
// provenance, and only what the person actually said in conversation.
// Document facts arrive through the C-phase extraction jobs, which read
// the paper; a model repeating a number back out of a chat message is
// not the same thing and must not be recorded as though it were.
//
// The rejection teaches. An invented fact id comes back with the nearest
// real ones from the registry, so the model corrects itself on the next
// turn instead of guessing again — the registry is the contract, and a
// bare 400 would leave it invisible.

import type { DB } from '../db';
import {
  FACT_REGISTRY,
  type FactId,
  type FactValue,
  factSet,
  factState,
  isFactId,
  nearestFactIds,
} from '../lib/calc/filing/facts';
import { fork } from '../lib/calc/filing/forks';
import { INTAKE_QUESTIONS, intakePlan } from '../lib/calc/filing/intake';
import type { RuleTrace } from '../lib/calc/filing/trace';
import { type FactScopeKeys, assertFact } from './facts';
import { evaluationFor, loadFilingYear, readinessFor } from './filing-year';

type ToolResult = Record<string, unknown>;

const unavailable = (reason: string): ToolResult => ({ available: false, reason });

// ─── record_fact ───────────────────────────────────────────────────

/**
 * The model sends a plain value — true, 42000, "MA", "2003-04-04" — and
 * this maps it onto the registry's kind. Making the model construct
 * `{kind:'number',value:42000}` would buy nothing except a new way to
 * get it wrong; the registry already knows what shape each fact takes.
 *
 * `null` means the person said they don't know, which is a real answer
 * with its own downstream behaviour, not a missing argument.
 */
function coerce(
  factId: FactId,
  raw: unknown,
): { ok: true; value: FactValue } | { ok: false; reason: string } {
  if (raw === null || raw === undefined) return { ok: true, value: { kind: 'unknown' } };
  const kind = FACT_REGISTRY[factId].kind;

  if (kind === 'bool') {
    if (typeof raw === 'boolean') return { ok: true, value: { kind: 'bool', value: raw } };
    if (raw === 'true' || raw === 'yes') return { ok: true, value: { kind: 'bool', value: true } };
    if (raw === 'false' || raw === 'no') return { ok: true, value: { kind: 'bool', value: false } };
    return { ok: false, reason: `'${factId}' is a yes/no fact — send true or false.` };
  }

  if (kind === 'number') {
    const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw).replace(/[$,]/g, ''));
    if (!Number.isFinite(n)) {
      return { ok: false, reason: `'${factId}' is a number — send a number, or null for unknown.` };
    }
    return { ok: true, value: { kind: 'number', value: n } };
  }

  if (kind === 'date') {
    const s = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return { ok: false, reason: `'${factId}' is a date — send it as YYYY-MM-DD.` };
    }
    return { ok: true, value: { kind: 'date', value: s } };
  }

  const s = String(raw).trim();
  if (s === '') return { ok: false, reason: `'${factId}' needs a value, or null for unknown.` };
  return { ok: true, value: { kind: 'string', value: s } };
}

export async function recordFactTool(
  db: DB,
  keys: FactScopeKeys,
  input: { factId: unknown; value: unknown; taxYear: number; conversationId: string | null },
): Promise<ToolResult> {
  const factId = String(input.factId ?? '');
  if (!isFactId(factId)) {
    return {
      available: false,
      reason: `'${factId}' is not a fact this engine knows. Facts come from a closed registry — nothing outside it can be recorded.`,
      didYouMean: nearestFactIds(factId, 3),
    };
  }

  const entry = FACT_REGISTRY[factId];
  if ('derived' in entry && entry.derived === true) {
    return unavailable(
      `'${factId}' is something the engine works out, not something a person states. Record the facts underneath it instead.`,
    );
  }

  const coerced = coerce(factId, input.value);
  if (!coerced.ok) return unavailable(coerced.reason);

  const written = await assertFact(db, keys, {
    factId,
    taxYear: input.taxYear,
    value: coerced.value,
    // Always person. A model must never write a document's provenance —
    // that belongs to the extraction jobs that actually read the paper.
    source: { kind: 'person', conversationId: input.conversationId },
  });
  if (!written.ok) {
    return {
      available: false,
      reason: `That value was rejected: ${written.problem.reason}.`,
      ...(written.problem.reason === 'unknown-fact-id'
        ? { didYouMean: written.problem.suggestions }
        : {}),
    };
  }

  return {
    available: true,
    recorded: factId,
    label: entry.label,
    taxYear: input.taxYear,
    value: coerced.value,
    // Naming what it replaced is how the person can be told honestly
    // that an earlier answer has changed.
    supersededAssertionId: written.assertion.supersedes,
  };
}

// ─── get_readiness ─────────────────────────────────────────────────

export async function getReadinessTool(
  db: DB,
  keys: FactScopeKeys,
  taxYear: number,
  today: Date = new Date(),
): Promise<ToolResult> {
  const readiness = await readinessFor(db, keys, taxYear, today);
  if (readiness.verdict === 'not-started') {
    return {
      available: true,
      taxYear,
      verdict: 'not-started',
      reason: `Nothing is on file for ${taxYear} yet — no answers and no documents.`,
      lines: [],
      blockers: [],
      contradictions: [],
      unknowns: [],
    };
  }
  // A6's object, verbatim. Nothing reshaped, nothing summarised: the
  // model narrates what the engine decided rather than a version of it.
  return { available: true, ...(readiness as unknown as ToolResult) };
}

// ─── price_unknown ─────────────────────────────────────────────────

const promptFor = new Map(INTAKE_QUESTIONS.map((q) => [q.factId, q.prompt]));

/**
 * Rides every ranked list. Learned the hard way in a live run: handed a
 * list it could not put dollars on, the model filled the silence by
 * reciting a state's rent rules from memory — and got the cap wrong. The
 * discipline belongs on the result the model is actually reading, not
 * only on the rare empty one.
 */
const RANKED_DISCIPLINE =
  'Ask one of these. Do not estimate what an answer would be worth, and do not state any threshold, cap, rate or limit the engine has not given you — call explain_determination if a rule needs describing.';

export async function priceUnknownTool(
  db: DB,
  keys: FactScopeKeys,
  taxYear: number,
  factId?: unknown,
): Promise<ToolResult> {
  const { assertions } = await loadFilingYear(db, keys, taxYear);

  // ── One fact, both ways ──
  if (factId !== undefined && factId !== null && String(factId) !== '') {
    const id = String(factId);
    if (!isFactId(id)) {
      return {
        available: false,
        reason: `'${id}' is not a fact this engine knows.`,
        didYouMean: nearestFactIds(id, 3),
      };
    }
    const result = fork(assertions, taxYear, id);
    if (!result.ok) {
      const why =
        result.reason === 'not-unknown'
          ? `'${id}' is already known for ${taxYear} — there is nothing to price.`
          : result.reason === 'contradicted'
            ? `Two sources disagree about '${id}'. That has to be settled before it can be priced.`
            : `'${id}' has no representative values to fork on, so the two branches would be invented rather than chosen.`;
      return unavailable(why);
    }
    return {
      available: true,
      at: id,
      question: promptFor.get(id) ?? FACT_REGISTRY[id].label,
      // The dollars between the two branches — what knowing is worth.
      delta: result.delta,
      branches: result.branches.map((b) => ({
        assumed: b.assumed,
        assumedNote: b.assumedNote,
        totalTax: b.evaluation.liability?.totalTax ?? null,
        refundOrOwed: b.evaluation.liability?.refundOrOwed ?? null,
        blocked: b.evaluation.blocked,
      })),
      // A branch that cannot compute is a consequence, not a zero.
      blockedDiffers: result.blockedDiffers,
      alsoChanges: result.alsoChanges,
      heldConstant: result.heldConstant,
    };
  }

  // ── The ranked list ──
  // Priced off the intake's applicable questions rather than A4's
  // `rankUnknowns`, whose candidate set is what a determination already
  // reached for plus what was explicitly answered "don't know". That is
  // right for readiness and wrong here: the questions worth asking this
  // person have not been asserted at all and would come back unpriced.
  const plan = intakePlan(assertions, taxYear, factSet(assertions, taxYear));
  // Sorted globally. The plan orders within each section, which is right
  // for a surface someone reads top to bottom and wrong for a single
  // ranked list — flattening it unsorted lets section order outrank
  // dollars, and a $0 question from You lands above a $590 one from Work.
  const outstanding = plan.sections
    .flatMap((s) => s.questions)
    .filter((q) => q.status === 'unasked' || q.status === 'skipped')
    .filter((q) => (q.worth ?? 0) > 0 || q.unlocks)
    .sort(
      (a, b) =>
        (b.worth ?? 0) - (a.worth ?? 0) ||
        Number(b.unlocks) - Number(a.unlocks) ||
        a.factId.localeCompare(b.factId),
    )
    .slice(0, 12);

  // Nothing priceable yet. Returning a bare "can't" here was a mistake
  // caught live: the model filled the silence by reciting the state's
  // rules from memory, and got the figure wrong. So the empty case hands
  // back the questions that would make pricing possible — there is
  // always something to ask, and asking is the honest move.
  if (outstanding.length === 0) {
    const next = plan.nextUp;
    if (next.length === 0) {
      return unavailable(
        `Every question that applies to ${taxYear} has been answered, so there is nothing left to price.`,
      );
    }
    return {
      available: true,
      taxYear,
      ranked: next.map((q) => ({
        at: q.factId,
        question: q.prompt,
        worth: null,
        unlocksSomething: q.unlocks,
        status: q.status,
      })),
      note: `Nothing can be priced for ${taxYear} yet — too little is on file for the engine to compute a year either way. These are the questions that would change that. ${RANKED_DISCIPLINE}`,
    };
  }

  return {
    available: true,
    taxYear,
    ranked: outstanding.map((q) => ({
      at: q.factId,
      question: q.prompt,
      worth: q.worth,
      unlocksSomething: q.unlocks,
      status: q.status,
    })),
    note: `Each figure is the difference between the two branches of that one question, with every other unknown held exactly as it is. A worth of 0 means the engine cannot yet compute a year either way, not that the answer is worthless. ${RANKED_DISCIPLINE}`,
  };
}

// ─── explain_determination ─────────────────────────────────────────

/**
 * The determinations that carry a trace, under names a model can guess.
 * An unrecognised name is rejected with the whole list, same teaching
 * rejection as an invented fact id.
 */
const DETERMINATIONS = [
  'residency',
  'dependency',
  'filing-status',
  'penalty',
  'education',
  'savers-credit',
  'premium-tax-credit',
  'self-employment',
  'capital-gains',
  'tips-overtime',
  'nonresident',
  'treaties',
  'state',
  'multi-state',
] as const;
type DeterminationName = (typeof DETERMINATIONS)[number];

export async function explainDeterminationTool(
  db: DB,
  keys: FactScopeKeys,
  taxYear: number,
  name: unknown,
): Promise<ToolResult> {
  const key = String(name ?? '');
  if (!(DETERMINATIONS as readonly string[]).includes(key)) {
    return {
      available: false,
      reason: `'${key}' is not a determination this engine makes.`,
      known: [...DETERMINATIONS],
    };
  }

  const evaluation = await evaluationFor(db, keys, taxYear);
  const picked: Record<DeterminationName, { explanation: RuleTrace; status?: string } | null> = {
    residency: evaluation.residency,
    dependency: evaluation.dependency,
    'filing-status': evaluation.filingStatus,
    penalty: evaluation.penalty,
    education: evaluation.education,
    'savers-credit': evaluation.savers,
    'premium-tax-credit': evaluation.ptc,
    'self-employment': evaluation.se,
    'capital-gains': evaluation.capitalGains,
    'tips-overtime': evaluation.tipsOvertime,
    nonresident: evaluation.nonresident,
    treaties: evaluation.treaties,
    state: evaluation.state,
    'multi-state': evaluation.multiState,
  };

  const determination = picked[key as DeterminationName];
  if (determination === null) {
    return unavailable(
      `Nothing about ${taxYear} put '${key}' in play, so the engine made no determination to explain.`,
    );
  }

  const trace = determination.explanation;
  return {
    available: true,
    determination: key,
    taxYear,
    status: determination.status ?? null,
    // Verbatim, all four fields. The citation especially: it is the
    // engine's own authority string, and paraphrasing it would turn a
    // real reference into a plausible-sounding one.
    ruleId: trace.ruleId,
    citation: trace.citation,
    steps: trace.steps,
    notes: trace.notes ?? [],
  };
}

/** For the preamble: which facts exist to be recorded, without the values. */
export function registrySnapshot(): Array<{ id: FactId; label: string }> {
  return INTAKE_QUESTIONS.map((q) => ({ id: q.factId, label: FACT_REGISTRY[q.factId].label }));
}

/** Whether a year has anything on it at all — cheap enough for a preamble. */
export async function yearHasFacts(db: DB, keys: FactScopeKeys, taxYear: number): Promise<boolean> {
  const { assertions } = await loadFilingYear(db, keys, taxYear);
  const set = factSet(assertions, taxYear);
  for (const id of set.byId.keys()) {
    if (factState(set, id).status !== 'unasserted') return true;
  }
  return false;
}
