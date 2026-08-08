// ─── G2 · One year, assembled from the desk ────────────────────────
// The filing engine is pure: it takes assertions, arrived documents and
// a couple of tables it cannot infer (a 1095-A's monthly grid, the trade
// ledger), and returns a determination. This is the one place that goes
// to the database for all four, so the intake router and the AI's tools
// are looking at the same year rather than each assembling their own
// slightly different version of it.
//
// It also closes a real gap. G1's router passed an empty document list,
// which meant readiness announced "the W-2 was due by January 31 and
// isn't on file" to someone who had uploaded their W-2 twenty minutes
// earlier. Expectations only mean anything against what actually
// arrived.

import { and, eq } from 'drizzle-orm';
import type { DB } from '../db';
import {
  benefitForms,
  educationHealthForms,
  incomeForms,
  investmentForms,
  trades,
  w2Forms,
} from '../db/schema';
import type { AbsenceBoard } from '../lib/calc/filing/board';
import { absenceBoard } from '../lib/calc/filing/board';
import type { CapitalGainsTrade } from '../lib/calc/filing/capital-gains';
import type { EvaluationExtras, YearEvaluation } from '../lib/calc/filing/evaluation';
import { evaluateYear } from '../lib/calc/filing/evaluation';
import type { FactAssertion } from '../lib/calc/filing/facts';
import type { PtcMonth } from '../lib/calc/filing/ptc';
import type { Readiness } from '../lib/calc/filing/readiness';
import { assessReadiness } from '../lib/calc/filing/readiness';
import type { ArrivedDoc, DocumentKind } from '../lib/calc/filing/requirements';
import type { ExtractedBenefitForm } from './benefit-form-facts';
import type { ExtractedEducationHealthForm } from './education-health-facts';
import { type FactScopeKeys, loadFacts } from './facts';
import type { ExtractedIncomeForm } from './income-form-facts';
import type { ExtractedInvestmentForms } from './investment-form-facts';

export interface FilingYearInputs {
  assertions: FactAssertion[];
  docs: ArrivedDoc[];
  extras: EvaluationExtras;
}

/**
 * Everything the engine needs for one year, read once.
 *
 * Document rows carry their own tax year, and a 2026 W-2 satisfies
 * nothing about 2025 — so the year travels with each arrival rather than
 * being assumed from the query.
 */
export async function loadFilingYear(
  db: DB,
  keys: FactScopeKeys,
  taxYear: number,
): Promise<FilingYearInputs> {
  const scope = [eq(w2Forms.workspaceId, keys.workspaceId), eq(w2Forms.userId, keys.userId)];

  const [assertions, w2Rows, incomeRows, investmentRows, eduRows, benefitRows, tradeRows] =
    await Promise.all([
      loadFacts(db, keys),
      db
        .select()
        .from(w2Forms)
        .where(and(...scope)),
      db
        .select()
        .from(incomeForms)
        .where(
          and(eq(incomeForms.workspaceId, keys.workspaceId), eq(incomeForms.userId, keys.userId)),
        ),
      db
        .select()
        .from(investmentForms)
        .where(
          and(
            eq(investmentForms.workspaceId, keys.workspaceId),
            eq(investmentForms.userId, keys.userId),
          ),
        ),
      db
        .select()
        .from(educationHealthForms)
        .where(
          and(
            eq(educationHealthForms.workspaceId, keys.workspaceId),
            eq(educationHealthForms.userId, keys.userId),
          ),
        ),
      db
        .select()
        .from(benefitForms)
        .where(
          and(eq(benefitForms.workspaceId, keys.workspaceId), eq(benefitForms.userId, keys.userId)),
        ),
      db
        .select()
        .from(trades)
        .where(and(eq(trades.workspaceId, keys.workspaceId), eq(trades.userId, keys.userId))),
    ]);

  const docs: ArrivedDoc[] = [];
  const add = (kind: DocumentKind, fileId: string, year: number) =>
    docs.push({ kind, fileId, taxYear: year });

  for (const row of w2Rows) add('W-2', row.fileId, row.taxYear);
  for (const row of incomeRows) {
    const payload = safeParse<ExtractedIncomeForm>(row.payload);
    add((payload?.kind ?? '1099-NEC') as DocumentKind, row.fileId, row.taxYear);
  }
  for (const row of benefitRows) {
    const payload = safeParse<ExtractedBenefitForm>(row.payload);
    add((payload?.kind ?? '1099-R') as DocumentKind, row.fileId, row.taxYear);
  }
  for (const row of eduRows) {
    const payload = safeParse<ExtractedEducationHealthForm>(row.payload);
    add((payload?.kind ?? '1098-T') as DocumentKind, row.fileId, row.taxYear);
  }
  // A consolidated 1099 is several documents in one envelope, and each
  // section satisfies a different expectation. Splitting it is the only
  // way "the 1099-INT never came" stays true when the 1099-DIV did.
  for (const row of investmentRows) {
    const payload = safeParse<ExtractedInvestmentForms>(row.payload);
    if (payload?.div) add('1099-DIV', row.fileId, row.taxYear);
    if (payload?.int) add('1099-INT', row.fileId, row.taxYear);
    if (payload?.bRows && payload.bRows.length > 0) add('1099-B', row.fileId, row.taxYear);
  }

  // The 1095-A's monthly grid: a table, not a fact, so it is handed in.
  const ptcMonths: PtcMonth[] = [];
  for (const row of eduRows) {
    if (row.taxYear !== taxYear) continue;
    const payload = safeParse<ExtractedEducationHealthForm>(row.payload);
    if (payload?.kind !== '1095-A' || !payload.a1095) continue;
    for (const month of payload.a1095.months) {
      ptcMonths.push({
        month: month.month,
        premium: month.premium,
        slcsp: month.slcsp,
        aptc: month.aptc,
      });
    }
  }

  const ledger: CapitalGainsTrade[] = tradeRows.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    side: t.side as 'buy' | 'sell',
    tradeDate: t.tradeDate,
    units: t.units,
    price: t.price,
    fees: t.fees,
    source:
      t.source === 'snaptrade' ? 'snaptrade' : t.source === 'document' ? 'document' : 'manual',
  }));

  return {
    assertions,
    docs,
    extras: {
      ...(ptcMonths.length > 0 ? { ptcMonths } : {}),
      ...(ledger.length > 0 ? { trades: ledger } : {}),
    },
  };
}

function safeParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** G4's board over the real year — what should exist, and what hasn't. */
export async function absenceBoardFor(
  db: DB,
  keys: FactScopeKeys,
  taxYear: number,
  today: Date = new Date(),
): Promise<AbsenceBoard> {
  const year = await loadFilingYear(db, keys, taxYear);
  return absenceBoard(year.assertions, year.docs, taxYear, today);
}

/** A6's verdict over the real year. `today` injectable, as everywhere else. */
export async function readinessFor(
  db: DB,
  keys: FactScopeKeys,
  taxYear: number,
  today: Date = new Date(),
): Promise<Readiness> {
  const year = await loadFilingYear(db, keys, taxYear);
  return assessReadiness(year.assertions, year.docs, taxYear, today, year.extras);
}

/** The full determination for a year — what every trace is read off. */
export async function evaluationFor(
  db: DB,
  keys: FactScopeKeys,
  taxYear: number,
): Promise<YearEvaluation> {
  const year = await loadFilingYear(db, keys, taxYear);
  return evaluateYear(year.assertions, taxYear, year.extras);
}
