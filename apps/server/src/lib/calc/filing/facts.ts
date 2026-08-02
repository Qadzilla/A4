// ─── A1 · The fact model ───────────────────────────────────────────
// One vocabulary for everything the system knows about a person's year, so
// forty-one slices can compose instead of each inventing its own shape.
//
// Design constraints, from BASIS_FILING.md doctrine made concrete:
//  - Unknown is a value, never null. "We asked, they didn't know" (an
//    assertion with value unknown) is different from "never asked" (no
//    assertion), and both differ from "a document answered it."
//  - Provenance on every assertion: the person said it, a document said it,
//    or a rule derived it — and which one.
//  - Assertions are append-only. Change is supersession, never edit, so a
//    corrected document re-runs exactly what depended on it.
//  - Rules assert facts carrying what they consumed, which makes staleness
//    computable (`dependents`) rather than aspirational.
//  - Year-scoped by construction; facts that are true of a person rather
//    than of a year (a birth date, a visa's first entry) are declared
//    timeless in the registry and shared across years.
//
// Pure on purpose: no persistence, no clocks, no ids invented here — callers
// supply timestamps and assertion ids. And no tax logic of any kind; this
// module is the shape and the algebra, nothing else.

// ─── The registry ──────────────────────────────────────────────────
// The closed set of fact ids. A fact id not in this registry is a compile
// error, which is what keeps the AI's record_fact tool from inventing
// vocabulary. Entries are added by the slice that consumes them — this seed
// covers A2 (residency) and A3 (dependency/filing status), plus the derived
// facts those rules assert back.

export type FactValueKind = 'bool' | 'number' | 'string' | 'date';
export type FactScope = 'year' | 'timeless';

interface RegistryEntry {
  kind: FactValueKind;
  scope: FactScope;
  /** Only a rule may assert this — it is a determination recorded as a fact. */
  derived?: true;
  /** Describes the data, never the person ("months lived with parents", not
   *  "you lived with your parents"). Plain words; the term in brackets after
   *  where one exists. */
  label: string;
}

export const FACT_REGISTRY = {
  // Of the person, not of a year
  'birth-date': { kind: 'date', scope: 'timeless', label: 'Date of birth' },
  'us-citizen': { kind: 'bool', scope: 'timeless', label: 'US citizen' },
  'green-card-holder': {
    kind: 'bool',
    scope: 'timeless',
    label: 'Lawful permanent resident (green card)',
  },
  'visa-type': {
    kind: 'string',
    scope: 'timeless',
    label: 'Current US visa class (F, J, M, Q, or other)',
  },
  'visa-first-entry-year': {
    kind: 'number',
    scope: 'timeless',
    label: 'Calendar year of first US entry on that visa',
  },
  'citizenship-country': {
    kind: 'string',
    scope: 'timeless',
    label: 'Country of citizenship',
  },

  // Of the year
  'days-present': {
    kind: 'number',
    scope: 'year',
    label: 'Days physically present in the US during the year',
  },
  'state-of-residence': {
    kind: 'string',
    scope: 'year',
    label: 'State lived in for most of the year',
  },
  'lived-with-parents-months': {
    kind: 'number',
    scope: 'year',
    label: 'Months of the year living with parents',
  },
  'full-time-student-months': {
    kind: 'number',
    scope: 'year',
    label: 'Months enrolled as a full-time student',
  },
  'self-support-share-pct': {
    kind: 'number',
    scope: 'year',
    label: 'Share of own living costs paid by the person themselves (percent)',
  },
  married: { kind: 'bool', scope: 'year', label: 'Married as of December 31' },
  'parents-claimed-me': {
    kind: 'bool',
    scope: 'year',
    label: 'A parent actually claimed the person on their own return',
  },
  'w2-employer-count': {
    kind: 'number',
    scope: 'year',
    label: 'Number of employers that paid wages during the year',
  },

  // Determinations recorded as facts — rule-sourced only. The rule that
  // asserts one carries what it consumed, which is what `dependents` walks.
  'residency-status': {
    kind: 'string',
    scope: 'year',
    derived: true,
    label: 'Residency for tax purposes (resident, nonresident, dual-status)',
  },
  'can-be-claimed': {
    kind: 'string',
    scope: 'year',
    derived: true,
    label: 'Whether someone is able to claim the person as a dependent',
  },
} as const satisfies Record<string, RegistryEntry>;

export type FactId = keyof typeof FACT_REGISTRY;

export const FACT_IDS = Object.keys(FACT_REGISTRY) as FactId[];

export function isFactId(id: string): id is FactId {
  return id in FACT_REGISTRY;
}

// ─── Values ────────────────────────────────────────────────────────

export type KnownFactValue =
  | { kind: 'bool'; value: boolean }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'date'; value: string }; // ISO yyyy-mm-dd, never a Date object

export type FactValue = KnownFactValue | { kind: 'unknown' };

/** The known-value shape a given fact id accepts, for compile-time safety. */
type ValueOfKind<K extends FactValueKind> = Extract<KnownFactValue, { kind: K }>;
export type KnownValueFor<I extends FactId> = ValueOfKind<(typeof FACT_REGISTRY)[I]['kind']>;

export function valuesEqual(a: FactValue, b: FactValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'unknown' || b.kind === 'unknown') return true;
  return a.value === b.value;
}

// ─── Assertions ────────────────────────────────────────────────────

export type FactSource =
  | { kind: 'person'; conversationId: string | null }
  | { kind: 'document'; fileId: string; field: string }
  | { kind: 'rule'; ruleId: string; consumed: FactId[] };

export interface FactAssertion {
  /** Identity of this assertion — what a later assertion supersedes by. */
  assertionId: string;
  factId: FactId;
  taxYear: number;
  value: FactValue;
  source: FactSource;
  /** ISO timestamp, supplied by the caller — this module has no clock. */
  assertedAt: string;
  /** The assertion this replaces, or null. Chains are followed. */
  supersedes: string | null;
}

export type AssertionInput<I extends FactId = FactId> = {
  assertionId: string;
  factId: I;
  taxYear: number;
  value: KnownValueFor<I> | { kind: 'unknown' };
  source: FactSource;
  assertedAt: string;
  supersedes?: string | null;
};

export type AssertionProblem =
  | { reason: 'unknown-fact-id'; suggestions: string[] }
  | { reason: 'wrong-value-kind'; expected: FactValueKind; got: string }
  | { reason: 'derived-fact-needs-rule-source' };

/**
 * Runtime validation for the untyped path (the AI's record_fact tool, HTTP
 * input). The rejection teaches: an unknown id comes back with the nearest
 * registry entries so the caller can correct itself.
 */
export function validateAssertion(
  input: Omit<AssertionInput, 'factId' | 'value'> & { factId: string; value: FactValue },
): { ok: true; assertion: FactAssertion } | { ok: false; problem: AssertionProblem } {
  if (!isFactId(input.factId)) {
    return {
      ok: false,
      problem: { reason: 'unknown-fact-id', suggestions: nearestFactIds(input.factId, 3) },
    };
  }
  // Widened: `derived` is optional, so narrow entries don't all carry it.
  const entry: RegistryEntry = FACT_REGISTRY[input.factId];
  if (input.value.kind !== 'unknown' && input.value.kind !== entry.kind) {
    return {
      ok: false,
      problem: { reason: 'wrong-value-kind', expected: entry.kind, got: input.value.kind },
    };
  }
  if (entry.derived && input.source.kind !== 'rule') {
    return { ok: false, problem: { reason: 'derived-fact-needs-rule-source' } };
  }
  return {
    ok: true,
    assertion: {
      assertionId: input.assertionId,
      factId: input.factId,
      taxYear: input.taxYear,
      value: input.value,
      source: input.source,
      assertedAt: input.assertedAt,
      supersedes: input.supersedes ?? null,
    },
  };
}

/** The typed path — compile-checked id and value kind; throws on the rest. */
export function makeAssertion<I extends FactId>(input: AssertionInput<I>): FactAssertion {
  const checked = validateAssertion(
    input as Omit<AssertionInput, 'factId' | 'value'> & {
      factId: string;
      value: FactValue;
    },
  );
  if (!checked.ok) {
    throw new Error(`invalid assertion for '${input.factId}': ${checked.problem.reason}`);
  }
  return checked.assertion;
}

/** Levenshtein over the registry, for rejections that teach. */
export function nearestFactIds(id: string, n: number): string[] {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0] as number;
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = row[j] as number;
        row[j] = Math.min(
          (row[j] as number) + 1,
          (row[j - 1] as number) + 1,
          prev + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
        prev = tmp;
      }
    }
    return row[b.length] as number;
  };
  return [...FACT_IDS].sort((a, b) => distance(id, a) - distance(id, b)).slice(0, n);
}

// ─── The working view ──────────────────────────────────────────────

/**
 * Live = not superseded by anything. Chains resolve naturally: if a→b→c,
 * both a and b are referenced as superseded and only c survives.
 */
export function liveAssertions(all: FactAssertion[]): FactAssertion[] {
  const superseded = new Set<string>();
  for (const a of all) {
    if (a.supersedes !== null) superseded.add(a.supersedes);
  }
  return all.filter((a) => !superseded.has(a.assertionId));
}

/**
 * What the engine may compute from. The four states are the point:
 * unasserted (never asked) / unknown (asked, didn't know) / known /
 * contradicted (live assertions disagree — readiness surfaces it, nothing
 * here resolves it; resolution is a new assertion superseding one side).
 */
export type FactState =
  | { status: 'unasserted' }
  | { status: 'known'; value: KnownFactValue; assertions: FactAssertion[] }
  | { status: 'unknown'; assertions: FactAssertion[] }
  | { status: 'contradicted'; assertions: FactAssertion[] };

export interface FactSet {
  taxYear: number;
  byId: ReadonlyMap<FactId, FactState>;
}

const byRecency = (a: FactAssertion, b: FactAssertion) =>
  a.assertedAt === b.assertedAt
    ? a.assertionId.localeCompare(b.assertionId)
    : a.assertedAt.localeCompare(b.assertedAt);

export function factSet(all: FactAssertion[], taxYear: number): FactSet {
  const live = liveAssertions(all);
  const grouped = new Map<FactId, FactAssertion[]>();

  for (const a of live) {
    const entry = FACT_REGISTRY[a.factId];
    const relevant = entry.scope === 'timeless' ? true : a.taxYear === taxYear;
    if (!relevant) continue;
    const list = grouped.get(a.factId) ?? [];
    list.push(a);
    grouped.set(a.factId, list);
  }

  const byId = new Map<FactId, FactState>();
  for (const [id, assertions] of grouped) {
    assertions.sort(byRecency);
    const known = assertions.filter((a) => a.value.kind !== 'unknown');
    if (known.length === 0) {
      // Asked, not answered — distinct from never asked, on purpose.
      byId.set(id, { status: 'unknown', assertions });
      continue;
    }
    const first = known[0] as FactAssertion;
    const agree = known.every((a) => valuesEqual(a.value, first.value));
    if (!agree) {
      byId.set(id, { status: 'contradicted', assertions });
      continue;
    }
    // A known value beats a live asserted-unknown: the document answered
    // what the person couldn't. Corroboration (several sources, one value)
    // is a single known state carrying all its assertions.
    const latest = known[known.length - 1] as FactAssertion;
    byId.set(id, {
      status: 'known',
      value: latest.value as KnownFactValue,
      assertions,
    });
  }

  return { taxYear, byId };
}

export function factState(set: FactSet, id: FactId): FactState {
  return set.byId.get(id) ?? { status: 'unasserted' };
}

/** The live disagreements, for readiness to surface. */
export function contradictions(
  set: FactSet,
): Array<{ factId: FactId; assertions: FactAssertion[] }> {
  const out: Array<{ factId: FactId; assertions: FactAssertion[] }> = [];
  for (const [factId, state] of set.byId) {
    if (state.status === 'contradicted') out.push({ factId, assertions: state.assertions });
  }
  return out;
}

// ─── Staleness ─────────────────────────────────────────────────────

/**
 * Everything downstream of a fact, transitively, via rule provenance: a
 * rule-sourced assertion consumed facts, so a change to any of them makes
 * the rule's output stale. Returned in dependency order — a fact appears
 * before the facts derived from it — and deterministically.
 *
 * This is what makes Doctrine 8 mechanical: supersede a fact, call this,
 * re-run exactly these.
 */
export function dependents(all: FactAssertion[], factId: FactId): FactId[] {
  const edges = new Map<FactId, Set<FactId>>();
  for (const a of liveAssertions(all)) {
    if (a.source.kind !== 'rule') continue;
    for (const consumed of a.source.consumed) {
      const set = edges.get(consumed) ?? new Set<FactId>();
      set.add(a.factId);
      edges.set(consumed, set);
    }
  }

  const out: FactId[] = [];
  const seen = new Set<FactId>([factId]);
  let frontier: FactId[] = [factId];
  while (frontier.length > 0) {
    const next: FactId[] = [];
    for (const id of frontier) {
      for (const dep of [...(edges.get(id) ?? [])].sort()) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        out.push(dep);
        next.push(dep);
      }
    }
    frontier = next;
  }
  return out;
}
