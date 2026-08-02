// ─── B3 · How states treat capital gains, in one line ──────────────
// The trap this kills: "0% federal" read as "0%". A Californian realizing
// the whole window owes California its normal rate on every dollar of it —
// CA has no preferential capital-gains rate at all, and neither does New
// York. The window copy stays true; the framing was the lie.
//
// A data table, not a rule engine (the fence): each state gets a treatment
// class and one plain-words line for the surfaces to append wherever the
// window is described. Actual state liability is F-phase's job.
//
// Verified: MA 8.5%/5% split (Part II). CA all-ordinary (FTB — no
// preferential rate). NY ordinary (no preferential rate). The no-income-tax
// set is the standard eight; Washington's high-threshold capital-gains
// excise is named rather than hidden.

export type CapitalGainsTreatment =
  | 'ordinary'
  | 'split-by-term'
  | 'none'
  | 'unknown'
  | 'not-modeled';

export interface StateTreatment {
  kind: CapitalGainsTreatment;
  /** One sentence the surfaces append to any 0%-window claim. */
  line: string;
}

const NO_INCOME_TAX = new Set(['AK', 'FL', 'NV', 'SD', 'TN', 'TX', 'WY']);

export function stateTreatment(stateCode: string | null | undefined): StateTreatment {
  const state = (stateCode ?? '').trim().toUpperCase();

  if (state === '') {
    return {
      kind: 'unknown',
      line: 'Which state you live in changes this — the window above is federal only until the state is set.',
    };
  }
  if (state === 'MA') {
    return {
      kind: 'split-by-term',
      line: 'Massachusetts taxes these gains too — 8.5% under a year, 5% over — so the 0% is federal only.',
    };
  }
  if (state === 'CA') {
    return {
      kind: 'ordinary',
      line: 'California taxes all capital gains as regular income — the 0% is federal only, and the state takes its normal rate regardless of holding period.',
    };
  }
  if (state === 'NY') {
    return {
      kind: 'ordinary',
      line: 'New York taxes capital gains as regular income — the 0% is federal only.',
    };
  }
  if (state === 'WA') {
    return {
      kind: 'none',
      line: 'Washington has no income tax on these gains at typical amounts (a state excise exists only above a high threshold).',
    };
  }
  if (NO_INCOME_TAX.has(state)) {
    return {
      kind: 'none',
      line: `${state} has no state income tax — 0% federal really is 0% here.`,
    };
  }
  if (state === 'NH') {
    return {
      kind: 'none',
      line: 'New Hampshire does not tax capital gains — 0% federal really is 0% here.',
    };
  }
  return {
    kind: 'not-modeled',
    line: `${state}'s treatment isn't modelled yet — the window above is federal only.`,
  };
}
