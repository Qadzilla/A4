// ─── Desk status ───────────────────────────────────────────────────
// What a tax year looks like right now: what's settled, what needs a look,
// what hasn't been started, and what genuinely can't be known yet.
//
// Pure on purpose. This is the surface that would be wrong in the most
// embarrassing way — telling someone their basis is fine when it isn't — so
// it takes plain data in and returns plain lines, and the tests can be cruel.

import type { QuarterlyPlan } from './quarterly';

/**
 * Four states, and the difference between the last two matters.
 *
 * `not-started` means this line's own data is missing and you can go and get
 * it. `unknown` means it depends on something else that's missing, so we
 * decline to guess — a line that reports "resolved" because it had nothing to
 * check would be the worst thing this surface could do.
 */
export type LineStatus = 'resolved' | 'attention' | 'not-started' | 'unknown';

export interface DeskLine {
  id: string;
  label: string;
  status: LineStatus;
  /**
   * One line, about the data. Never about the person: "Basis missing on 5 of
   * 9 positions", not "You haven't imported your basis."
   */
  detail: string;
  /** Which panel explains this line, once S3 wires them up. */
  panel: string | null;
}

export interface DeskHolding {
  symbol: string;
  costBasis: number | null;
  acquiredAt: string | null;
  value: number;
}

export interface DeskStatusInput {
  taxYear: number;
  today: Date;
  holdings: DeskHolding[];
  /** Sales the lot engine could match, already filtered to the tax year. */
  realized: {
    shortTermGain: number;
    longTermGain: number;
    washDisallowed: number;
    saleCount: number;
  } | null;
  /** Whether any trade history exists at all, in any year. */
  hasTrades: boolean;
  documentCount: number;
  /** Reconciliation summary for a 1099 covering this year, if one is loaded. */
  reconciliation: {
    matches: number;
    mismatches: number;
    missingHistory: number;
    notOn1099: number;
  } | null;
  hasTaxProfile: boolean;
  ltcgZeroBracketRoom: number;
  /**
   * B2: the kiddie-tax guard's verdict on the window. 'exposed' rewrites
   * the line, 'unknown' cautions it, 'clear' leaves it alone.
   */
  kiddie: { status: 'exposed' | 'clear' | 'unknown'; note: string | null };
  quarterly: QuarterlyPlan | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LONG_TERM_DAYS = 365;
/** Close enough to the one-year line that waiting is a real option. */
const APPROACHING_DAYS = 60;

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

function daysHeld(acquiredAt: string, today: Date): number {
  return Math.floor((today.getTime() - new Date(`${acquiredAt}T00:00:00Z`).getTime()) / DAY_MS);
}

function documentsLine(input: DeskStatusInput): DeskLine {
  if (input.documentCount === 0) {
    return {
      id: 'documents',
      label: 'Documents',
      status: 'not-started',
      detail: 'No statements or forms uploaded yet.',
      panel: null,
    };
  }
  return {
    id: 'documents',
    label: 'Documents',
    status: 'resolved',
    detail: `${input.documentCount} document${input.documentCount === 1 ? '' : 's'} on file.`,
    panel: null,
  };
}

function basisLine(input: DeskStatusInput): DeskLine {
  const total = input.holdings.length;
  if (total === 0) {
    return {
      id: 'basis',
      label: 'Cost basis',
      status: 'not-started',
      detail: 'No positions imported yet.',
      panel: 'portfolio',
    };
  }
  const missing = input.holdings.filter((h) => h.costBasis === null || h.costBasis <= 0).length;
  if (missing === 0) {
    return {
      id: 'basis',
      label: 'Cost basis',
      status: 'resolved',
      detail: `Known for all ${total} position${total === 1 ? '' : 's'}.`,
      panel: 'portfolio',
    };
  }
  return {
    id: 'basis',
    label: 'Cost basis',
    status: 'attention',
    detail: `Missing on ${missing} of ${total} positions — gains on those can't be computed.`,
    panel: 'portfolio',
  };
}

function tradesLine(input: DeskStatusInput): DeskLine {
  if (!input.hasTrades) {
    return {
      id: 'trades',
      label: 'Trade history',
      status: 'not-started',
      detail: 'No trades imported. Realized gains need them.',
      panel: null,
    };
  }
  const sales = input.realized?.saleCount ?? 0;
  return {
    id: 'trades',
    label: 'Trade history',
    status: 'resolved',
    detail:
      sales === 0
        ? `Imported. No sales recorded in ${input.taxYear}.`
        : `${sales} sale${sales === 1 ? '' : 's'} matched to lots in ${input.taxYear}.`,
    panel: 'gains',
  };
}

function washLine(input: DeskStatusInput): DeskLine {
  if (!input.hasTrades || !input.realized) {
    return {
      id: 'wash',
      label: 'Wash sales',
      status: 'unknown',
      detail: 'Needs trade history before this can be checked.',
      panel: null,
    };
  }
  if (input.realized.washDisallowed > 0) {
    return {
      id: 'wash',
      label: 'Wash sales',
      status: 'attention',
      detail: `${usd(input.realized.washDisallowed)} of losses disallowed — the amount moves into the replacement shares' basis.`,
      panel: 'gains',
    };
  }
  return {
    id: 'wash',
    label: 'Wash sales',
    status: 'resolved',
    detail: `None found in ${input.taxYear}.`,
    panel: 'gains',
  };
}

function windowLine(input: DeskStatusInput): DeskLine {
  if (!input.hasTaxProfile) {
    return {
      id: 'window',
      label: '0% gains window',
      status: 'not-started',
      detail: 'Needs your income to work out which bracket applies.',
      panel: 'taxes',
    };
  }
  if (input.ltcgZeroBracketRoom <= 0) {
    return {
      id: 'window',
      label: '0% gains window',
      status: 'resolved',
      detail: 'Income sits above the 0% long-term bracket this year.',
      panel: 'taxes',
    };
  }
  // B2: a student under 24 mostly can't use the window — the parents' rate
  // (Form 8615) reaches their investment income whether or not anyone
  // claims them. The flagship line never advertises what the rule takes.
  if (input.kiddie.status === 'exposed') {
    return {
      id: 'window',
      label: '0% gains window',
      status: 'attention',
      detail: `${usd(input.ltcgZeroBracketRoom)} of 0% federal room on paper — but the parents'-rate rule (Form 8615) applies to a student under 24, so most of it isn't usable.`,
      panel: 'taxes',
    };
  }
  if (input.kiddie.status === 'unknown') {
    return {
      id: 'window',
      label: '0% gains window',
      status: 'attention',
      detail: `${usd(input.ltcgZeroBracketRoom)} of long-term gains could be realized at 0% federal tax — one check first: for a student under 24 the parents'-rate rule (Form 8615) can take most of it. A birth date on the tax profile settles this.`,
      panel: 'taxes',
    };
  }
  return {
    id: 'window',
    label: '0% gains window',
    status: 'attention',
    detail: `${usd(input.ltcgZeroBracketRoom)} of long-term gains could be realized at 0% federal tax.`,
    panel: 'taxes',
  };
}

function approachingLine(input: DeskStatusInput): DeskLine {
  const dated = input.holdings.filter((h) => h.acquiredAt !== null);
  if (dated.length === 0) {
    return {
      id: 'approaching',
      label: 'Approaching long-term',
      status: 'unknown',
      detail: 'Needs acquisition dates, which arrive with statements or a brokerage.',
      panel: null,
    };
  }

  const soon = dated
    .map((h) => ({
      symbol: h.symbol,
      days: LONG_TERM_DAYS + 1 - daysHeld(h.acquiredAt as string, input.today),
    }))
    .filter((h) => h.days > 0 && h.days <= APPROACHING_DAYS)
    .sort((a, b) => a.days - b.days);

  if (soon.length === 0) {
    return {
      id: 'approaching',
      label: 'Approaching long-term',
      status: 'resolved',
      detail: 'No position is within two months of the one-year line.',
      panel: 'approaching',
    };
  }
  const first = soon[0] as { symbol: string; days: number };
  const rest = soon.length - 1;
  return {
    id: 'approaching',
    label: 'Approaching long-term',
    status: 'attention',
    detail:
      rest === 0
        ? `${first.symbol} turns long-term in ${first.days} day${first.days === 1 ? '' : 's'}.`
        : `${first.symbol} turns long-term in ${first.days} days, and ${rest} other${rest === 1 ? '' : 's'} follow.`,
    panel: 'approaching',
  };
}

function lossesLine(input: DeskStatusInput): DeskLine {
  const known = input.holdings.filter((h) => h.costBasis !== null && h.costBasis > 0);
  if (known.length === 0) {
    return {
      id: 'losses',
      label: 'Losses available',
      status: 'unknown',
      detail: 'Needs cost basis before unrealized losses can be worked out.',
      panel: null,
    };
  }
  const losses = known
    .map((h) => h.value - (h.costBasis as number))
    .filter((gain) => gain < 0)
    .reduce((sum, gain) => sum + gain, 0);

  if (losses === 0) {
    return {
      id: 'losses',
      label: 'Losses available',
      status: 'resolved',
      detail: 'No positions are currently under water.',
      panel: 'losses',
    };
  }
  return {
    id: 'losses',
    label: 'Losses available',
    status: 'attention',
    detail: `${usd(Math.abs(losses))} of unrealized losses could offset gains if realized.`,
    panel: 'losses',
  };
}

function quarterlyLine(input: DeskStatusInput): DeskLine {
  if (!input.hasTaxProfile || !input.quarterly) {
    return {
      id: 'quarterly',
      label: 'Quarterly payments',
      status: 'not-started',
      detail: 'Needs your income to work out whether estimates are required.',
      panel: 'taxes',
    };
  }
  if (!input.quarterly.estimatesNeeded) {
    return {
      id: 'quarterly',
      label: 'Quarterly payments',
      status: 'resolved',
      detail: 'Withholding covers the safe harbour — no estimates required.',
      panel: 'taxes',
    };
  }
  const next = input.quarterly.deadlines.find((d) => !d.passed);
  return {
    id: 'quarterly',
    label: 'Quarterly payments',
    status: 'attention',
    detail: next
      ? `${usd(next.suggestedPayment)} due ${next.dueDate} to stay inside the safe harbour.`
      : `${usd(input.quarterly.shortfall)} short of the safe harbour, with no deadlines left this year.`,
    panel: 'taxes',
  };
}

function reconciliationLine(input: DeskStatusInput): DeskLine {
  if (!input.reconciliation) {
    return {
      id: 'reconcile',
      label: '1099 check',
      status: 'not-started',
      detail: `No 1099 uploaded for ${input.taxYear}.`,
      panel: null,
    };
  }
  const { matches, mismatches, missingHistory, notOn1099 } = input.reconciliation;
  if (mismatches === 0 && missingHistory === 0 && notOn1099 === 0) {
    return {
      id: 'reconcile',
      label: '1099 check',
      status: 'resolved',
      detail: `All ${matches} reported row${matches === 1 ? '' : 's'} agree with the ledger.`,
      panel: 'reconciliation',
    };
  }
  const problems: string[] = [];
  if (mismatches > 0) problems.push(`${mismatches} disagree`);
  if (missingHistory > 0) problems.push(`${missingHistory} without trade history`);
  if (notOn1099 > 0) problems.push(`${notOn1099} missing from the form`);
  return {
    id: 'reconcile',
    label: '1099 check',
    status: 'attention',
    detail: `${problems.join(', ')}.`,
    panel: 'reconciliation',
  };
}

export interface DeskStatus {
  taxYear: number;
  lines: DeskLine[];
  counts: Record<LineStatus, number>;
}

export function computeDeskStatus(input: DeskStatusInput): DeskStatus {
  const lines = [
    documentsLine(input),
    basisLine(input),
    tradesLine(input),
    washLine(input),
    approachingLine(input),
    windowLine(input),
    lossesLine(input),
    quarterlyLine(input),
    reconciliationLine(input),
  ];

  const counts: Record<LineStatus, number> = {
    resolved: 0,
    attention: 0,
    'not-started': 0,
    unknown: 0,
  };
  for (const line of lines) counts[line.status] += 1;

  return { taxYear: input.taxYear, lines, counts };
}
