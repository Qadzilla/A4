# Corpus inventory

What has been transcribed from authority, what was verified as a figure,
and what each remaining slice still owes the corpus. A fixture without a
citation or a written rationale does not merge — this file is the running
account of where the citations stand.

## Transcribed (in the corpus, cited)

| Authority | What | Fixtures | Fetched |
|---|---|---|---|
| IRS Pub 519 / irs.gov SPT page | 31-day + 183-day weighted formula; the 120-days-three-years worked example ("not a resident for 2025"); exempt-individual categories | `residency/pub519-*` | 2026-08 |
| Pub 519 (rules) | F/J/M/Q student five-calendar-year exemption; any part of a year consumes a whole year | `residency/december-arrival-*`, `residency/absent-year-*` | 2026-08 |
| Pub 501 (rule statements, quoted verbatim) | Age test ("under age 19 at the end of the year", "under age 24 if a student"); full-time student five-calendar-months; temporary absence for education counts as home; joint-return refund-only exception; child-support test incl. scholarships-don't-count; citizen-or-resident test | `dependency/*` | 2026-08 |

## Verified figures (in year-data or SCOPE, sourced)

| Figure | Value | Where |
|---|---|---|
| QR gross-income limit | 2025 $5,200 · 2026 $5,300 (less-than test) | `year-data.ts` |
| Dependent standard deduction | greater of $1,350 or earned + $450, both years | `year-data.ts` |
| Kiddie threshold (8615) | 2026 $2,700 · 2025 deliberately absent until verified | `year-data.ts` |
| 1099-NEC threshold | 2025 $600 · 2026 $2,000 (OBBBA) | `year-data.ts` |
| 1099-K threshold | $20,000 / 200 txns, retroactive (OBBBA) | `year-data.ts` |
| Standard deductions | 2025 $15,750/$31,500/$23,625 · 2026 $16,100/$32,200/$24,150 (OBBBA) | `tax-data.ts` |
| Standard mileage rate | 2025 70¢ (Notice 2025-5) · 2026 72.5¢ Jan–Jun (Notice 2026-10) / 76¢ Jul+ (IR-2025-128); engine floors at 72.5¢, named | `year-data.ts` |
| SS wage base (SE offset) | 2025 $176,100 · 2026 $181,200 | `tax-data.ts` |
| Tips/overtime deductions | Tips $25,000 every status · overtime $12,500/$25,000 MFJ · $100 per $1,000-or-fraction over $150k/$300k MAGI · joint-required if married · TY2025–28 unindexed (IRS OBBBA newsroom, verified 2026-08) | `year-data.ts` |

## Owed to the corpus, by slice

| Slice | Authority to transcribe |
|---|---|
| B1/F3 | MA Schedule B/D netting worked examples (Form 1 instructions) |
| B2 | Form 8615 instructions' worked examples; 2025 threshold verification |
| C1–C5 | Box-level extraction fixtures from real-format samples (esp. the 1095-A monthly table) |
| D1 | Pub 970 worked examples; the scholarship-election example |
| D2 | Form 8880 tier boundaries and testing-window reduction examples |
| D3 | Form 8962 instructions' examples; repayment-cap tiers; TY2025 vs TY2026 cliff pair |
| D4 | Sch SE arithmetic incl. the $400 floor and the 0.9235 factor; 8919 employee-share delta |
| D6 | 5329 exception list; the IRA-vs-401(k) education/first-home asymmetry |
| D7 | Sch 1-A instructions; the premium-only overtime definition; 4137 interaction |
| E1–E5 | Pub 519 dual-status examples; 1040-NR shape; treaty texts (India 21(2), China 20) |
| F1–F4 | FTB/IT-201/Form 1 instruction examples; credit-for-taxes-paid worksheets per pair |
| A8 | Recorded external-tool runs for P1 and P2 (two tools), then P3 via a nonresident-capable tool |

## Unreachable so far

Pub 501's own worked examples (the page fetch truncates before them) — the
rule statements are transcribed and cited instead; the examples should be
added when a full-text source is reachable. The adversarial set covers the
same ground meanwhile.
