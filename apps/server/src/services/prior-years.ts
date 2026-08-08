// ─── H4 · Prior years, over the desk ───────────────────────────────
// Year multiplexing was always the architecture — A1 is year-scoped by
// construction and every determination takes a taxYear. This is where
// that stops being a design property and starts being a feature: load
// each candidate year independently and review them together.
//
// The candidate set is the years BEFORE the one being worked on, back
// as far as the forfeit clock still means anything. A year whose refund
// window shut years ago is not worth a row; a year that shut last month
// very much is, because the person needs to be told plainly.

import type { DB } from '../db';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import { FACT_REGISTRY } from '../lib/calc/filing/facts';
import type { PriorYearInput, PriorYearsReview } from '../lib/calc/filing/prior-years';
import { reviewPriorYears } from '../lib/calc/filing/prior-years';
import { yearRulesLoaded } from '../lib/calc/filing/year-data';
import type { FactScopeKeys } from './facts';
import { loadFilingYear } from './filing-year';

/** How far back to look. Five years covers every still-claimable year. */
const LOOKBACK_YEARS = 5;

export async function priorYearsFor(
  db: DB,
  keys: FactScopeKeys,
  currentTaxYear: number,
  today: Date = new Date(),
): Promise<PriorYearsReview> {
  const candidates: number[] = [];
  for (let y = currentTaxYear - LOOKBACK_YEARS; y < currentTaxYear; y++) candidates.push(y);

  const inputs: PriorYearInput[] = [];
  for (const taxYear of candidates) {
    const year = await loadFilingYear(db, keys, taxYear);
    // Facts scoped to this year — timeless ones belong to the person and
    // say nothing about whether this year was started.
    const factsOnFile = year.assertions.filter(
      (a) => a.taxYear === taxYear && FACT_REGISTRY[a.factId].scope === 'year',
    ).length;
    const documentsOnFile = year.docs.filter(
      (d) => d.taxYear === undefined || d.taxYear === taxYear,
    ).length;

    // A year nobody has touched is not an unfiled year — it is a year
    // that may not have needed filing at all. Only years with something
    // on them get a row.
    if (factsOnFile === 0 && documentsOnFile === 0) continue;

    inputs.push({
      taxYear,
      evaluation: yearRulesLoaded(taxYear)
        ? evaluateYear(year.assertions, taxYear, year.extras)
        : null,
      factsOnFile,
      documentsOnFile,
    });
  }

  return reviewPriorYears(inputs, today);
}
