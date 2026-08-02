# BASIS_FILING — from zero to ready to file

> A person who knows nothing about taxes arrives with nothing. Basis takes
> them to a complete, checked account of their year: which forms their life
> requires, every number that goes on them, where each number came from, and
> an explicit list of what is still unresolved and what resolving it is worth.
> They walk out ready to file. Basis does not file.

This document is written for a builder with no memory of the conversations
that produced it. Every slice is a contract that can be built from this file
alone. When this document and a conversation disagree, this document wins —
update it first, then build.

**How to read it.** Part I is doctrine: invariants every slice inherits.
Part II records decisions already made — do not reopen them, the rationale is
written down. Part III is the map. Part IV defines the personas used to test
completeness. Part V is Phase A in full contract form. Part VI sketches
Phases B–H pending their own contract pass. The appendix traces every
commitment from the design conversations to a named slice.

**The framing that keeps 40 slices coherent.** This is a compiler. A
person's life is the source. The rules are the passes. The manifest is the
output, and provenance is the source map — every number traces back through a
named rule to a fact, and from the fact to whoever asserted it. The fact
model is the type system, the rules are the semantics, the error model is
unknown/fork/refuse, and the fixture corpus is the conformance suite. Every
design question below resolves to one of those four.

---

## Part I — Doctrine

Eight invariants. Slices inherit these; they do not restate them.

**1. Ask about life, derive the tax.**
Never ask a question the person needs tax knowledge to answer. "Can someone
claim you as a dependent?" is a legal test, not a question — asked directly
it collects a guess, and a wrong guess changes the standard deduction, the
education credits, and whether a parent's return now conflicts with this one.
Ask where they slept, who paid for what, whether they were enrolled — the
engine runs the test. If an intake question contains a tax term, the question
is wrong.

**2. The engine determines; the AI translates.**
Every determination — residency, dependency, filing status, which forms,
every dollar — is made by pure code in `lib/calc/`, deterministic, tested
against transcribed IRS examples. The AI turns "I lived with my mom until
June" into facts, chooses what to ask next, explains why a rule landed where
it did, and draws the answer. It never asserts a determination the engine has
not made. Identical facts must produce identical answers on Tuesday and on
Thursday; a prompt cannot promise that, a function can.

**3. Unknown is a value, and forks are priced in dollars.**
Facts are yes / no / unknown, never guessed. When a fact is unknown, the
engine computes the year both ways and prices the difference: "Finding out
whether your parents claimed you is worth $1,247. Everything else you don't
know is worth $40 combined." The price is also the intake's prioritiser —
Basis always asks the question worth the most money, so question order is
computed, never scripted.

**4. Absence is detectable only because expectation is computed.**
Every tax product processes what it is handed. The product here is noticing
what is missing: two jobs but one W-2, a brokerage but no 1099-B, enrollment
but no 1098-T, $30,000 of wages and zero withholding. This only works because
Phase-0 life facts establish what should exist. The 1099-K reversion (Part
II) makes this load-bearing: most gig income now arrives with **no form at
all**, and is taxable anyway. A product that waits for documents will
silently miss the income; Basis expects it because the person said they
drove for DoorDash.

**5. Provenance on every number.**
Every fact carries its source: the person said it, a document said it, or a
rule derived it — and which one. Every determination carries the rule it
applied and the facts it consumed. The manifest is auditable end to end:
point at any figure and see the chain. "The difference between 'no gain' and
'we don't know' is the product" was the portfolio pillar's rule; this is the
same rule grown up.

**6. Rules are year-parameterised — behaviour, not just constants.**
`tax-data.ts` already versions the numbers by year. Not sufficient: the
*rules* change shape across years. The saver's credit exists through tax
year 2026 and is replaced by the Saver's Match in 2027 (Form 8880 changes
function). The 1099-K threshold has been $20,000/200, then $5,000, then
retroactively $20,000/200 again. We committed to prior unfiled years, so a
determination is always `rule(taxYear)(facts)` — the year selects the rule,
not just the bracket table. Hardcoding current-year behaviour breaks Phase H
and is discovered too late; this constraint is enforced from A1.

**7. Scope is an enforced object; outside it, detect → name → explain → refuse.**
The supported set of forms, situations, and states is data the requirements
engine checks, not an assumption. Out of scope produces: "Your situation
needs Form 8615, which Basis doesn't handle yet. Here's why it applies to
you and what it means" — never a silent wrong answer, never a quiet
omission. Rental property, K-1s, foreign accounts (FBAR/8938), trusts, and
business entities are permanently out of scope by this mechanism; everything
in Part III is in scope eventually, and the same mechanism covers the gap
until each slice ships.

**8. Facts supersede; computations re-run.**
A corrected 1099-B arriving in March invalidates February's computation.
Facts are append-only with supersession — never edited in place — and every
determination knows which facts it consumed, so a superseded fact re-runs
exactly what depended on it. If the return was already filed when the fact
changed, that is the amendment trigger (H2), detected, not hoped about.

### The standing product rules (inherited from the pivot)

Lay out options with what each is worth; never rank, never recommend, never
decide for the user. Educational, not advice — Basis explains what a rule
does, not what to claim. Plain words first, the term in brackets after.
Numbers the engine computed are marked as estimates where they are estimates.

---

## Part II — Decisions already made

Recorded with rationale so no future session reopens them.

| Decision | Choice | Why |
|---|---|---|
| Unknowns | Compute both, show the dollar difference, suggest finding out | The fork price doubles as the intake prioritiser (Doctrine 3) |
| Where logic lives | Deterministic engine in `lib/calc/`; AI translates only | Determinism, testability, auditability (Doctrine 2) |
| How far we go | Ready-to-file manifest; the person files themselves | E-filing on someone's behalf = IRS Authorized e-file Provider = a different company |
| Manifest vs filled PDFs | Manifest first | Useful the day it exists, degrades gracefully when incomplete; a wrong filled 1040-NR is worse than none. PDFs are the obvious later step |
| Messy cases | Detect, say so, help — never quietly proceed | Trust is the product |
| States | CA, NY (which is NY + NYC + Yonkers), MA | User decision. Three states, five rule sets |
| International students | In scope, fully | Large share of the audience; residency becomes the engine's root fork (E-phase, A2) |
| Coverage | Everything in Part III; architecture holds all of it day one, coverage fills by expected value | "We must cover it all" — user decision |
| Prior years | In scope (H4) | Forces Doctrine 6 from day one |

### Verified current law this plan leans on (checked 2026-08)

- **1099-K**: threshold reverted to **$20,000 and 200 transactions**,
  retroactive to 2022 (One Big Beautiful Bill Act, July 2025). The $600/
  $2,500/$5,000 phase-in is dead. Consequence: platform income usually
  arrives with no form; Doctrine 4 carries it.
- **1099-NEC/MISC**: reporting threshold rises to **$2,000 for TY2026**
  (indexed after). Same consequence — small contract income loses its
  paper trail.
- **Massachusetts**: short-term capital gains **8.5%**, long-term **5%**,
  plus a 4% surtax above ~$1.08M total income. The existing
  `pre_trade_check` shows federal-only tax on sales — for an MA user
  selling inside a year, materially wrong (B1).
- **Kiddie tax (Form 8615), TY2026**: unearned income above **$2,700**
  of a dependent full-time student **under 24** is taxed at the parents'
  marginal rate ($0–1,350 free, next $1,350 at child's rate). This
  directly overrides the product's flagship 0%-LTCG-window insight for
  exactly the person most likely to be shown it (B2).
- **Saver's credit**: exists through TY2026 ($40,250 AGI cap single);
  full-time students and dependents are ineligible — so it interacts with
  dependency (A3). Replaced by the Saver's Match in TY2027; Form 8880
  changes function. This is the canonical Doctrine-6 example.
- **F-1 FICA**: F-1 holders are "exempt individuals" for **5 calendar
  years** (any part of a year counts as a year) — nonresident for tax,
  days don't count toward substantial presence, and **exempt from Social
  Security/Medicare withholding** on authorized work. Employers withhold
  it anyway constantly. Recovery: employer first, then Form 843 + Form
  8316. Consistent Form 8843 filing is what evidences the status (E4).

---

## Part III — The map

Eight phases, forty slices. A phase is a coherent capability; a slice is one
buildable contract. Order within Phase A is dependency order; later phases
are ordered by expected dollar value to the audience.

**A — The spine** *(8)*
A1 fact model · A2 residency (the root fork) · A3 dependency & filing
status · A4 fork-and-diff · A5 requirements & scope · A6 readiness ·
A7 fixture corpus · A8 external validation harness

**B — Fix what already ships** *(3)*
B1 MA short-term gains in `pre_trade_check` · B2 kiddie-tax guard on the 0%
window · B3 state layer over existing federal-only surfaces (CA ordinary-
income treatment of gains, framing fixes)

**C — Documents** *(5, by family)*
C1 wage (W-2) · C2 contract & platform (1099-NEC, 1099-K, no-form income) ·
C3 investment (1099-B, -DIV, -INT, consolidated statements, crypto-no-form)
· C4 education & health (1098-T, 1098-E, 1095-A) · C5 retirement, benefits
& winnings (1099-R, 1099-G, W-2G)

**D — Determinations** *(6)*
D1 education credits (AOTC/LLC, 8863) · D2 saver's credit (8880, TY≤2026) ·
D3 premium tax credit reconciliation (8962 — filing blocker) · D4
self-employment & misclassification (Sch C/SE, 8919) · D5 capital gains
wiring (8949/Sch D from the existing lot engine) · D6 early-withdrawal
penalty (5329)

**E — Nonresident** *(5)*
E1 1040-NR return shape · E2 Form 8843 · E3 treaty engine (India std
deduction first) · E4 FICA refund detection (843 + 8316) · E5 dual-status
years

**F — States** *(4)*
F1 California (incl. renter's credit) · F2 New York + NYC + Yonkers +
convenience-of-the-employer · F3 Massachusetts · F4 multi-state allocation
(part-year, credits for taxes paid)

**G — Intake & AI** *(4)*
G1 intake surface (resumable, fork-priced question order) · G2 engine tools
for Bip · G3 preamble rules (never assert undetermined; never ask in tax
vocabulary) · G4 absence-check UI (the "should exist" board)

**H — Output & lifecycle** *(5)*
H1 the manifest · H2 amendments (1040-X, incl. CP2000 posture) · H3
extensions (4868 — extends filing, not paying) · H4 prior unfiled years ·
H5 next year's lever (W-4)

---

## Part IV — Personas

Defined before the slices, used twice: while writing Phases B–H, every
persona is traced through the plan and any fact, document, or form they need
that has no slice is a hole found before building. After writing, each
becomes an end-to-end fixture with expected outcomes computed through
external filing software (A8).

Each persona lists the finding — the thing they were oblivious to that Basis
must surface. A persona whose finding can't be named wouldn't be worth
having; the same is true of slices.

**P1 · First paycheck.** 23, one W-2, one state, no investments, parents
don't support them. The simplest possible return. *Finding: their
withholding vs. their actual liability, and that filing is free and takes an
afternoon.* Exercises: A1, A3, C1, H1.

**P2 · Dependent with a Robinhood.** 20, full-time student, parents pay
tuition and claim them, part-time W-2, realized $3,100 of long-term gains.
*Finding: the 0% window does not apply to them — kiddie tax puts gains above
$2,700 at their parents' rate, and their standard deduction is limited.
Basis's own headline feature would have misled them; B2 exists because of
this persona.* Exercises: A3, B2, C1, C3, D5, 8615-scope refusal until built.

**P3 · F-1 junior.** From India, third calendar year in the US, campus job
W-2 **with FICA withheld in error**, scholarship on 1042-S. *Findings:
nonresident → 1040-NR not 1040; Form 8843 even in zero-income years; the
India treaty preserves the standard deduction; and several hundred dollars
of FICA is recoverable via employer-then-843+8316.* Exercises: A2, E1–E4,
C1. The FICA refund is the single best "money you didn't know about" in the
product.

**P4 · Two apps and a bike.** 22, DoorDash $1,800 (below the new $2,000
1099-NEC threshold — **no form arrives**), Depop sales $900 (far below
$20k/200 — **no 1099-K arrives**). *Findings: no-form income is still
taxable; SE tax exists at 15.3%; quarterly payments exist; Depop personal
items sold at a loss are not income at all — the distinction matters.*
Exercises: A1, A4, C2, D4, Doctrine 4 end to end.

**P5 · Boston remote.** 24, lives in MA, remote employee of a Manhattan
company, active trader on the side. *Findings: New York's convenience-of-
the-employer rule taxes the wages anyway; MA gives a credit for taxes paid
to NY; and MA taxes their sub-one-year trades at 8.5%, which the federal-
only pre-trade check understates.* Exercises: F2, F3, F4, B1.

**P6 · Parlay and a 401(k).** 23, W-2G showing $6,000 of sportsbook wins
(losses were $7,000), cashed out a $9,000 401(k) changing jobs. *Findings:
gambling losses only offset wins if you itemize — which they won't — so they
owe tax on $6,000 despite losing money overall; the 401(k) cashout carries
income tax plus a 10% penalty, and the 20% withheld isn't enough.*
Exercises: C5, D6, A6.

**P7 · Marketplace freelancer.** 24, self-employed, bought insurance on the
exchange with an advance premium credit based on a guessed income that came
in low. *Findings: Form 8962 is mandatory — without it the IRS freezes the
refund outright; reconciliation may claw back credit; next year's estimate
should change.* Exercises: D3 (the blocking behaviour in A6), D4, C4.

**P8 · Three years behind.** 25, hasn't filed since their first job. Scared,
assumes they're in trouble. *Findings: refunds are forfeited three years
after the due date — the oldest year is the urgent one; they likely were owed
money in every year; filing late with a refund carries no penalty.*
Exercises: H4, Doctrine 6 (three different years of rules), A1 year-scoping.

---

## Part V — Phase A, in contract form

Every slice: **Purpose** (whose money, one sentence) · **Authority** (what
governs it; which worked examples become fixtures) · **Contract** (facts in,
determinations out) · **Finding** (what it surfaces that the person didn't
know) · **Edges** (unknown / contradiction / scope-boundary behaviour) ·
**Acceptance** (the cruel tests) · **Fence** (what it must not do).

All Phase A modules are pure, live in `apps/server/src/lib/calc/filing/`,
and take `taxYear` as a first-class parameter (Doctrine 6). Injectable
`today`, like `quarterly.ts`.

---

### A1 — The fact model (`facts.ts`)

**Purpose.** One vocabulary for everything the system knows about a person's
year, so forty slices can compose instead of forty slices inventing forty
shapes.

**Authority.** None external — this is architecture. Its design constraints
are Doctrines 3, 5, 6, 8 made concrete.

**Contract.**
```ts
type FactValue =
  | { kind: 'bool'; value: boolean }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'date'; value: string }        // ISO, never Date
  | { kind: 'unknown' };                   // first-class, never null

interface Fact {
  id: FactId;                 // from a closed registry, e.g. 'lived-with-parent-months'
  taxYear: number;
  value: FactValue;
  source:
    | { kind: 'person'; conversationId: string | null }
    | { kind: 'document'; fileId: string; field: string }
    | { kind: 'rule'; ruleId: string; consumed: FactId[] };
  assertedAt: string;
  supersedes: string | null;  // id of the assertion this replaces
}

// The working view: latest non-superseded assertion per (id, taxYear).
function factSet(assertions: Fact[], taxYear: number): FactSet;
// Everything a given fact's change invalidates, transitively via rule sources.
function dependents(assertions: Fact[], factId: FactId): FactId[];
```
The registry of fact ids is a typed constant in this module — a fact id not
in the registry is a compile error, which is what keeps the AI's
`record_fact` tool (G2) from inventing vocabulary. Facts asserted by rules
carry the consuming rule and its inputs, which is what makes `dependents`
computable and Doctrine 8 mechanical rather than aspirational.

**Finding.** None directly — this is the module every finding flows through.

**Edges.** `unknown` is a value, not an absence: "we asked, they didn't
know" (an assertion with value unknown) is different from "never asked" (no
assertion), and both are different from "a document answered it." All three
states are representable and distinguishable. Contradiction — two live
assertions of the same fact from different sources — is representable and is
readiness's (A6) job to surface, not this module's job to resolve:
resolution is a new assertion superseding one side.

**Acceptance.** Supersession chains resolve to the latest; a superseded fact
never reaches a `factSet`; `dependents` follows rule-source edges
transitively and returns them in dependency order; the same fact in two tax
years never collides; round-trip through JSON is lossless. Cruel case: a
document asserts a value, the person contradicts it, a rule consumed the
document's value — `dependents` must flag the rule's output as stale.

**Fence.** No tax logic of any kind. No persistence (the table comes with
G1; this module is the shape and the algebra). No fact ids invented outside
the registry.

---

### A2 — Residency (`residency.ts`)

**Purpose.** The root fork: decides whether this is a 1040 year or a
1040-NR year — which selects the entire rule set that follows — and finds
the FICA money for every F-1 student whose employer withheld it wrongly.

**Authority.** IRS Pub 519 (substantial presence test, exempt individuals,
dual-status); Form 8843 instructions. Pub 519's worked examples transcribe
into the corpus (A7).

**Contract.**
```ts
// consumes: citizenship, green-card status, visa history
//   [{ type: 'F'|'J'|'M'|'Q'|other, firstEntryYear }], days present per year
//   (person-asserted; calendar precision not required for the common case),
//   treaty country
interface ResidencyDetermination {
  status: 'us-person' | 'resident' | 'nonresident' | 'dual-status' | 'unknown';
  rule: 'citizen' | 'green-card' | 'substantial-presence'
      | 'exempt-individual' | 'insufficient-facts';
  exemptYearsUsed: number;       // of the F/J five (any part-year counts whole)
  form8843Required: boolean;     // true for every exempt-individual year, income or not
  ficaExempt: boolean;           // nonresident F-1 on authorized work
  explanation: RuleTrace;        // which test, which numbers, for the AI to narrate
}
```
Substantial presence: ≥31 days current year AND current + ⅓ prior + ⅙
second-prior ≥ 183, with exempt-individual days excluded. F/J student years
are exempt for five calendar years lifetime, any part of a year consuming a
whole year.

**Finding.** "You're a nonresident for tax purposes — different return,
and your employer took Social Security tax it shouldn't have. That's
recoverable." Also its inverse, equally important: an F-1 in year six is
*resident*, files a plain 1040, and most of E-phase stops applying to them.

**Edges.** Days-present unknown for a prior year → fork both ways (A4)
only when it changes the status; usually exempt-individual status decides
without day counts, and the contract prefers the decidable path. Dual-status
(arrival/departure year) → status `dual-status`, which E5 handles and
everything before E5 must detect-and-refuse per Doctrine 7. Visa type not
in F/J/M/Q → refuse with explanation, never guess.

**Acceptance.** Pub 519 worked examples verbatim. Cruel cases: arrived
December 28th of year one (that's a whole exempt year consumed — the
five-year clock runs on calendar years, not months); year-six F-1 flips to
resident via substantial presence; a person with no visa facts at all
returns `insufficient-facts`, not a default.

**Fence.** No treaty benefits (E3). No income logic. Never defaults to
`resident` on missing facts — the absence of visa history is not evidence
of citizenship; only an affirmative fact is.

---

### A3 — Dependency & filing status (`dependency.ts`, `filing-status.ts`)

**Purpose.** The two determinations that reshape everything downstream —
standard deduction, education credits, saver's credit eligibility, kiddie
tax exposure — and the single most-wrongly-guessed fact for anyone under 25.

**Authority.** Pub 501 (qualifying child, qualifying relative, filing
statuses); Form 8615 instructions for the student-under-24 boundary it
shares. Pub 501's examples transcribe into the corpus.

**Contract.**
```ts
// consumes life facts only: birth date, months lived where and with whom,
// enrollment status and months, who paid what share of support, marital
// status and any change date, income facts once C-phase supplies them
interface DependencyDetermination {
  canBeClaimed: 'yes' | 'no' | 'unknown';
  as: 'qualifying-child' | 'qualifying-relative' | null;
  failedTests: TestId[];      // which of the five/four tests broke, for explanation
  // 'canBeClaimed' is the legal test. Whether the parent DID claim is a
  // separate person-asserted fact — the two disagreeing is a readiness
  // contradiction, not something this module papers over.
  consequences: {
    limitedStandardDeduction: boolean;
    educationCreditsBlocked: boolean;
    saversCreditBlocked: boolean;
    kiddieTaxExposed: boolean;     // student under 24 — feeds B2
  };
}
function filingStatus(facts: FactSet): FilingStatusDetermination;
// single | mfj | mfs | hoh | qss, with rule trace; hoh requires the
// qualifying-person test, which reuses the dependency machinery
```

**Finding.** "Whether your parents *can* claim you isn't a choice — it's a
test, and here's how it lands for you." Plus the fork price when unknown:
this is the fact whose two branches differ by the most dollars for the most
users (P2).

**Edges.** Support-share unknown → the canonical A4 fork; the delta prices
finding out. Person says "my parents claimed me" while the test says they
couldn't → contradiction surfaced with plain-words consequences (amended
return on one side or the other), per detect-and-help. Never asks "are you
a dependent"; the intake asks about rent, tuition, and where they slept
(Doctrine 1).

**Acceptance.** Pub 501 examples verbatim. Cruel cases: 24th birthday in
December (age test is measured at year-end — student rule dies the year
they turn 24, not at the birthday); the student who paid 60% of their own
support via loans (loans they're liable for count as their own support);
half-year enrollment (five months makes "full-time student" for the year);
married dependent filing jointly only to claim a refund (the joint-return
test's exception).

**Fence.** No dollar computation. Never resolves a contradiction itself.
Multiple-support agreements and divorced-parents rules (Form 8332) are
detect-and-refuse in v1 — named, explained, refused.

---

### A4 — Fork-and-diff (`forks.ts`)

**Purpose.** The mechanic that makes "I don't know" a priced situation
instead of a dead end, and the demo that makes the whole product legible in
ten seconds.

**Authority.** None external — architecture. Consumes the estimator and
every determination module.

**Contract.**
```ts
// Evaluate the year under a hypothetical resolution of one unknown fact.
function fork(facts: FactSet, at: FactId): {
  branches: Array<{
    assumed: FactValue;
    determinations: DeterminationSet;   // everything downstream, re-run
    liability: LiabilityEstimate;       // federal + in-scope states
    blocked: FormId[];                  // things this branch can't compute
  }>;
  delta: number;              // |liability difference|, the price of not knowing
  alsoChanges: FactId[];      // derived facts that flip, for honest narration
}
// Every unknown in the set, priced and sorted. THE intake prioritiser.
function rankUnknowns(facts: FactSet): Array<{ at: FactId; delta: number }>;
```

**Finding.** "Finding out X is worth $1,247. Everything else you don't know
is worth $40 combined — I wouldn't spend a Saturday on it." No other product
says this.

**Edges.** Forks compose but v1 caps at single-fact forks with the other
unknowns held at their engine defaults — the combinatorics of multi-fork are
real work, deferred deliberately, and the cap is stated in the UI ("assuming
everything else stays as shown"). A fork over a fact that blocks a form
entirely (8962) reports the block as the consequence, not $0. Numeric
unknowns fork over engine-chosen representative points, labelled as such.

**Acceptance.** Forking dependency for P2 must show the kiddie-tax jump.
Forking a fact with no downstream consumers prices at $0 and ranks last.
`rankUnknowns` is stable and deterministic. Cruel case: a fork whose two
branches produce *different form sets* — the delta must reflect that a
branch is blocked, and `alsoChanges` must name the forms.

**Fence.** Never *resolves* an unknown — pricing it is not deciding it. No
probability weighting; both branches are shown, neither is "likely."

---

### A5 — Requirements & scope (`requirements.ts`)

**Purpose.** Turns life facts into the two lists everything else runs on:
which documents should exist, and which forms this year requires — with the
supported set enforced as data, so out-of-scope is a first-class answer.

**Authority.** Form 1040 instructions ("Do you have to file?"), each form's
own filing triggers as its slice lands. Threshold facts from Part II
(1099-K $20k/200, 1099-NEC $2,000) live in year-parameterised data.

**Contract.**
```ts
interface Expectation {
  document: DocumentKind;          // 'W-2' | '1099-B' | '1042-S' | …
  because: FactId[];               // "you said you had two jobs"
  from: string;                    // who should have sent it
  mandatory: boolean;              // false where thresholds mean it may not come
  arrivesBy: string | null;        // Jan 31 / mid-Feb, for absence timing
}
interface FormRequirement {
  form: FormId;
  because: FactId[] | DocumentKind[];
  supported: boolean;              // against the SCOPE object
  ifUnsupported: { whyItApplies: string; whatItMeans: string };
}
function expectations(facts: FactSet, taxYear: number): Expectation[];
function requiredForms(facts: FactSet, docs: Doc[], taxYear: number): FormRequirement[];
const SCOPE: ScopeObject;          // versioned; per form, per state, per situation
```
The no-form path is explicit: P4's DoorDash income produces **no
expectation** (below threshold) but **does** produce a Schedule C/SE
requirement — income creates form requirements directly, not via documents.
That asymmetry is the design.

**Finding.** "Here's what should be arriving in your mail and when — and
here's the one that hasn't." Plus the refusal done right: "You need Form
8615; Basis doesn't handle it yet; here's what it is and why it's yours."

**Acceptance.** Every persona's document list and form list, exactly. Cruel
cases: P4 (requirements without expectations); a brokerage fact with no
1099-B expectation until a sale-or-dividend fact exists (holding produces no
form); expectations that lapse when the underlying fact is superseded;
`supported:false` output carries a non-empty explanation for every form in
Part III not yet shipped.

**Fence.** Doesn't read documents (C-phase). Doesn't compute readiness
(A6). SCOPE additions ride the slice that ships the support — this module
never optimistically claims coverage.

---

### A6 — Readiness (`readiness.ts`)

**Purpose.** The honest answer to "am I ready to file?" — the gap engine
that grew out of `desk-status.ts`, keeping its founding rule: a line that
reports resolved because it had nothing to check is the worst thing this
surface can do.

**Authority.** Architecture, plus per-form blocking rules as they land
(8962's refund-freeze is the archetype, from its instructions via D3).

**Contract.**
```ts
interface Readiness {
  verdict: 'ready' | 'ready-with-cautions' | 'blocked' | 'not-started';
  lines: ReadinessLine[];          // per required form + per expectation + per unknown
  contradictions: Contradiction[]; // live facts in conflict, with consequences
  blockers: Blocker[];             // e.g. missing 8962 → refund frozen
  unknowns: RankedUnknown[];       // from A4, priced
  outOfScope: FormRequirement[];   // the named-and-explained refusals
}
```
Line states are the desk's four — `resolved | attention | not-started |
unknown` — and the desk checklist itself becomes a *view* of this engine
once G-phase lands, not a parallel computation.

**Finding.** "You are two facts and one PDF away from done, and one of
those facts is worth $1,200." Also the calendar truth nobody tells them:
consolidated 1099s routinely arrive mid-February and get corrected in March
— "ready" before the documents can exist is a caution, not a green light.

**Edges.** Contradictions block `ready` — never averaged, never picked
between. An expectation past `arrivesBy` flips to attention with the "call
your brokerage / check the app" step. `ready-with-cautions` exists because
unknown-but-cheap shouldn't block anyone: the $40-combined case files.

**Acceptance.** P7 must be `blocked` (8962) with the freeze explained; P8
produces three per-year readiness objects independently; a superseded fact
flips readiness the same render, not the next visit. Cruel case from the
desk's history: a year with no facts at all must read `not-started`, not
`ready` — nothing-to-check is not resolved.

**Fence.** Computes nothing itself — it aggregates A2–A5 and D-phase
outputs. No prose beyond the detail line; narration is the AI's job over
this structure.

---

### A7 — The fixture corpus (`fixtures/`)

**Purpose.** The conformance suite. For a determination engine the tests
are not verification of the work — they are the work; this slice makes the
corpus a deliverable instead of an assumption.

**Authority.** The publications themselves: every worked example in Pub 501,
Pub 519, Pub 970, and the 8615/8962/8880 instructions, transcribed with its
citation and stated answer. Plus the eight personas as end-to-end cases.
Plus an adversarial set per module, grown every time review or reality finds
a miss.

**Contract.** One fixture = `{ id, source (pub/section/example or
persona/adversarial), taxYear, facts[], expected (determinations and/or
dollars), note }`. Rule slices reference corpus ids in their tests rather
than inlining scenarios; a fixture is written once and every consuming
module runs it.

**Acceptance.** Every A2/A3 authority example present before those slices
merge; every persona runnable end-to-end (initially with most expectations
unmet — that *is* the expected output); corpus grows monotonically — a
fixture, once right, is never deleted, only superseded with a note (the
Doctrine-8 rule applied to ourselves).

**Fence.** No fixtures invented from memory of tax law — transcribed from
authority or deliberately constructed as adversarial with the reasoning
written down. A fixture without a citation or a rationale doesn't merge.

---

### A8 — External validation (`validation/`)

**Purpose.** The answer to "how do we know it's right." Passing our own
corpus proves internal consistency; agreement with independent
implementations is the only external evidence available, and it must exist
before C-phase starts stacking numbers on the spine.

**Authority.** None — method. Cross-check targets: FreeTaxUSA and one other
free-file implementation, run manually.

**Contract.** For each persona: enter the same facts into the external
tools by hand, record every resulting line number into
`validation/expected/<persona>.json` with a date and tool version; a harness
compares engine output line by line and reports agreement, divergence, and
untestable lines (things the external tool doesn't expose). Divergences are
triaged in writing: our bug (fix), their simplification (document), or
ambiguity in the law (document, and prefer the authority's example).

**Finding.** Internal: every divergence is a bug found before a user found
it.

**Acceptance.** P1 and P2 validated end-to-end against two external tools
before any C-slice merges; the harness runs in CI against recorded
expectations (the manual step is producing expectations, not running the
check); a divergence blocks the slice that caused it.

**Fence.** Recorded expectations are frozen artifacts with provenance —
edited only by re-performing the external run, never to make a test pass.
The 1040-NR persona (P3) is validated against Sprintax or equivalent when
E-phase lands; until then it is explicitly listed untested-externally.

---

## Part VI — Phases B–H: scope sketches

To be expanded to full contracts in a second pass, in this order, after
Phase A is reviewed. One paragraph each so the map holds meanwhile; the
appendix pins every conversation commitment to one of these.

**B1 — MA short-term gains.** `pre_trade_check` and the desk's sale math
gain a state dimension for MA residents: 8.5% short / 5% long alongside the
federal figure. Live incorrectness the moment MA support is claimed; ships
first.

**B2 — Kiddie-tax guard.** Wherever the 0% window is shown (tax picture,
Bip's preamble facts, `ltcgZeroBracketRoom` consumers), a
`kiddieTaxExposed` determination (A3) caps or annotates it. P2 is the
fixture. Until A3 exists, ships as a conservative caution keyed on age +
student + dependent facts when known.

**B3 — State layer on existing surfaces.** CA treats all gains as ordinary
income — the window framing gets an explicit state line so "0% federal" can
never be read as "0%." NY/MA equivalents. Copy audit plus a
`stateTreatment` field on the tax-picture payload.

**C1–C5 — Document families.** Extractor + fact-assertion mapping per
family, reusing the statement-import and 1099-reconcile job pattern
(Sonnet extraction → typed rows → facts with document provenance).
Corrected-document handling (supersession) is C-wide behaviour, tested per
family. C2 carries the no-form path; C3 carries crypto-no-form and feeds
the existing lot engine; C4's 1095-A feeds D3; C5's W-2G/1099-R feed D6 and
the P6 findings.

**D1–D6 — Determinations.** Each is one rule module in the A1 vocabulary
with Pub-cited fixtures: 8863 (AOTC's 40%-refundable arm is the finding),
8880 (dies after TY2026 — Doctrine 6's poster child), 8962 (produces the
A6 blocker), Sch C/SE + 8919 (misclassification: the 7.65% they shouldn't
be paying), 8949/Sch D wiring from `lots.ts` (mostly exists — the slice is
fact-model integration), 5329 (the 10%-penalty surprise).

**E1–E5 — Nonresident.** 1040-NR shape (no standard deduction except
treaty, different income sourcing), 8843 (every exempt year, income or
none), treaty engine as data (India Article 21(2) first, then the common
student treaties), FICA-refund detection (the A2 `ficaExempt` flag × a
W-2-box-4 fact → a found-money line with the employer-first, then
843+8316 path), dual-status years (detect + the arrival/departure-year
rules; refuse the exotic remainder).

**F1–F4 — States.** Each an independent year-parameterised rule set
consuming the same facts: CA (all gains ordinary; renter's credit —
costs nothing, routinely missed), NY (three taxes: state, NYC resident,
Yonkers; convenience-of-the-employer as a *fact-model* question — "where
were you physically working?" — nothing on any document answers it), MA
(8.5%/5%, the B1 engine formalised), multi-state (part-year allocation,
credit for taxes paid — P5's MA-credit-for-NY-tax is the fixture).

**G1–G4 — Intake & AI.** The intake surface (resumable, desk-adjacent,
question order = `rankUnknowns`, life-vocabulary only); Bip tools
(`record_fact`, `get_readiness`, `price_unknown`, `explain_determination` —
thin wrappers, zero logic); preamble additions (never assert what the
engine hasn't determined; never ask in tax vocabulary; narrate rule traces,
don't paraphrase them); the absence board (expectations vs. arrivals, the
G-phase face of Doctrine 4).

**H1–H5 — Output & lifecycle.** The manifest (every form, every line,
provenance chains, unknowns and cautions listed — the deliverable of the
entire product); 1040-X (triggered by supersession-after-filing, and the
CP2000 note: our reconciliation is the thing that *prevents* those
letters); 4868 (extends filing, never paying — the finding is the
difference); prior years (H4 = the whole engine × Doctrine 6, plus the
three-year refund-forfeit clock as the urgency mechanic — P8); W-4 (the
only lever that fixes *next* year; closes the loop back to quarterly).

---

## Appendix — Traceability

Every commitment from the design conversations, pinned. If a future edit
drops a row's slice, the row is the alarm.

| Commitment | Slice |
|---|---|
| Ask life, derive tax | Doctrine 1, G1, G3 |
| Compute both + price + suggest finding out | A4, G1 |
| Engine determines, AI translates | Doctrine 2, G2, G3 |
| Ready-to-file manifest, no e-filing | H1, Part II |
| Detect messy, say so, help | Doctrine 7, A6 |
| NY + MA + CA | F1–F4 |
| International students fully in scope | A2, E1–E5, P3 |
| Prior unfiled years | H4, Doctrine 6, P8 |
| Year-parameterised rules | Doctrine 6, A1, D2 |
| Fixture corpus as deliverable | A7 |
| External validation before documents | A8 |
| 1099-K ($20k/200 reversion) | C2, A5 thresholds |
| 1099-NEC $2,000 threshold / no-form income | C2, A5, P4 |
| 1099-R + early-withdrawal penalty | C5, D6, P6 |
| 1099-G unemployment | C5 |
| W-2G + loss asymmetry | C5, P6 |
| Kiddie tax / Form 8615 | B2, A3, P2 |
| Form 8962 refund freeze | D3, A6, P7 |
| Form 8919 misclassification | D4 |
| Crypto with no form | C3 |
| 1040-NR | E1 |
| Form 8843 (zero-income years too) | E2 |
| Treaties (India std deduction) | E3 |
| FICA refund (843 + 8316) | E4, A2, P3 |
| Dual-status years | E5 |
| 1040-X amendments | H2 |
| CP2000 posture (reconciliation prevents) | H2 |
| 4868 extends filing not paying | H3 |
| W-4 as next year's lever | H5 |
| MA 8.5% short-term fix | B1, F3, P5 |
| CA all-gains-ordinary framing | B3, F1 |
| NY convenience of the employer | F2, P5 |
| NYC + Yonkers | F2 |
| Saver's credit (and its TY2027 death) | D2, Doctrine 6 |
| CA renter's credit | F1 |
| AOTC partly refundable | D1 |
| Student loan interest / 1098-E | C4, D1 |
| IRA deadline as the one actionable item | A6 finding, H1 |
| Absence detection | Doctrine 4, A5, G4 |
| Detect-and-refuse: rentals, K-1, FBAR, trusts, entities, 8332, multi-support | Doctrine 7, A5 SCOPE |
| Corrected documents re-run computations | Doctrine 8, A1, C-wide |
| Desk checklist becomes a readiness view | A6, G4 |
