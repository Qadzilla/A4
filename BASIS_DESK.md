# P8 — The Desk

> The workspace stops being an empty canvas that waits for a question, and
> becomes a tax year with standing state: what's resolved, what isn't, and why
> it matters. The conversation moves inside it.

## Status — shipped

All five slices done. The desk holds a tax year, knows where it stands, opens
the evidence behind any line, compares every position side by side, and the
conversation reads the same standing status the user does.

Worth keeping from the build: **S1 deleted more than it added**. Moving panels
off conversations removed the hydration-slot claim, the resume gate, and two
conversation-creation dances — every one of them a workaround for a scope that
was wrong. When a change makes scaffolding disappear, the scaffolding was the
symptom.

And the rule that shaped every line: a status that can't be computed says so.
`unknown` is not a failure state, it's the honest one.

## Why

The user has no accountant. They need to understand what they're doing and
why, not be handed a number. Two things follow.

**Answers aren't enough — standing is.** Fidelity's list of what goes wrong
for self-directed investors runs to eight items: selling too soon, poor basis
records, wash sales, missed losses, missing the preferential bracket, late
strategy, unreported income, missed deadlines. Basis already computes seven of
them. It has never once told you which apply to *you*. The gap isn't
computation, it's that nothing has a status.

**Deciding is discriminative, not generative.** Hebbia's argument for building
a grid rather than a chat: knowledge work is "processes, not just prompts",
and "important decisions are discriminative, not only generative" — you want
to see the alternatives and choose, not receive a verdict. Our workspace today
is purely generative. Ask, receive, panel appears. Nothing lets you compare
options or work a process to completion.

And from tax practice tools (TaxDome, Karbon): preparers don't start from a
question. They start from **a checklist of what's missing**. The organising
object is source-documents-to-forms with a status on each line.

## The shape

```
Desk (a tax year)
├── Checklist         standing status, computed — the default view
├── Panels            explain a line, or answer a question; persist here
└── Conversation      interrogates the desk; Bip can see its state
```

Chat stops being the entry point. It becomes the way you go deeper on
something the desk already surfaced.

## Slices

**S1 — Panels belong to a desk, not a conversation.**
Today `workspace_panels.conversationId` scopes everything, so a new chat means
an empty workspace — wrong for someone assembling a year over weeks. Panels
move to a desk keyed by workspace + tax year; conversations happen inside it.
Existing rows adopt the current year. Year switcher in the header.

*Do this first and alone.* It's the schema change, and everything else assumes
it. Cheap now — the only data is the dev database.

**S2 — The standing checklist.**
`services/desk-status.ts`: a pure function from (holdings, trades, files,
1099s, tax profile, today) to a list of lines, each with a status, a one-line
reason, and an action. Pure so it can be tested hard, because this is the
surface that will be wrong in the most embarrassing ways.

Lines, all computable from engines that already exist:

| Line | Status comes from |
|---|---|
| Documents for the year | files + tax_1099s vs connected accounts |
| Cost basis known | holdings with `costBasis` vs `NOT PROVIDED` |
| Trade history imported | trades present for the year |
| Wash sales | lot engine's `washDisallowed` |
| The 0% window | `ltcgZeroBracketRoom`, and how much of the year is left |
| Approaching long-term | holdings within ~60 days of the one-year line |
| Harvestable losses | unrealized losses against realized gains |
| Quarterly payments | safe-harbor engine's next deadline |
| 1099 vs our numbers | reconciliation statuses |

Four states only: **resolved**, **needs attention**, **not started**, and
**can't tell yet** — the last one is load-bearing. A line that can't be
computed because data is missing must say so rather than report "resolved".

**S3 — A line opens the panel that explains it.**
Clicking a checklist line puts the panel that justifies it on the desk. Most
map to panels that exist (lots, ledger, tax, reconciliation). Two are new:
*approaching long-term* (positions and their countdowns) and *harvestable
losses* (what could offset what).

This is where comprehension lives: the line says what, the panel says why.

**S4 — The comparison panel.**
Hebbia's grid, scoped to this world: positions down the side, questions
across. For each position — term, days to long-term, unrealized, estimated tax
if sold today, wash exposure. One panel, every position, side by side.

This is the sell decision, and it's the first genuinely discriminative view in
the product.

**S5 — The conversation knows the desk.**
Bip gets desk state in context, so it can answer "what should I look at" from
standing status rather than recomputing. Asking about a line opens or updates
its panel. Bip's job stays judgement, not recitation.

## Tone rule

A checklist about money that someone is doing alone can very easily read as
nagging. **State, don't scold.** "Basis missing on 5 of 9 positions" — not
"You haven't imported your basis." The status is about the data, never about
the person.

## Deliberately not in v1

Freeform canvas. Multi-year comparison. Anything collaborative. A line whose
status is a guess.

## Open questions

- Does a desk exist per tax year, or per workspace with a year filter? Leaning
  per year, since that's how the work is actually bounded.
- What happens to panels when you switch years — hidden, or carried?
- Does the checklist ever get out of the way once everything is resolved?
