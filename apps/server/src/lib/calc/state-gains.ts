// ─── B1 · State tax on investment sales ────────────────────────────
// Massachusetts taxes short-term gains at 8.5% and long-term at 5% — for
// most of this product's users, the short-term state rate is BIGGER than
// their federal bracket, and until this module the pre-trade check showed
// federal only. That is a wrong number for a state we claim to support.
//
// Verified 2026-08 (mass.gov tax rates page; BASIS_FILING.md Part II):
// 8.5% Part A short-term / 5% long-term, 2025 and 2026. The 4% surtax on
// income over ~$1.08M exists and deliberately isn't modelled — it cannot
// bind for this audience, and pretending to model it would imply a
// precision the flat estimate doesn't have.
//
// Fences (BASIS_FILING.md B1): Massachusetts only — other states return
// their honest status, never a guess. Losses net through F3's
// statutory engine (M.G.L. c. 62 § 2(c)) rather than being clamped at
// zero — one ordering, used everywhere. Federal math untouched.

import { netMassachusettsGains } from './filing/states/ma-loss-netting';

export interface StateGainsTax {
  status: 'applies';
  stateCode: 'MA';
  shortTermRatePct: number;
  longTermRatePct: number;
  /** Rate × the gain that survives § 2(c)'s netting, per term. */
  estimatedShortTermTax: number;
  estimatedLongTermTax: number;
  estimatedTotalTax: number;
  note: string;
}

export type StateGainsResult =
  | StateGainsTax
  | { status: 'no-state-on-file'; note: string }
  | { status: 'not-modeled'; stateCode: string; note: string }
  | { status: 'year-not-loaded'; stateCode: string; note: string };

/** Year-parameterised (Doctrine 6), even while the rates happen to agree. */
const MA_RATES: Record<number, { shortPct: number; longPct: number }> = {
  2025: { shortPct: 8.5, longPct: 5 },
  2026: { shortPct: 8.5, longPct: 5 },
};

export function stateTaxOnGains(
  stateCode: string | null | undefined,
  taxYear: number,
  gains: { shortTerm: number; longTerm: number },
): StateGainsResult {
  const state = (stateCode ?? '').trim().toUpperCase();
  if (state === '') {
    return {
      status: 'no-state-on-file',
      note: 'No state of residence on file — state tax on this sale is not included.',
    };
  }
  if (state !== 'MA') {
    return {
      status: 'not-modeled',
      stateCode: state,
      note: `State tax for ${state} isn't modelled yet — the figures here are federal only.`,
    };
  }
  const rates = MA_RATES[taxYear];
  if (!rates) {
    return {
      status: 'year-not-loaded',
      stateCode: state,
      note: `Massachusetts rates for ${taxYear} aren't loaded — refusing to borrow another year's.`,
    };
  }

  // Netted through the statute's own ordering rather than clamped at
  // zero. Until F3 transcribed § 2(c) this dropped losses on the floor
  // and said so; now there is one netting engine and this is a view
  // over it. Interest and dividends are zero here on purpose — this
  // prices a single hypothetical sale, and the year's interest is not
  // part of that question.
  const netted = netMassachusettsGains({
    shortTerm: gains.shortTerm,
    longTerm: gains.longTerm,
    interestAndDividends: 0,
  });
  const shortTax = netted.taxableShortTermGain * (rates.shortPct / 100);
  const longTax = netted.taxableLongTermGain * (rates.longPct / 100);
  return {
    status: 'applies',
    stateCode: 'MA',
    shortTermRatePct: rates.shortPct,
    longTermRatePct: rates.longPct,
    estimatedShortTermTax: shortTax,
    estimatedLongTermTax: longTax,
    estimatedTotalTax: shortTax + longTax,
    note:
      gains.shortTerm > 0
        ? `Massachusetts taxes short-term gains at ${rates.shortPct}% and long-term at ${rates.longPct}% — waiting past the one-year line also saves ${(rates.shortPct - rates.longPct).toFixed(1)}% of the gain to the state.`
        : `Massachusetts taxes long-term gains at ${rates.longPct}%.`,
  };
}
