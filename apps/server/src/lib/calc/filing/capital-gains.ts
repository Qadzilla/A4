// ─── D5 · Capital gains wiring (Form 8949 / Schedule D) ────────────
// The one determination that mostly existed — lots.ts computes it —
// rebuilt on the fact model so its numbers carry provenance like
// everything else. The fence, verbatim from the contract: NO new lot
// logic. The lot engine's existing behaviour is the spec; divergence is
// a bug here, not there. No options, futures, or §1256 contracts —
// named out of scope.
//
// Authority: Form 8949 / Schedule D instructions (the category boxes:
// A/B/C short-term, D/E/F long-term — covered, noncovered, and not on a
// 1099-B at all); Pub 550 (FIFO default, more-than-one-year, the wash
// rule the engine already carries).
//
// What D5 adds:
//  - Realized totals become RULE-SOURCED FACT ASSERTIONS (Doctrine 5)
//    that supersede any live person estimate of the same fact — the
//    ledger's number replaces the guess, visibly, never a contradiction.
//  - Every reported sale becomes an 8949 row with its category box and
//    its provenance: a document row names its file (the chain an
//    examiner would walk), a synced trade names its source, and a
//    person-asserted crypto disposal says so — category C/F, no broker
//    document, because none exists.
//  - The category derivation is CP2000 prevention by construction: a
//    broker-printed box is kept as printed; a document row without one
//    derives from what the form reported (basis known → covered A/D,
//    basis absent → B/E); a synced trade waits for its 1099-B rather
//    than guessing what the broker will tell the IRS.
//  - Crypto (the no-form path): person-asserted proceeds and basis make
//    a row with person provenance. Missing basis counts the whole
//    proceeds as gain — priced, never imputed. Unknown holding period
//    defaults SHORT (the higher-tax reading, like gross-over-taxable)
//    and surfaces as a fork-able missing fact.

import { type LotTrade, computeRealizedGains } from '../lots';
import { type FactAssertion, type FactId, factSet, factState, makeAssertion } from './facts';
import type { RuleTrace } from './trace';

export type Form8949Category = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface CapitalGainsTrade extends LotTrade {
  source: 'document' | 'snaptrade' | 'manual';
  /** Broker-printed 8949 box on the stored 1099-B row, when it had one. */
  category?: Form8949Category | null;
  /** The stored form a document trade came from — the provenance chain. */
  fileId?: string | null;
}

export interface Form8949Row {
  category: Form8949Category | null;
  /** Present exactly when the category was derived or left open, not printed. */
  categoryNote: string | null;
  symbol: string;
  term: 'short' | 'long';
  acquiredAt: string | null;
  soldDate: string;
  proceeds: number;
  /** Null when no basis history exists — reported, never imputed. */
  basis: number | null;
  gain: number;
  washDisallowed: number;
  uncoveredUnits: number;
  provenance:
    | {
        kind: 'trade';
        source: 'document' | 'snaptrade' | 'manual';
        tradeId: string;
        fileId: string | null;
      }
    | { kind: 'person'; facts: FactId[] };
}

export interface CapitalGainsDetermination {
  status: 'computed' | 'none';
  /** Totals including crypto, wash-adjusted — what the estimator runs on. */
  shortTerm: number;
  longTerm: number;
  washDisallowed: number;
  uncoveredUnits: number;
  rows: Form8949Row[];
  crypto: { gain: number; term: 'short' | 'long'; basisKnown: boolean } | null;
  /**
   * The totals as rule-sourced assertions (Doctrine 5), superseding any
   * live estimate of the same fact — feed these back into the fact set
   * and the estimator, the kiddie guard and B1 all read the ledger's
   * number with the chain intact.
   */
  facts: FactAssertion[];
  /** Fact ids whose person estimates the computed totals replaced. */
  supersededEstimates: FactId[];
  missingFacts: FactId[];
  explanation: RuleTrace;
  consumed: FactId[];
}

const CITE =
  'Form 8949 / Schedule D instructions (category boxes A–F); Pub 550 (FIFO, holding period, wash sales)';

const CATEGORY_PENDING_NOTE =
  "Category box assigned when the broker's 1099-B arrives — guessing what the broker reports to the IRS is how mismatch letters start.";

export function determineCapitalGains(
  assertions: FactAssertion[],
  trades: CapitalGainsTrade[],
  taxYear: number,
): CapitalGainsDetermination {
  const set = factSet(assertions, taxYear);
  const consumed: FactId[] = [];
  const notes: string[] = [];
  const missing: FactId[] = [];

  const num = (id: FactId): number | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'number' ? s.value.value : null;
  };
  const bool = (id: FactId): boolean | null => {
    if (!consumed.includes(id)) consumed.push(id);
    const s = factState(set, id);
    return s.status === 'known' && s.value.kind === 'bool' ? s.value.value : null;
  };

  const cryptoProceeds = num('crypto-proceeds');

  const finish = (
    partial: Partial<CapitalGainsDetermination> & { status: CapitalGainsDetermination['status'] },
  ): CapitalGainsDetermination => ({
    shortTerm: 0,
    longTerm: 0,
    washDisallowed: 0,
    uncoveredUnits: 0,
    rows: [],
    crypto: null,
    facts: [],
    supersededEstimates: [],
    missingFacts: [],
    explanation: {
      ruleId: 'capital-gains/8949',
      citation: CITE,
      steps: [
        { label: 'Tax year', value: taxYear },
        { label: 'Status', value: partial.status },
      ],
      notes,
    },
    consumed,
    ...partial,
  });

  if (trades.length === 0 && (cryptoProceeds === null || cryptoProceeds <= 0)) {
    return finish({ status: 'none' });
  }

  // ── The lot engine, unchanged — its output is the spec ──
  const summary = computeRealizedGains(trades, taxYear);
  const byId = new Map(trades.map((t) => [t.id, t]));

  const rows: Form8949Row[] = summary.sales.map((sale) => {
    const trade = byId.get(sale.tradeId);
    const source = trade?.source ?? 'manual';
    const fullyUncovered = sale.units <= 0 && sale.uncoveredUnits > 0;

    // The category ladder: printed wins; a document row derives from what
    // the form reported; a synced or manual trade waits for the form.
    let category: Form8949Category | null = null;
    let categoryNote: string | null = null;
    const printed = trade?.category ?? null;
    if (printed !== null) {
      category = printed;
    } else if (source === 'document') {
      const basisReported = !fullyUncovered && sale.uncoveredUnits <= 0;
      category = sale.term === 'long' ? (basisReported ? 'D' : 'E') : basisReported ? 'A' : 'B';
      categoryNote = basisReported
        ? 'Derived: the form reported basis, so the covered box.'
        : 'Derived: basis missing on the form, so the noncovered box — the gain here is only over units with known basis.';
    } else {
      categoryNote = CATEGORY_PENDING_NOTE;
    }

    // A fully-uncovered sale still shows its printed proceeds — the gain is
    // honestly zero (nothing matched), and the row says why.
    const proceeds =
      fullyUncovered && trade !== undefined
        ? trade.units * trade.price - trade.fees
        : sale.proceeds;

    return {
      category,
      categoryNote,
      symbol: sale.symbol,
      term: sale.term,
      acquiredAt: sale.acquiredAt,
      soldDate: sale.saleDate,
      proceeds,
      basis: fullyUncovered ? null : sale.basis,
      gain: sale.gain,
      washDisallowed: sale.washDisallowed,
      uncoveredUnits: sale.uncoveredUnits,
      provenance: {
        kind: 'trade',
        source,
        tradeId: sale.tradeId,
        fileId: trade?.fileId ?? null,
      },
    };
  });

  const pendingBoxes = rows.filter((r) => r.categoryNote === CATEGORY_PENDING_NOTE).length;
  if (pendingBoxes > 0) {
    notes.push(`${pendingBoxes} sale(s) have no 8949 box yet. ${CATEGORY_PENDING_NOTE}`);
  }
  if (summary.uncoveredUnits > 0) {
    notes.push(
      `${summary.uncoveredUnits} sold unit(s) have no purchase history on file — their gain is NOT guessed (transferred-in shares are the usual cause). The broker's statement or the original account has the missing lots; every one found makes the totals real.`,
    );
  }
  if (summary.washDisallowed > 0) {
    notes.push(
      `$${Math.round(summary.washDisallowed)} of losses are wash-disallowed — replacement shares bought within 30 days. The loss isn't gone: it lives in the replacement lot's basis and returns when that lot sells clean.`,
    );
  }

  // ── Crypto: the no-form path, person-asserted (C3 intake) ──
  let cryptoShort = 0;
  let cryptoLong = 0;
  let crypto: CapitalGainsDetermination['crypto'] = null;
  if (cryptoProceeds !== null && cryptoProceeds > 0) {
    const basis = num('crypto-cost-basis');
    if (basis === null) {
      missing.push('crypto-cost-basis');
      notes.push(
        `No cost basis on file for the crypto sold: the whole $${cryptoProceeds} counts as gain until the basis is found — exchange history usually has it, and every dollar of basis is a dollar less of gain.`,
      );
    }
    const held = bool('crypto-held-over-year');
    if (held === null) {
      missing.push('crypto-held-over-year');
      notes.push(
        'Whether the crypto was held over a year is unresolved — the gain computes SHORT-term (the higher-tax reading) until answered. One question, and it may move to the long-term rates.',
      );
    }
    const gain = cryptoProceeds - (basis ?? 0);
    const term: 'short' | 'long' = held === true ? 'long' : 'short';
    if (term === 'long') cryptoLong += gain;
    else cryptoShort += gain;
    crypto = { gain, term, basisKnown: basis !== null };
    rows.push({
      // C/F: not reported on a 1099-B — because no form exists for this.
      category: term === 'long' ? 'F' : 'C',
      categoryNote: null,
      symbol: 'DIGITAL ASSETS',
      term,
      acquiredAt: null,
      soldDate: `${taxYear}-12-31`,
      proceeds: cryptoProceeds,
      basis,
      gain,
      washDisallowed: 0,
      uncoveredUnits: 0,
      provenance: {
        kind: 'person',
        facts:
          held === null
            ? ['crypto-proceeds', 'crypto-cost-basis', 'crypto-held-over-year']
            : ['crypto-proceeds', 'crypto-cost-basis'],
      },
    });
  }

  const shortTerm = summary.shortTermGain + cryptoShort;
  const longTerm = summary.longTermGain + cryptoLong;

  // ── The totals become rule-sourced facts (Doctrine 5) ──
  // Superseding every live prior assertion of the same fact: the computed
  // number replaces the estimate visibly — corroboration when they agree,
  // replacement when they don't, never a contradiction.
  const facts: FactAssertion[] = [];
  const supersededEstimates: FactId[] = [];
  const emit = (factId: FactId, value: number) => {
    const state = factState(set, factId);
    const prior = 'assertions' in state ? state.assertions : [];
    if (prior.length > 0) supersededEstimates.push(factId);
    const targets: Array<string | null> =
      prior.length > 0 ? prior.map((a) => a.assertionId) : [null];
    targets.forEach((supersedes, i) => {
      facts.push(
        makeAssertion({
          assertionId: `cg:${factId}:${taxYear}:${i}`,
          factId,
          taxYear,
          value: { kind: 'number', value },
          source: {
            kind: 'rule',
            ruleId: 'capital-gains/8949',
            consumed: crypto !== null ? consumed : [],
          },
          assertedAt: '9999-12-28T00:00:00Z',
          supersedes,
        } as Parameters<typeof makeAssertion>[0]),
      );
    });
  };
  emit('realized-short-gains', shortTerm);
  emit('realized-long-gains', longTerm);
  for (const factId of supersededEstimates) {
    const state = factState(set, factId);
    const priorValue =
      state.status === 'known' && state.value.kind === 'number' ? state.value.value : null;
    const computed = factId === 'realized-short-gains' ? shortTerm : longTerm;
    if (priorValue !== null && Math.round(priorValue) !== Math.round(computed)) {
      notes.push(
        `The trade ledger computes $${Math.round(computed)} of ${factId === 'realized-short-gains' ? 'short' : 'long'}-term gains where $${Math.round(priorValue)} was estimated — the ledger's number supersedes the estimate, and the difference is visible in the chain.`,
      );
    }
  }

  return finish({
    status: 'computed',
    shortTerm,
    longTerm,
    washDisallowed: summary.washDisallowed,
    uncoveredUnits: summary.uncoveredUnits,
    rows,
    crypto,
    facts,
    supersededEstimates,
    missingFacts: missing,
  });
}
