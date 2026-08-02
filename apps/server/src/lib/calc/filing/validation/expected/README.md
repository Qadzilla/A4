# External validation recordings

A recording is the output of entering a persona's facts into a real filing
tool **by hand** and writing down every line the tool produced. It is a
frozen artifact with provenance: edited only by re-performing the external
run — never to make a test pass.

Files land here as `p1.freetaxusa.json`, `p2.cashapp.json`, etc. The test
suite picks up every `*.json` in this directory automatically, validates
its shape, and compares it against the engine line by line. The C-phase
gate opens when **P1 and P2 each have recordings from two different tools
with no untriaged divergences**.

## The protocol

1. Use the tool's demo/preview mode where offered; never file anything.
2. Enter exactly the persona's facts below. Where the tool demands something
   the persona doesn't specify, pick the listed assumption and record it in
   the `assumptions` array — a recording must be reproducible by a stranger.
3. Walk to the review/summary screen and copy the line values.
4. Fill a copy of `TEMPLATE.json`. `toolVersion` is the season plus access
   date. `recordedBy` is you.
5. Never round-trip numbers through the engine — the value in the file is
   what the tool's screen said.

## P1 — first paycheck (tax year 2026)

Single. Born 2003-04-15. Not a full-time student. Cannot be claimed as a
dependent (answer "no" to "can anyone claim you"). One W-2: box 1 =
$42,000, box 2 (federal withholding) = $0 — record the assumption. No
other income, no adjustments, standard deduction.

Lines to record: AGI (1040 line 11), standard deduction (12), taxable
income (15), tax (16), total tax (24).

Engine's current hand-checked values for comparison after recording:
AGI 42,000 · deduction 16,100 · taxable 25,900 · tax 2,863.

## P2 — dependent with a Robinhood (tax year 2026)

Single. Born 2006-03-10. Full-time student. **Can** be claimed as a
dependent (answer "yes"). One W-2: box 1 = $8,000, box 2 = $0. One
long-term sale: proceeds and basis of your choosing producing exactly
**$3,100 long-term gain**, acquired > 1 year before sale — record the
figures used. No other income.

The tool will compute Form 8615 (kiddie tax) and ask for the parents'
details. Use: **married filing jointly, taxable income $120,000, no other
children, no capital gains of their own** — record this verbatim in
`assumptions`; it is what makes the recording reproducible.

Lines to record: AGI, deduction (expect the limited dependent amount),
taxable income, tax, total tax — plus the 8615 tax amount in `notes`.

The engine currently reports tax on P2's own rates and flags `form-8615`
as a known gap — the tool's higher tax line will be recorded as a
`known-gap`, not a divergence. That gap closing is B2/D-phase's
acceptance.

## P3 — deferred

Explicitly untested-externally until E-phase: a 1040-NR needs a
nonresident-capable tool (Sprintax or equivalent) and an engine that
computes the return. Listed in the harness so nobody mistakes absence for
coverage.
