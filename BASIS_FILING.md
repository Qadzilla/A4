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
completeness. Part V is Phase A in full contract form; Part VI is
Phases B–H in the same form — all forty-one slices are contracts. The
appendix traces every commitment from the design conversations to a named
slice.

**The framing that keeps 41 slices coherent.** This is a compiler. A
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
- **Tips & overtime deductions** (OBBBA, TY2025–2028 only): up to
  **$25,000** of qualified tips and **$12,500** ($25,000 MFJ) of qualified
  overtime deductible; both phase out above **$150,000 MAGI** ($300,000
  MFJ); claimed on Schedule 1-A; tips countable from W-2, 1099-NEC, 1099-K
  or self-reported on Form 4137. Income tax only — **FICA still applies**,
  which is the part every tipped worker will get wrong.
- **F-1 FICA**: F-1 holders are "exempt individuals" for **5 calendar
  years** (any part of a year counts as a year) — nonresident for tax,
  days don't count toward substantial presence, and **exempt from Social
  Security/Medicare withholding** on authorized work. Employers withhold
  it anyway constantly. Recovery: employer first, then Form 843 + Form
  8316. Consistent Form 8843 filing is what evidences the status (E4).

---

## Part III — The map

Eight phases, forty-one slices. A phase is a coherent capability; a slice is one
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

**D — Determinations** *(7)*
D1 education credits & student-loan interest (8863, 1098-E) · D2 saver's
credit (8880, TY≤2026) · D3 premium tax credit reconciliation (8962 — filing
blocker) · D4 self-employment & misclassification (Sch C/SE, 8919) · D5
capital gains wiring (8949/Sch D from the existing lot engine) · D6
early-withdrawal penalty (5329) · D7 tips & overtime deductions (Sch 1-A,
TY2025–2028)

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
year, so forty-one slices can compose instead of each inventing its own shape.

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

## Part VI — Phases B–H, in contract form

Same template as Phase A. Persona traces were re-run over these contracts;
where a trace exposed something new (the taxable-scholarship trap, the
rollover-code distinction, dual statutory residency) it is in the slice and
in the appendix. Figures that move annually live in year data and are not
restated here; figures that define a rule's shape are stated and were
verified in Part II or carry their authority inline.

---

### B1 — MA short-term gains in what already ships

**Purpose.** Stop understating the cost of a sale for Massachusetts users
the day MA support is claimed — the pre-trade check currently shows federal
tax only, and MA's 8.5% on sub-one-year gains is bigger than most users'
federal rate.

**Authority.** MA Form 1 and Schedule B/D instructions; rates verified in
Part II.

**Contract.** `stateTaxOnSale(stateCode, taxYear, saleResult) →
{ shortTermTax, longTermTax, note } | null` — a small year-parameterised
module consumed by `pre_trade_check`, the desk's sale math, and the
countdown finding. Gated on a state-of-residence fact (falls back to the
tax profile's `stateCode`). Payload gains a `state` block alongside the
federal figures, never blended into them.

**Finding.** "Selling this before the one-year line costs Massachusetts
8.5% instead of 5% — waiting saves you the federal difference *and* 3.5%
of the gain to the state." The countdown's wait-vs-sell arithmetic changes
for every MA user.

**Edges.** Residence unknown → no state block plus a note naming why.
Part-year MA → detect, caution, defer to F4. MA's own loss-netting
ordering is F3's; this slice applies rate × gain and labels it an estimate.

**Acceptance.** P5's trades show both layers; a CA profile shows no MA
block; the crossover date math includes the state delta; estimate labelling
present. Cruel case: a sale with a wash-disallowed loss — the state block
must consume the *allowed* loss from the lot engine, not the raw one.

**Fence.** No other states. No netting engine. Federal math untouched.

---

### B2 — The kiddie-tax guard on the 0% window

**Purpose.** Stop the product's flagship insight from misleading the person
it is most likely shown to: a dependent student's gains above the threshold
($2,700 TY2026) are taxed at the parents' rate, and the 0% window mostly is
not theirs.

**Authority.** Form 8615 instructions; thresholds in year data.

**Contract.** `kiddieExposure(facts, taxYear) → 'exposed' | 'clear' |
'unknown'` — consumes A3's `kiddieTaxExposed` once A3 ships; until then a
conservative interim keyed on age, student, and dependency facts where
known (unknown → `unknown`, never `clear`). Consumers: `tax.picture`'s
`ltcgZeroBracketRoom`, the desk-status window line, Bip's preamble facts,
and `pre_trade_check`'s 0%-bracket note — every place the window is spoken
of, one determination.

**Finding.** "Above $2,700, your gains are taxed at your parents' rate,
not yours — the 0% window mostly isn't yours to use." And the inverse
release: the year they stop being claimable, the window genuinely opens.

**Edges.** `unknown` shows the window with the caution *and* the A4 fork
price of resolving dependency. Earned income covering over half their
support escapes the kiddie tax — that determination is A3's; the guard
only consumes. Computing the actual 8615 tax stays out of scope (named
refusal) until a dedicated slice; the guard caps claims, it doesn't
compute blends.

**Acceptance.** P2 sees the annotated window everywhere the window
appears (enumerated consumer list is the test matrix); a 26-year-old sees
no change; all-unknown facts produce caution, not silence and not
`clear`. Cruel case: a 23-year-old non-student — age alone must not
trigger.

**Fence.** No 8615 computation. No new UI surface — annotations ride
existing ones.

---

### B3 — The state layer on existing federal-only surfaces

**Purpose.** Kill the "0% federal read as 0%" trap for the states we
claim. California taxes every gain as ordinary income; a Californian
realizing the window owes CA on all of it.

**Authority.** FTB 540 instructions (no preferential rate); MA/NY per
their instructions.

**Contract.** `stateTreatment(stateCode) → { capitalGains: 'ordinary' |
'split-by-term' | 'none', line: string }` — a data module, not a rule
engine. The tax-picture payload and the Taxes surface window callout gain
an explicit state line; the elements bank's callout copy and Bip's
preamble sentence about the window are audited against an enumerated
consumer list (the same list as B2 — one audit, two annotations).

**Finding.** "Federal 0% is real — and California takes ~9.3% of it
anyway. Here's both numbers." For MA: "the state cares about your holding
period too, differently."

**Edges.** Unsupported state → an explicit "Basis doesn't model your
state yet" line (Doctrine 7), never silence. No state on file → the
prompt to say where they live, phrased as a life question.

**Acceptance.** CA, MA, NY, a no-income-tax state ('none' renders "no
state income tax"), and unknown each render correctly on every consumer
in the list. Cruel case: state changes mid-conversation via supersession
— the annotation follows the fact the same render.

**Fence.** No state liability computation (F-phase). Treatment table
only.

---

### C-phase preface — how every document family works

One pipeline, five families. Upload (or photo) → extraction job on the
existing statement-import/reconcile-1099 pattern (Sonnet extraction against
a typed schema, job queue, polling) → typed rows → **fact assertions with
document provenance** (A1). Extraction asserts only what it read:
low-confidence or absent boxes assert nothing, never zero (the no-guessing
rule from the pivot, now doctrine). A corrected document (W-2c, corrected
1099) matches its predecessor on (issuer TIN, kind, year) and supersedes
that document's facts — Doctrine 8 makes the re-run mechanical, and this
behaviour is tested per family. Every arrival attempts to satisfy an A5
expectation; an arrival nothing expected produces the G4 "we weren't
expecting this — tell me about it" hook, because an unexpected document is
a missing life fact wearing a stamp.

---

### C1 — Wage documents (W-2)

**Purpose.** The most common document in the audience, and the richest:
five downstream slices feed off its boxes.

**Authority.** General Instructions for Forms W-2/W-3 (box definitions).

**Contract.** Extraction schema: boxes 1–20 including box 4/6 (FICA
withheld — E4's raw material), box 12 with codes (D/AA → D2 saver's
credit; W → HSA facts, which F1's CA nonconformity needs), box 14, state
boxes 15–17 (F-phase), tips codes for D7. Facts asserted per box per
employer; multiple W-2s compose; each arrival marks the matching A5
expectation met, keyed by employer.

**Finding.** Box 2 against the computed year: the refund-or-owe picture,
finally from real data. Box 4 > 0 on a nonresident F-1: E4's trigger. Box
12 code D: "your 401(k) contributions may be worth a credit you've never
heard of."

**Edges.** Partial reads assert partially. A W-2 from an employer no fact
mentioned → the G4 hook (new job fact, asked as life). W-2c supersedes by
(EIN, year). Two W-2s from the same EIN, same year, not marked corrected →
contradiction for A6, not a silent sum.

**Acceptance.** Multi-employer aggregation; W-2c supersession re-runs
exactly the dependents of the changed facts (A1 `dependents` verified end
to end here, per the corrected-1099-in-March scenario); every box-12 code
in the mapping table lands in the right fact; state boxes survive for
F-phase. Cruel case: box 1 ≠ box 3 (401k) must not be "corrected" by
extraction.

**Fence.** No paystubs. No imputation of missing boxes. No net-pay math.

---

### C2 — Contract & platform income (1099-NEC, 1099-K, and no form at all)

**Purpose.** The family where the paper trail died: below $2,000
(1099-NEC, TY2026) and $20,000/200 (1099-K) nothing arrives, and the
income is taxable anyway. This slice is Doctrine 4's proof.

**Authority.** 1099-NEC/-K instructions; thresholds in year data (verified
Part II); Sch C instructions for what counts.

**Contract.** Two entry paths, deliberately: extraction for forms that do
arrive, and **person-asserted income facts from intake** ("you said you
drove for DoorDash — about how much did it pay?") for income that never
will. Both assert the same fact shapes, so D4 cannot tell the difference —
which is the point. 1099-K facts carry gross-vs-actual structure: fees,
refunds, and personal-item sales are separately assertable, because a
1099-K's box 1a is not income. Dedupe rule: platform income asserted by
person AND arriving on a form reconciles to one income fact (form
supersedes estimate; delta surfaced, not summed).

**Finding.** "No form came, and it's still taxable — here's what that
means before the IRS says it." And the mirror: "your 1099-K says $2,300;
after fees and the couch you sold at a loss, your income is $1,100 — the
form is gross, not truth."

**Edges.** Personal items sold at a loss → not income, and said so
(P4's Depop). Same dollars on a 1099-NEC and a 1099-K → dedupe, never
double-count. Hobby-vs-business boundary → detect, explain both
treatments, refuse the hobby-loss edge (named). Estimated income facts
are marked estimates and are supersedable by forms.

**Acceptance.** P4 end to end: no expectations, correct Sch C
requirement, SE tax fires in D4. Threshold data is year-keyed (the $600
years of 2022–2024 must remain representable for H4). Cruel case: person
says "about $2,000" and a $2,050 1099-NEC arrives — reconcile to the form,
show the person what changed.

**Fence.** No expense logic (D4). No hobby-loss rules. Never treats
1099-K gross as income without the decomposition flow.

---

### C3 — Investment documents (1099-B, -DIV, -INT, consolidated, crypto)

**Purpose.** Generalise what reconcile-1099 started: one consolidated
brokerage PDF carries three fact families, and the March-corrected
version of it is the supersession scenario the whole architecture was
shaped around.

**Authority.** 1099-B/-DIV/-INT instructions; Pub 550. 8949 box
categories (A–F) from the 8949 instructions.

**Contract.** Consolidated extraction: B rows (proceeds, basis, dates,
covered/noncovered → the 8949 category fact D5 needs), DIV with the
qualified/ordinary split, INT. Crypto: no reliable form exists —
person-asserted disposal facts via intake, plus the digital-assets
yes/no fact, which is **mandatory before readiness can say ready**
(it is a signed-under-penalty question on the 1040's face). B rows flow
to the existing lot engine as trades (source `document` instead of
`snaptrade`), reusing its dedupe.

**Finding.** Qualified dividends are taxed at capital-gains rates — often
0% here, kiddie guard permitting. The digital-assets question gets its
severity explained: a number can be amended; a false "no" is a different
kind of problem.

**Edges.** Corrected consolidated 1099 → full supersession of the prior
document's facts and re-run of D5 and the ledger (the canonical Doctrine
8 fixture). Basis missing on noncovered rows → the existing null-basis
honesty, now with the "noncovered" reason attached. Broker rows
disagreeing with SnapTrade-synced trades → reconciliation surface, not
silent preference.

**Acceptance.** One PDF → three families of facts with per-row
provenance; corrected version re-runs exactly the dependents; qualified
split reaches the estimator distinctly; crypto question blocks readiness
until asserted either way. Cruel case: the same sale present from
SnapTrade sync and the 1099-B — one trade after dedupe, discrepancy
surfaced if figures differ.

**Fence.** No exchange-CSV parsing in v1 (named scope gap). No basis
imputation. Wash-sale logic stays in the lot engine.

---

### C4 — Education & health documents (1098-T, 1098-E, 1095-A)

**Purpose.** The documents behind the demographic's biggest credit, its
quietest deduction, and its only refund-freezing blocker.

**Authority.** 1098-T/-E instructions; Pub 970 (scholarship taxability);
1095-A instructions.

**Contract.** 1098-T: box 1 (payments) and box 5 (scholarships) assert
separately, and the engine derives the comparison — **box 5 > box 1
asserts a taxable-scholarship income fact**, the trap almost nobody knows.
1098-E asserts interest paid (D1's deduction arm). 1095-A: the monthly
table (12 rows × premium / SLCSP / advance credit) extracted with full
fidelity — D3 consumes it month-wise, not summed. Enrollment facts from
intake corroborate; a 1098-T with no enrollment fact → G4 hook.

**Finding.** "Your scholarship exceeded tuition — the difference is
income, and no one will have told you." Plus its optional inverse in D1:
electing to treat more scholarship as income to unlock the AOTC can be a
net win; the fact structure here must support that election.

**Edges.** Schools report inconsistently (box 1 vs the dead box 2 legacy)
— extraction asserts what is printed, D1 owns interpretation. Missing
1095-A while the marketplace fact is true → A5 absence with D3's freeze
warning attached. NRA scholarship taxation differs → routed by A2 status
to E-phase treatment, not computed here.

**Acceptance.** Box5>box1 asserts the income fact; 1095-A monthly
fidelity survives extraction (this is the hardest extraction in C-phase —
fixture with a real-format sample); P7's missing-1095-A absence fires.
Cruel case: two 1098-Ts (transfer year) — QTRE aggregates per student,
not per school.

**Fence.** No credit math (D1), no reconciliation math (D3). Extraction
and derived facts only.

---

### C5 — Retirement, benefits & winnings (1099-R, 1099-G, W-2G)

**Purpose.** The three documents that ambush this audience: the job-change
401(k) cashout, taxable unemployment, and gambling wins that are taxable
even when the year was a net loss.

**Authority.** 1099-R instructions (box 7 code table); 1099-G
instructions; W-2G instructions; Pub 525.

**Contract.** 1099-R: box 7 distribution codes drive everything — the
code table maps to facts (`1` early → D6; `G` direct rollover → **not
income**, the pleasant finding; `2/3/4` exceptions) and withholding
asserts toward the year's payments. 1099-G: unemployment compensation
asserts as income; a box-2 state refund asserts with the
itemized-last-year gate attached — for this audience almost always **not
taxable**, and said so. W-2G: winnings assert as income; losses are a
person-asserted fact stored with the itemizing reality attached (D-phase
surfaces the asymmetry).

**Finding.** "Code G means your rollover isn't income — if your software
taxed it, that's why." "Your state refund probably isn't taxable — that
1099-G is scarier than it is." And P6's: "you won $6,000 on paper and
lost $7,000 in fact; the tax code sees only the $6,000 unless you
itemize, which you won't."

**Edges.** Unknown box 7 code → assert the code as unknown, D6 forks.
1099-G for a state we don't support → income side still works (federal),
state side scoped. Gambling session accounting → out of scope, named.

**Acceptance.** Full code-table mapping; P6 end to end (both documents,
D6 penalty, withholding shortfall visible in readiness); refund-taxability
gate defaults to not-taxable when prior-year itemizing is unknown *and*
the fork price is shown. Cruel case: 1099-R code G with withholding —
rollover with withholding is a partial-rollover trap; detect and explain.

**Fence.** No penalty math (D6). No Roth ordering rules (named scope
gap).

---

### D1 — Education credits & student-loan interest (Form 8863, Sch 1)

**Purpose.** The AOTC is the single largest sum most of this audience can
recover — up to $2,500 per year, 40% of it refundable at zero tax — and
the one most often lost to the dependency rules.

**Authority.** Pub 970 (worked examples → corpus); 8863 instructions;
Sch 1 for the $2,500 student-loan-interest deduction.

**Contract.** Consumes: enrollment facts (half-time+, degree program),
the **multi-year AOTC-years-used counter** (a fact that crosses tax
years — A1 must carry it; four lifetime years), the felony-drug-conviction
test fact (asked as life, carefully), QTRE from C4, taxable-scholarship
facts, dependency from A3, MAGI with year-data phaseouts. Produces both
credits computed — AOTC and LLC — with mutual exclusivity stated and both
values shown (standing rule: lay out, don't pick), plus the
scholarship-election option (treating scholarship as income to free QTRE)
priced as a fork-style delta. Student-loan interest rides along: 1098-E
facts → the deduction, with its own phaseout, dependency gate (dependents
can't take it), and the paid-by-parents wrinkle (counts as paid by the
student if the student isn't a dependent — oblivious money).

**Finding.** "This credit pays you $1,000 even if you owe nothing — but
if your parents can claim you, it's theirs to take, not yours." The fork
against dependency prices exactly this. The election finding: "counting
$2,000 of scholarship as income *gains* you $700 net — legal, in the
instructions, and nobody does it."

**Edges.** Dependency unknown → the A4 fork (P2's canonical case). AOTC
year-counter unknown (they don't remember) → fork, and H4's transcripts
suggestion as the way to find out. NRA → blocked with the E1 explanation.
Same dollars can't fund both a credit and tax-free scholarship —
double-dip guard is explicit.

**Acceptance.** Pub 970 examples verbatim; the election delta on a P2
variant; four-years-exhausted → LLC-only; the double-dip guard; the
interest deduction's dependent gate. Cruel case: 24th-birthday year
interacts with A3's year-end age test — credit eligibility must follow
the dependency determination, not recompute age itself.

**Fence.** No graduate-credit nuances beyond LLC. No 529 interactions
(named gap). Never picks between AOTC and LLC.

---

### D2 — The saver's credit (Form 8880, TY ≤ 2026)

**Purpose.** Up to $1,000 for retirement contributions this audience is
already making through work — and a credit that dies after TY2026, which
makes it urgent as well as unknown.

**Authority.** 8880 instructions; verified figures Part II; SECURE 2.0
for the TY2027 Saver's Match successor.

**Contract.** `saversCredit(facts, taxYear)`: for taxYear ≤ 2026,
consumes W-2 box-12 facts (D/AA/BB…), person-asserted IRA contributions,
AGI, and A3's two disqualifiers (full-time student ≥5 months; claimable
as dependent); returns the tiered credit with the rule trace. For
taxYear ≥ 2027: `{ applicable: false, successor: 'savers-match' }` with
the explanation — the module itself is the Doctrine 6 demonstration, and
its shape is the template for every rule that changes across years.

**Finding.** "Your 401(k) contributions already qualify you for up to
$1,000 — and this is the last year it exists in this form." Plus the
April interplay: an IRA contribution before the deadline can still buy
this credit for last year — the one actionable item after December 31.

**Edges.** Student months unknown → fork; the disqualifiers make this
credit the second-best dependency-fork demonstration after the AOTC.
Distributions in the testing window reduce the credit — consumed from
C5 facts, and the reduction explained.

**Acceptance.** Tier boundaries exact; both disqualifiers; the 2027
not-applicable path; the distribution reduction. Cruel case: AGI $1 over
a tier boundary — no rounding mercy, and the near-miss surfaced as an
IRA-contribution option with the delta priced.

**Fence.** TY2027+ Saver's Match mechanics are not modelled (successor
named, that's all). ABLE contributions out of scope.

---

### D3 — Premium tax credit reconciliation (Form 8962)

**Purpose.** The only form whose absence freezes a refund outright. For
a marketplace-insured freelancer, this is the difference between a
return and a letter.

**Authority.** 8962 instructions; Pub 974. FPL tables and the
applicable-percentage curve are year data — under current law the
enhanced subsidies lapse after 2025 and the 400%-of-FPL cliff returns
for TY2026, which makes the year-parameterisation load-bearing, not
theoretical.

**Contract.** Consumes 1095-A monthly facts (C4), household MAGI
(including dependents' filing-requirement income — the household
definition is the hard part and gets its own fixtures), filing status,
FPL year data. Produces month-wise reconciliation: additional credit or
repayment, with the income-tiered **repayment caps** applied — the
oblivious mercy in this form. Emits the A6 blocker whenever marketplace
facts exist and this determination hasn't run to completion.

**Finding.** "Skip this form and the IRS holds your entire refund — not
the difference, all of it." And the mercy: "your income came in higher
than you guessed, but the clawback is capped at $X for your income level."

**Edges.** Policy shared across tax families (parents' policy covering
the student) → the allocation rules are detect-and-refuse v1, named with
the percentages explained as what a preparer will ask. Mid-year status
changes (marriage, dependency flip) → the alternative-calculation paths
are refused v1, named. Zero-1095-A while marketplace fact true → A5
absence with the freeze warning.

**Acceptance.** 8962 instruction examples; repayment caps per tier; the
cliff behaviour differing TY2025 vs TY2026 (two year-data fixtures, same
facts, different law); P7 blocked-then-unblocked end to end. Cruel case:
household income below 100% FPL — the eligibility floor rules, not a
naive formula.

**Fence.** No SLCSP lookup (the 1095-A states it; if blank → the
lookup-tool handoff, named). No shared-policy allocation v1.

---

### D4 — Self-employment & misclassification (Sch C, Sch SE, Form 8919)

**Purpose.** The 15.3% surprise, made legible before it's a bill — and
the 7.65% recovery when "contractor" was a lie.

**Authority.** Sch C/SE instructions; Pub 334; Form 8919 + SS-8
instructions (common-law employee factors).

**Contract.** Sch C: income facts from C2 minus an **enumerated v1
expense set** — standard-mileage (year-data rate, from odometer-style
life questions), phone/data share, supplies, platform fees — chosen
because they cover the gig cases; everything else (home office,
depreciation, inventory, contract labor) is detect-and-refuse, named.
Sch SE: net × 0.9235 × 15.3% with the SS wage-base interaction against
W-2 box 3 facts (year data), and the ½-SE-tax deduction asserted back as
a fact. Misclassification: control/direction facts collected as life
questions ("did they set your hours? whose equipment?") → when the
common-law factors lean employee, lay out both filings priced — as-is
(full SE tax $X) versus SS-8 + 8919 (employee share only, $Y, with the
consequences for the work relationship stated plainly) — and recommend
neither (standing rule).

**Finding.** "Being paid on a 1099 doesn't make you a contractor — if
they controlled the work, you may be overpaying by $Z, and there's a
form for that." Plus the structural one: SE tax exists at all, and
quarterly estimates (existing engine) attach to it.

**Edges.** Expenses unknown → compute at zero expenses, show the
standard-mileage question as the highest-value unknown (A4 pricing works
on deduction facts too). Net loss → allowed, but hobby-boundary
detection from C2 gates it. Both W-2 and 1099 from the *same payer* →
the strongest misclassification signal, surfaced.

**Acceptance.** SE math to the dollar including the 0.9235 factor and
the wage-base offset; the 8919 delta equals employee-share arithmetic;
expense fence enforced (a home-office fact triggers refusal, not $0);
P4 end to end into quarterly. Cruel case: $392 of net SE income — below
the $400 SE-tax floor, and the engine must know that floor.

**Fence.** No entity returns. No accrual method. Never files toward
8919 without the SS-8 reality explained — the option is priced, the
choice is theirs.

---

### D5 — Capital gains wiring (Form 8949 / Sch D)

**Purpose.** The one determination that mostly exists — `lots.ts` and
`exports.ts` already compute it — rebuilt on the fact model so its
numbers carry provenance into the manifest like everything else.

**Authority.** 8949/Sch D instructions (box categories A–F,
covered/noncovered); existing lot-engine tests carry forward whole.

**Contract.** Trades from C3 documents and SnapTrade sync (existing
dedupe) → the lot engine unchanged → realized results asserted as
**rule-sourced facts** (Doctrine 5), consumed by the estimator, MA's B1,
the kiddie guard, and H1's 8949 rows with per-row provenance. The 8949
**category box** (A–F) derives from C3's covered/basis-reported facts —
the detail that makes IRS document-matching line up, which is CP2000
prevention by construction.

**Finding.** Already shipped and kept: wash sales, term countdowns, the
honest null-basis. New: "your return's rows match the IRS's copy
box-for-box — the mismatch letter can't start."

**Edges.** Noncovered rows with person-asserted basis → category E/F
with the provenance showing the basis came from the person, not the
broker — visible in the manifest, because that's exactly what an
examiner would ask. Crypto disposals (C3 person-asserted) land as 8949
rows with no broker document, category C/F.

**Acceptance.** Every existing lot fixture replayed through the fact
model with identical dollars (regression gate); category assignment
matrix; provenance chain from a manifest row back to a specific 1099-B
row. Cruel case: the corrected consolidated 1099 (C3) re-runs this and
the delta reaches an H2 amendment candidate if already snapshotted.

**Fence.** No new lot logic. No options/futures/1256 (named). The lot
engine's existing behaviour is the spec — divergence is a bug here, not
there.

---

### D6 — Early-withdrawal penalty (Form 5329)

**Purpose.** The 10% ambush on P6's $9,000 cashout — and the exception
list nobody reads, with its cruel IRA-vs-401(k) asymmetry.

**Authority.** 5329 instructions; Pub 590-B.

**Contract.** C5's code-1 facts → penalty computation plus an
**exceptions engine**: the demographic-relevant set (higher-education
expenses — *IRA only*; first-home $10k — *IRA only*; medical above the
AGI floor; unemployment health premiums; disability; the age-55
separation rule — *employer plans only*) each expressed as facts needed →
exception applies, laid out as options with the dollars, never
auto-claimed (some require substantiation the person must actually
have). Withholding from the 1099-R nets against the total bill in
readiness — the 20% that felt like settlement usually isn't.

**Finding.** "Education expenses kill this penalty for an IRA — and do
nothing for a 401(k). Same money, different pocket, $900 difference."
And P6's: "the 20% they kept covers the tax but not the penalty — here's
the real bill."

**Edges.** Unknown plan type (IRA vs 401(k)) → fork; the asymmetry makes
this fork's price non-obvious and worth showing. Roth contributions come
out penalty-free (basis-first ordering) — Roth ordering is a named v1
refusal (C5 fence), so a Roth code-J distribution detects-and-refuses
rather than over-penalising.

**Acceptance.** P6 to the dollar; each exception's fact requirements;
the IRA/401(k) asymmetry matrix; Roth refusal. Cruel case: two
distributions, one excepted one not — per-distribution computation, not
year-pooled.

**Fence.** No Roth ordering. No SEPP/72(t). Exceptions are options with
requirements, never assumptions.

---

### D7 — Tips & overtime deductions (Sch 1-A, TY2025–2028)

**Purpose.** Brand-new law aimed square at this audience's jobs — and
sunsetting in four years, so both the money and the window are findings.

**Authority.** OBBBA provisions as implemented in Sch 1-A and its
instructions; figures verified Part II ($25k tips / $12.5k overtime /
$150k MAGI phaseout / TY2025–2028).

**Contract.** `tipsOvertimeDeduction(facts, taxYear)`: nothing outside
2025–2028 (the D2-pattern year gate, second demonstration of Doctrine
6). Consumes qualified-tip facts (W-2 tip boxes, 1099-NEC/-K tip
components from C2's decomposition, person-asserted unreported tips →
which also route to Form 4137 — tips never reported to the employer owe
FICA via 4137, and the two forms interact), qualified-overtime facts
(the premium portion only — the half, not the time-and-a-half, a
distinction extraction and intake must both honour), occupation gate
(Treasury's qualifying-occupation list, year data), MAGI phaseout.

**Finding.** "Your tips are income-tax-free up to $25,000 — but Social
Security still comes out, so the paycheck won't look like the headline
said." The overtime version: "only the extra half of time-and-a-half
counts."

**Edges.** Employer reported tips wrong or not at all → the 4137 path
with its FICA consequence explained, not hidden. Occupation not on the
list → named, explained, refused. Self-employed tips interact with D4's
Sch C — no double deduction.

**Acceptance.** A tipped variant of P1 (server, $18k wages + $7k
reported tips) end to end; the premium-only overtime math; the 4137
interaction; TY2024 and TY2029 return not-applicable; phaseout boundary.
Cruel case: tips on a 1099-K (C2 decomposition) claimed once, not twice,
across C2's dedupe and this deduction.

**Fence.** No payroll-side math (that's the employer's W-2 to get
right); Basis computes the return-side deduction from what the documents
and the person say.

---

### E1 — The 1040-NR return shape

**Purpose.** The other return. For a nonresident, most of what this
document says elsewhere changes polarity — and every mainstream free
tool simply doesn't file it, which is why P3 needs Basis at all.

**Authority.** 1040-NR instructions; Pub 519. ECI/FDAP sourcing rules
at the depth the personas need, no deeper.

**Contract.** A2's `nonresident` status flips the engine's spine:
standard deduction off (E3 can turn it back on for India), education
credits and saver's credit blocked with explanations, filing statuses
restricted (single/MFS shapes; no HoH, no joint except elections we
refuse), dependents off except treaty cases (refused, named), and
income classification: wages and taxable scholarship as ECI at graduated
rates; **US bank interest as exempt portfolio/deposit interest** — the
pleasant finding; state-tax itemized deduction allowed (the one that
matters here). Every blocked item carries its why, because a nonresident
Googling "American Opportunity Credit" deserves the real answer.

**Finding.** "Your savings-account interest isn't US-taxable at all —
and the return you actually need is one most software won't file."

**Edges.** The 6013(g)/(h) elections (treating a spouse as resident) →
refused, named. Scholarship taxability differs from C4's resident path —
the routing on A2 status must be airtight, one of the acceptance
fixtures. Dual-status → E5's brief, never this return alone.

**Acceptance.** P3's full return shape against Pub 519's examples; the
interest exclusion; each blocked credit carries an explanation string;
A8 validation against a nonresident-capable tool (Sprintax) recorded
like the resident personas. Cruel case: an F-1 in year six (resident)
must get *none* of this — the flip is A2's, and E1 must trust it.

**Fence.** No FDAP withholding reconciliation beyond 1042-S facts. No
elections. No treaty logic (E3's).

---

### E2 — Form 8843

**Purpose.** The form every exempt individual owes every year, income or
none — and the paper trail that later defends both the residency status
and the FICA refund.

**Authority.** Form 8843 and Pub 519.

**Contract.** A2's exempt-individual determination → an 8843 requirement
per year, standalone when no return is due (with the mailing reality: no
e-file for a bare 8843). Fields populate from existing facts (visa,
institution, days). H4 interplay: prior exempt years with no 8843 on
record → a catch-up list, framed as protective, not punitive.

**Finding.** "You owe this form even in a year you earned nothing — it's
what proves your exemption if anyone ever asks, including for your FICA
refund."

**Edges.** Unknown institution details → the form's own fields say what's
needed; readiness treats it as its own line, not a return blocker.

**Acceptance.** Zero-income year emits the standalone requirement; five
exempt years emit five; catch-up listing for P8-style gaps. Cruel case:
the year-six resident owes none — and the requirement must vanish, not
linger.

**Fence.** J-visa researcher variants beyond students: named, refused.

---

### E3 — The treaty engine

**Purpose.** Data, not code: the handful of treaty benefits that move
money for students, applied by citation.

**Authority.** The treaties themselves via IRS Pub 901 / treaty texts:
v1 ships **India Article 21(2)** (standard deduction preserved for
students — verified against P3) and **China Article 20** ($5,000
wage/scholarship exemption, and its famous survival past residency
change), because those two cover the largest student populations.
Everything else: named, refused, with the country and article looked up
so the refusal teaches.

**Contract.** `treatyBenefits(facts) → Benefit[]` where a Benefit is
`{ country, article, kind, amount|flag, survivesResidency }`, consumed by
E1 (deduction lines, exemption lines) and by the resident-year engine for
the China survival case. Data table is year-aware (treaties rarely
change, but the table's shape assumes they can).

**Finding.** "India's treaty gives you the standard deduction other
nonresidents don't get — worth about $2,300 at your income." / "China's
$5,000 exemption follows you even after you become a resident."

**Edges.** The 8833 disclosure question: the student benefits above are
exempt from 8833 filing — asserted in the table per benefit, so a future
benefit that *does* require it forces the form into requirements rather
than silently skipping.

**Acceptance.** P3 with India; a China variant incl. the residency-
survival year; a no-treaty country produces clean nothing; an
unsupported-treaty country produces the named refusal with citation.

**Fence.** Two countries v1. No saving-clause reasoning beyond the
coded benefits. The table grows by slice revision, never by inference.

---

### E4 — FICA refund detection (Forms 843 + 8316)

**Purpose.** The single best found-money in the product: withheld Social
Security and Medicare that was never owed, sitting with the Treasury
until asked for.

**Authority.** Pub 519 (student FICA exemption); Form 843/8316
instructions; process verified Part II.

**Contract.** A2's `ficaExempt` × C1's box 4/6 facts > 0 → a finding
object: amount, the employer-first step (with the letter's contents
outlined), then the 843+8316 package (documents listed: W-2, visa, I-94,
I-20, the employer-refusal statement 8316 exists to capture), the 3–6
month reality, and the three-year claim window with its clock. Lands in
H1's **money-outside-the-return** section — it is not a 1040 line, and
the manifest structure must carry non-return findings for exactly this.

**Finding.** "$1,240 of Social Security tax was taken from you in error.
It's recoverable, here's the exact path, and the clock runs out in
March 2029."

**Edges.** Employer refuses or is defunct → straight to 843/8316 with
8316 documenting the attempt. Partial-year exemption (the year-six flip
mid-career) → only the exempt months' withholding qualifies; v1 handles
the clean full-year case and names the partial year for a preparer.

**Acceptance.** P3 fires with the document checklist; year-six resident
doesn't; zero box 4 doesn't; the claim-window clock computes from each
W-2's year. Cruel case: FICA withheld on *unauthorized* work — the
exemption rides authorized employment; detect the question, refuse the
guess.

**Fence.** Basis prepares the package contents list and the finding —
it does not generate the 843/8316 PDFs in v1 (H-phase question, same
posture as the manifest-before-PDFs decision).

---

### E5 — Dual-status years

**Purpose.** Arrival and departure years are genuinely specialist
returns; the contract is the best refusal in the product — detection
plus a brief that makes the preparer conversation cheap.

**Authority.** Pub 519 dual-status chapter.

**Contract.** A2 detects the straddle (exempt years ending, substantial
presence beginning; or first-arrival partial years) → `DualStatusBrief`:
the computed residency start/end date and which test set it, income
facts split into the resident and nonresident windows, the restrictions
that will apply (no standard deduction, no joint filing, the statement
requirements), and the forms a preparer will file — everything Basis
already knows, organised so the person walks in informed instead of
frightened. Readiness verdict for such a year: `blocked` with this brief
as the block's payload, per Doctrine 7's detect → name → explain →
refuse.

**Finding.** "Your first calendar year here is a split return that's
genuinely worth a professional — here's the one-page brief that makes
that meeting twenty minutes instead of two hours."

**Acceptance.** An arrival-year P3 variant produces the brief with the
correct start date per Pub 519's rules; a mid-five-years F-1 does not
trigger; the brief's income split matches the fact timeline. Cruel case:
December arrival — exempt from day one, *not* dual-status (the exemption
defers the residency question entirely); the detector must know the
difference.

**Fence.** No dual-status return computation. The brief is the product.

---

### F-phase preface — how a state module works

Each state is an independent, year-parameterised rule set consuming the
same facts and the federal determinations — never a percentage slapped on
federal liability. Each declares: its conformity differences that matter
to the personas (enumerated, fenced), its own credits (the oblivious-money
list), its residency definition, and its part-year/nonresident forms for
F4. States join the A5 SCOPE object the release their slice ships;
until then B3's treatment table plus the named refusal covers them.

---

### F1 — California

**Purpose.** The largest user state, no preferential gains rate, and two
credits its young residents essentially never claim.

**Authority.** FTB Form 540 instructions; CalEITC (FTB 3514)
instructions.

**Contract.** CA AGI from federal facts with the enumerated conformity
set: **HSA deduction disallowed** (add-back — the W-2 code-W fact from
C1 finds it), student-loan-interest conforming, no capital-gains
preference (B3 formalised into actual liability). CA brackets, personal
exemption credits (year data). The credits: **renter's credit**
(nonrefundable, income-gated, mechanics coded, amounts year data — costs
nothing but knowing it exists) and **CalEITC** with its young-adult
eligibility (18+ without children qualify — a deliberate state choice
the federal EITC only partially mirrors), plus its foster-youth add-on
named. SDI overpayment across multiple employers → excess is refundable
on the 540; C1's multi-employer facts detect it.

**Finding.** "You rent in California — that's a credit for literally
existing." / "CalEITC pays young workers the federal credit ignores." /
"Your HSA deduction doesn't work here — CA is one of two states that
taxes it."

**Edges.** Part-year → F4. NRA federal status → CA has no such concept;
the 540NR path routes through F4's allocation, v1 refuses the
combination beyond naming it.

**Acceptance.** FTB instruction examples; the HSA add-back from a
code-W fact; renter's-credit gating including the claimed-as-dependent
exclusion; CalEITC age band; excess-SDI from two employers. Cruel case:
CalEITC's investment-income ceiling — P2's gains can disqualify, and
the engine must check it.

**Fence.** Full-year residents v1. The conformity set is the enumerated
list — anything else detected (e.g. 529 facts) names itself and defers.

---

### F2 — New York (state + NYC + Yonkers + convenience)

**Purpose.** One state, three taxes, and the rule that generates more
surprise bills for remote workers than anything else in state taxation.

**Authority.** IT-201/IT-203 instructions; **TSB-M-06(5)I** (convenience
of the employer); NYC/Yonkers provisions in the IT-201 instructions.

**Contract.** NY AGI with the enumerated conformity set (401(k) and
student-loan interest conform; NY's **college tuition credit/itemized
deduction** — its own small oblivious-money item, year data). NY
brackets; **NYC resident tax** driven by a months-in-city residency fact
(a life question: "which borough, how long"); **Yonkers** resident
surcharge and nonresident earnings tax. The convenience rule as a fact
question nothing on any document answers: employer's NY office + days
physically elsewhere + the narrow employer-necessity escape → NY-source
wages regardless of where the person sat. Statutory-residency detection
(183 days + permanent place of abode → resident even while domiciled
elsewhere) → detect, explain, refuse the dual-resident computation
(F4 names it).

**Finding.** "You worked from Boston all year for a Manhattan company —
New York taxes those wages anyway, and always has. Massachusetts will
credit you for it; here's both sides." Plus: "living in Queens is a
second income tax; moving to Hoboken isn't."

**Edges.** The convenience rule's employer-necessity escape is narrow
and factual — v1 computes the conservative (NY-source) answer, explains
the controversy honestly, and marks the contest-it path as
preparer-territory. Never launders a position choice into a default.

**Acceptance.** P5's NY nonresident return via convenience; NYC
resident vs Westchester non-NYC; Yonkers both directions; the tuition
credit; statutory-residency detection firing on 200 NY days + a
sublet. Cruel case: convenience rule with *zero* NY duty days ever —
the rule still reaches, and the explanation must carry it.

**Fence.** No dual-resident relief computation. No audit-position
advice — the conservative number plus the honest explanation is the
product.

---

### F3 — Massachusetts

**Purpose.** B1's rates formalised into a real return — with the
income-class system, its netting order, and three low-income mercies
this audience qualifies for constantly.

**Authority.** MA Form 1 and Schedule B/D instructions.

**Contract.** The class system: Part A (short-term gains at 8.5%;
interest/dividends at 5%), Part B (wages etc. at 5%), Part C (long-term
at 5%) with **MA's own netting ordering** implemented from the schedule
instructions (short losses → short gains → then the specific cross-class
collar rules — the ordering is the module, and B1's estimate retires the
day this ships). Personal exemptions (year data). The mercies: **No Tax
Status** and the **Limited Income Credit** (income floors under which MA
tax vanishes or shrinks — students constantly qualify and never know),
the **renter deduction** (half of rent to a cap), and MA's own
**undergraduate student-loan interest deduction** (broader than the
federal one — interest deductible in full, no phaseout, the kind of
state generosity nobody advertises).

**Finding.** "Your income is under MA's floor — you owe the state
nothing, and filing gets your withholding back." / "MA lets you deduct
undergrad loan interest the feds phase you out of."

**Edges.** Part-year → F4 (P5 stays full-year MA). The 4% surtax
(income > ~$1.08M) is coded because it's cheap and the rule set is
honest, with a fixture proving it never touches the personas.

**Acceptance.** Netting fixtures straight from the schedule
instructions' examples; NTS/LIC thresholds; the renter deduction cap;
B1-vs-F3 agreement on P5's trades (the estimate and the real module must
reconcile, then B1 defers). Cruel case: short-term loss exceeding
short-term gain with long-term gain present — the cross-class collar,
MA's own worked example transcribed.

**Fence.** The three-state promise: MA module knows MA. Credit for
taxes paid lives in F4.

---

### F4 — Multi-state allocation

**Purpose.** The moved-mid-year and work-across-a-border realities —
part-year returns, income allocation, and the credit that stops the
same dollar being taxed twice.

**Authority.** Each state's part-year/nonresident instructions (540NR,
IT-203, MA Form 1-NR/PY); the credit-for-taxes-paid rules per receiving
state (MA OJC, CA OSTC, NY resident credit — three different formulas,
implemented per pair).

**Contract.** A residency timeline from move-date facts → per-state
part-year returns with allocation: wages by workday facts (paystub
splits where documents exist, day-count where they don't — marked
estimate), investment income by residence at realization (the lot
engine's dates make this computable, a quiet payoff of P4-era
decisions), SE income by where performed. Credit for taxes paid
computed with the **receiving state's own formula** for the three
state-pairs in scope — P5's MA-credit-for-NY-convenience-tax is the
founding fixture. Dual statutory residency (F2's detection) and
three-plus-state years → named refusal with the E5-style brief.

**Finding.** "You moved in June — each state taxes its half, the sale
in August belongs to the new one, and here's the credit that keeps
NY and MA from both taxing your salary."

**Edges.** Allocation where no paystub covers the split → day-count
estimate, marked, with the fork price of finding the paystub. The
credit is capped at the receiving state's own tax on that income —
the formulas differ and the cap is where naive implementations go
wrong; per-pair fixtures.

**Acceptance.** P5 full pair (NY nonresident + MA resident + credit);
a CA→NY move variant with an investment sale on each side of the move
date; credit caps per pair against the states' own worksheet examples;
three-state refusal. Cruel case: move date unknown within a two-month
window — fork over the boundary dates, price the difference.

**Fence.** Three states, pairwise. No dual-residency relief. No
apportionment beyond the enumerated income kinds.

---

### G1 — The intake surface

**Purpose.** Where zero-to-ready actually happens: a resumable surface
that asks life questions in the order money says to ask them.

**Authority.** Doctrine 1 and 3; the desk's architecture precedents
(persistence lessons P8: anything that writes goes to the database and
is verified there).

**Contract.** A facts tRPC router (assert / list / supersede — the A1
algebra over a `facts` table, added to `ensure-schema.ts`). The surface:
life-area sections (You · Home · School · Work · Money moves · Health),
never form-named; within a section, question order is `rankUnknowns`
once any facts exist — the intake literally reorders itself around
dollar value. Every answer is a fact assertion with person provenance;
**skip is an explicit unknown assertion** (distinct from never-asked —
the A1 distinction surfaced in UI); changing an answer is supersession
with a confirmation of what it changes ("earlier you said X — this
updates that, and re-checks two things"). Progress is the A6 readiness
verdict, never a percent-of-questions. A document drop-zone routes to
C-phase per family and marks expectations met.

**Finding.** The surface *is* the finding-machine: after every few
answers, what changed — "that answer just unlocked the education credit
question, worth up to $2,500."

**Edges.** Answers that contradict documents → the supersession flow
names the document ("your W-2 says $19,200 — keep the form's number or
correct it?"). Abandoning mid-section loses nothing (every assertion
already persisted — verified in DB per the P8 lesson, not by screenshot).

**Acceptance.** Refresh-resume with assertions checked in the database;
skip produces value-unknown assertions; reorder actually follows a
priced unknown; the contradiction flow supersedes rather than
duplicates; a full P1 intake runs start to ready in one sitting.

**Fence.** No tax vocabulary in any question string (a test greps the
question registry against a term blocklist — mechanical enforcement of
Doctrine 1). No question exists without a consuming fact id.

---

### G2 — Engine tools for Bip

**Purpose.** The AI's hands: four thin tools, zero logic, so the
conversation can drive the engine without ever becoming it.

**Authority.** Doctrine 2; the existing tool-registry patterns
(degrade with reasons, results stream to panels).

**Contract.** `record_fact` (fact id from the A1 registry + value +
conversation provenance; an unknown id is rejected with the nearest
registry entries echoed — the registry is the contract, and the
rejection teaches the model); `get_readiness` (A6's object, verbatim);
`price_unknown` (single fork or ranked list from A4); and
`explain_determination` (the RuleTrace, verbatim, citation included).
Registry snapshot and current readiness ride the preamble's desk
section. Panel mapping: readiness → a status-list panel; a fork → the
`scen`/`ba` elements the bank already has — the fork panel is the
element bank's reason to exist meeting its best use.

**Acceptance.** Invented fact id → rejection with suggestions;
`explain_determination` returns the engine's trace, not a paraphrase
(string-equality on the citation); every tool degrades with
`available:false` + reason on missing prerequisites; fork results render
the two-branch element with the delta.

**Fence.** No tool computes anything. No tool asserts a fact the person
didn't state (document facts arrive via C-phase jobs, not via Bip).

---

### G3 — The preamble rules

**Purpose.** The behavioural layer that keeps the AI on its side of the
Doctrine 2 line, in the same enforced-not-advisory spirit as the
show_on_desk style rejection.

**Authority.** Doctrine 1 and 2; the P9 lesson that advice-shaped rules
break through adjectives ("the cleanest move") and need naming, not
vibes.

**Contract.** Preamble additions, each with a scripted probe test:
determinations only from tools ("am I a dependent?" → tool call, then
narrate the trace — never a direct assertion, even when the model is
sure); life-vocabulary questioning with an enumerated bad→good table
("are you a dependent?" → "who paid most of your rent last year?");
narrate rule traces with their citations rather than paraphrasing
("the IRS's five tests — you pass four; support is the open one");
the unknown protocol (offer the fork price, then how to find out —
never "probably"); never sum or average across fork branches; and the
existing standing rules (options not recommendations, plain words,
term in brackets) restated against the new tools.

**Acceptance.** Transcript-level probes in the live-verify pattern:
the dependency probe produces a tool call and no asserted status in
the prose; "just guess for me" produces the fork price; a
determination-flavoured adjective sweep (the P9 superlative lesson
applied to filing: "you should", "the smart move", "definitely
claim") over generated responses.

**Fence.** The preamble never contains a tax rule — rules live in the
engine; the preamble contains conduct.

---

### G4 — The absence board

**Purpose.** Doctrine 4 gets a face: what should exist, what has
arrived, what's late, and what that costs — the desk checklist grown
into the readiness view it was always going to become.

**Authority.** A5 expectations + A6 readiness; the desk-status
lineage (its four states, its "never about the person" detail-line
rule).

**Contract.** The desk checklist becomes a **view over A6** (the
parallel computation in `desk-status.ts` retires — one engine, two
surfaces). Per expectation: who should send it, why Basis expects it
(the fact chain, tappable), when it should arrive, and state
(waiting / due / late / arrived / matched), with `late` computed from
`arrivesBy` × injectable today and carrying its action ("W-2s were due
Jan 31 — ask payroll, or pull the IRS transcript"). Requirements
without expectations (P4's no-form Sch C) render as their own strip —
income the paper trail won't confirm. Unmatched arrivals surface the
G1 tell-me-about-it hook.

**Finding.** "Everything your year should produce, and the one thing
that hasn't shown up." The empty state is honest about the calendar:
before late January, *waiting* is the normal state of the world and
the board says so.

**Acceptance.** P4's board: no 1099-K expectation, Sch C strip
present; the late flip at Feb 1 with injectable today; expectation →
arrival → matched transitions written to and verified in the
database; the desk checklist and the board agree because they are one
engine (a test renders both from one readiness object). Cruel case
from the desk's history: a year with no facts shows not-started, and
zero expectations is displayed as "tell me about your year first",
never as "all clear".

**Fence.** No document viewing (Documents surface owns that). No
new persistence — expectations are computed, only arrivals and match
state persist.

---

### H1 — The manifest

**Purpose.** The deliverable of the entire product: everything the
year concluded, every number's ancestry, and everything still open —
the thing a person takes to free software or a preparer and finishes
in an evening.

**Authority.** Every consumed slice's outputs; form line numbering
from each form's own instructions.

**Contract.** Per required form: line items `{ form, line, label,
amount, provenance }` where provenance resolves — mechanically,
tappably — through rules to facts to sources (Doctrine 5's payoff).
Sections beyond the forms: unknowns with their A4 prices; cautions
(kiddie guard, corrected-1099 season, estimates); out-of-scope forms
with their explanations; **money outside the return** (E4's FICA
refund; the IRA-until-April option with D2's credit delta); the
calendar (filing deadline, quarterly dates, the H4 forfeit clocks);
and where-to-file (Free File thresholds, the direct links, what to
carry). Renders as printable HTML in the product's materials and
exports as JSON. **Snapshots**: a manifest can be frozen and marked
filed-with-date; snapshots are immutable and become H2's baseline.

**Finding.** The whole product's: "here is your year, checked, with
nothing hidden — including the $1,240 that isn't on any tax form."

**Edges.** A manifest with open blockers renders — with the blockers
on top, per A6's verdict; readiness gates the *framing* ("not ready:
two items"), never the visibility. Unknowns appear with prices even
at ready-with-cautions.

**Acceptance.** P1's manifest line-agrees with the A8 recorded
expectations end to end (the integration test of the entire spine);
every line's provenance chain resolves with no dangling refs;
snapshot immutability enforced at the database (P8 lesson); a fact
superseded post-snapshot flips nothing in the snapshot and everything
in the live view.

**Fence.** No filled PDFs in this slice (the decided sequencing —
the manifest's structure is built so a PDF layer can consume it
later without rework). No e-filing, ever (Part II).

---

### H2 — Amendments (Form 1040-X)

**Purpose.** The March reality: the corrected 1099 lands after
filing, and the difference between panic and a worksheet is this
slice.

**Authority.** 1040-X instructions; the three-year/two-year refund
claim limits.

**Contract.** The detector: any supersession whose dependents touch
a **snapshotted** manifest → an amendment candidate with the
recomputed delta (H1 live-vs-snapshot diff is the input). Output:
the 1040-X worksheet shape — column A (as filed, from the
snapshot), column C (as corrected, from live), column B (the
change), plus the explanation line drafted from the provenance
diff ("Corrected 1099-B from Robinhood dated Mar 12 changed
proceeds on 8949 row 4"). The claim clock (three years from filing
/ due date) computes per year and joins the H1 calendar.
De-minimis handling: a delta under the IRS's own math-error
tolerance is reported with "the IRS corrects rounding itself" —
detect-and-inform, not detect-and-alarm. CP2000 posture recorded
here: the reconciliation features exist so the mismatch letter
never starts; if a user brings one, the same diff machinery
explains which line disagrees — response drafting is out of scope,
named.

**Finding.** "Your brokerage restated your dividends after you
filed. It changes your tax by $37 — here's the exact worksheet,
and here's the deadline it stops mattering."

**Acceptance.** Snapshot P1, supersede a W-2 wage fact, receive
A/B/C columns that reconcile to the dollar; a post-snapshot change
with zero tax delta produces the no-action explanation; claim-clock
math against both limits (filed-late and filed-early cases). Cruel
case: two supersessions before any amendment is made — one
candidate, cumulative delta, not two.

**Fence.** No amended *state* returns v1 (named per state). No
CP2000 response generation.

---

### H3 — Extensions (Form 4868)

**Purpose.** The form people file in fear and misunderstand
completely: it extends filing, not paying — and the slice's job is
to compute the payment that should ride along.

**Authority.** 4868 instructions; state extension rules per F-phase
state (CA's automatic no-form extension; NY and MA forms).

**Contract.** Pre-deadline, readiness ≠ ready → the extension
option surfaces with: the 4868 requirement, and a **payment
estimate** = the conservative branch across open forks (A4's
machinery pointed at "what's the most you plausibly owe" — pay
that, refund the difference later, no penalty either way).
Per-state notes from F-phase: CA automatic, NY/MA their own forms,
each with its own pay-by reality. Interest/penalty framing: the
failure-to-pay math shown as what the estimate avoids.

**Finding.** "An extension buys you six months to file and zero
days to pay — send $X with it and you're clean either way."

**Acceptance.** Blocked-P7-in-April produces 4868 + the
conservative-branch payment; a ready return before the deadline
surfaces no extension nag; state notes per profile state; the
conservative branch is provably max-across-forks (property test
over fork sets). Cruel case: everything unknown — the conservative
estimate still computes from what exists, labelled loudly.

**Fence.** Basis doesn't submit the extension. No penalty-abatement
reasoning.

---

### H4 — Prior unfiled years

**Purpose.** P8's fear, dismantled: most people who haven't filed
were owed money, the clock to claim it is running, and the IRS
will hand over the documents they think they've lost.

**Authority.** Refund claim limits (three years from the due
date); IRS Wage & Income transcript as a document source; year
data per supported prior year.

**Contract.** Year multiplexing is already the desk's architecture
— this slice makes it real for filing: per-year fact sets (A1 is
year-scoped by construction), per-year rule sets gated by a
**year-data completeness check** in SCOPE (a prior year whose rules
aren't loaded refuses by name — Doctrine 6's enforcement arm,
which is why the 1099-K threshold table keeps its 2022–2024
values). The forfeit clock per unfiled year orders the work:
oldest-expiring first, with the date and the estimated refund from
whatever facts exist. The **transcript path** as a first-class
document source: "you don't need your old W-2 — the IRS's Wage &
Income transcript has every form they received, here's how to pull
it" — and C-phase extraction accepts transcripts as a document
kind, which quietly also serves absence detection for the current
year.

**Finding.** "You were probably owed money in every year you
skipped — 2023's refund evaporates in eleven weeks, so it goes
first. And filing late when you're owed a refund carries no
penalty at all."

**Acceptance.** P8: three years ranked by forfeit date with
estimates; a year outside loaded year-data refuses by name; a
transcript upload asserts facts across families with document
provenance; the no-penalty-on-refund framing appears only when
the estimate is in fact a refund. Cruel case: one prior year owes
— the framing must flip honestly for that year (failure-to-file
penalties named, the sooner-is-less arithmetic shown) while the
refund years keep theirs.

**Fence.** Supported prior years = years with loaded data,
enforced. No penalty-abatement or payment-plan advice beyond
naming that both exist.

---

### H5 — Next year's lever (Form W-4)

**Purpose.** The only form that changes the future: close the loop
from this year's outcome to next year's paycheck.

**Authority.** Pub 505; the W-4 form and its worksheets; the
existing safe-harbor engine (`quarterly.ts`).

**Contract.** From the completed year: the withholding gap
(actual liability vs withheld), projected forward with next
year's year-data → concrete W-4 entries (the Step 3/4 dollar
lines, computed — not "claim fewer allowances", which hasn't
existed since 2020). For the side-gig case, both instruments laid
out priced (standing rule): extra per-paycheck withholding on the
W-2 job vs quarterly estimates, same target, different cash
rhythm. The refund-as-choice framing, carefully: "you lent the
IRS $2,300 interest-free this year — if you'd rather have $88 a
paycheck, this line changes it; if you like the forced saving,
that's a real preference too" — both directions stated, neither
recommended.

**Finding.** "Here's the actual box and the actual number that
makes next April boring."

**Acceptance.** P1's refund produces the Step-line numbers that
would have zeroed it (checked against Pub 505's worksheet math);
P4 gets both instruments priced to the same safe-harbor target;
the framing test — both directions present, no recommendation
verb (the G3 sweep applied here). Cruel case: mid-year job
change — the computation uses remaining-paychecks, not
year-total division.

**Fence.** No employer submission. No state withholding forms v1
(named per state).

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
| Tips & overtime deductions (OBBBA, TY2025–28; FICA still applies) | D7, C1, C2 |
| Unreported tips → Form 4137 | D7 |
| Taxable scholarship (1098-T box 5 > box 1) | C4 |
| Scholarship-as-income election to unlock AOTC | D1 |
| AOTC four-year lifetime counter (cross-year fact) | D1, A1 |
| Qualified vs ordinary dividends | C3 |
| Digital-assets question gates readiness | C3, A6 |
| 1099-K gross ≠ income (fees, refunds, personal items) | C2 |
| Rollover code G is not income | C5 |
| State refund on 1099-G rarely taxable here | C5 |
| SE-tax $400 floor | D4 |
| 8949 category boxes as CP2000 prevention | D5 |
| IRA vs 401(k) exception asymmetry (education, first home) | D6 |
| NRA bank interest not US-taxable | E1 |
| China treaty Art. 20 ($5,000, survives residency) | E3 |
| FICA refund three-year claim window | E4 |
| Dual-status arrival/departure brief | E5 |
| CalEITC young-worker eligibility; renter's credit; HSA add-back; excess SDI | F1 |
| NY college tuition credit; NYC/Yonkers residency facts; statutory residency | F2 |
| MA No Tax Status / Limited Income Credit; renter deduction; undergrad loan interest; netting order | F3 |
| Credit-for-taxes-paid formulas per state pair | F4 |
| Intake question registry greps clean of tax vocabulary | G1 |
| Fact-id registry rejection teaches the model | G2 |
| Conservative-branch payment with extensions | H3 |
| IRS Wage & Income transcript as document source | H4, C-phase |
| W-4 Step 3/4 computed dollars (allowances are dead) | H5 |
