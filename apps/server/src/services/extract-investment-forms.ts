// ─── C3 · The consolidated-1099 extraction job ─────────────────────
// Upload → Sonnet extraction against a typed schema → a stored
// investment_forms row → facts re-planned over the year's live forms, and
// the B rows swept into the trades table as document-sourced trades. The
// corrected-consolidated-in-March scenario is the whole design: the old
// form's trades are swept out with it, the ledger recomputes on read, and
// everything downstream re-runs from the corrected numbers.

import { and, eq, like } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { aiUsage, factAssertions, files, investmentForms, trades } from '../db/schema';
import type { FactAssertion } from '../lib/calc/filing/facts';
import { calculateCostCents } from '../routes/chat-stream';
import { structuredCompletion } from './anthropic';
import {
  type ExtractedInvestmentForms,
  INVESTMENT_FORM_FACT_IDS,
  type StoredInvestmentFormRow,
  liveInvestmentForms,
  planInvestmentFacts,
  tradesFromBRows,
} from './investment-form-facts';
import { JOB_TYPES, registerJobHandler } from './job-queue';
import { storage } from './storage';
import { extractText } from './text-extraction';

const INVESTMENT_MODEL = 'claude-sonnet-4-6';
const MAX_TEXT_CHARS = 60_000;

const extractedSchema = z.object({
  broker: z.string().min(1).nullable(),
  brokerTin: z.string().min(1).nullable(),
  corrected: z.boolean(),
  taxYear: z.number().int().min(2000).max(2100),
  div: z.object({ ordinary: z.number().nullable(), qualified: z.number().nullable() }).nullable(),
  int: z.object({ interest: z.number().nullable() }).nullable(),
  bRows: z.array(
    z.object({
      symbol: z.string().min(1),
      description: z.string().nullable(),
      quantity: z.number().nullable(),
      acquiredDate: z.string().nullable(),
      soldDate: z.string().nullable(),
      proceeds: z.number().nullable(),
      costBasis: z.number().nullable(),
      category: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).nullable(),
      washSaleDisallowed: z.number().nullable(),
    }),
  ),
});

const SYSTEM_PROMPT = `You extract a US consolidated 1099 (or standalone 1099-B, 1099-DIV, 1099-INT), given the text of an uploaded document.

Rules:
- Report every figure EXACTLY as printed. A blank, unreadable or absent box is null — never substitute zero, never reconcile one figure against another. If qualified dividends exceed ordinary dividends on the form, report both as printed.
- div.ordinary is 1099-DIV box 1a (total ordinary dividends); div.qualified is box 1b (qualified dividends). div is null when the document has no 1099-DIV section.
- int.interest is 1099-INT box 1. int is null when there is no 1099-INT section.
- bRows: one row per SALE LOT as listed in the 1099-B section — do NOT combine lots. quantity, proceeds, costBasis as printed (costBasis null when reported as unknown/not provided). acquiredDate and soldDate as ISO dates (yyyy-mm-dd); when the form prints VARIOUS or leaves the acquisition date blank, acquiredDate is null.
- category is the Form 8949 box for the section the row appears in: A (short-term, basis reported), B (short-term, basis not reported), C (short-term, not on a 1099-B), D (long-term, basis reported), E (long-term, basis not reported), F (long-term, not on a 1099-B); null if the form doesn't say.
- washSaleDisallowed is the wash-sale loss disallowed printed for that row, null if none shown.
- corrected is true only when the form is marked CORRECTED. brokerTin is the payer's TIN as printed. taxYear is the form's year.
- If the document has none of these sections, return null broker and brokerTin, null div and int, and an empty bRows array.`;

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    broker: { type: ['string', 'null'] },
    brokerTin: { type: ['string', 'null'] },
    corrected: { type: 'boolean' },
    taxYear: { type: 'number' },
    div: {
      type: ['object', 'null'],
      properties: {
        ordinary: { type: ['number', 'null'] },
        qualified: { type: ['number', 'null'] },
      },
      required: ['ordinary', 'qualified'],
    },
    int: {
      type: ['object', 'null'],
      properties: { interest: { type: ['number', 'null'] } },
      required: ['interest'],
    },
    bRows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          description: { type: ['string', 'null'] },
          quantity: { type: ['number', 'null'] },
          acquiredDate: { type: ['string', 'null'] },
          soldDate: { type: ['string', 'null'] },
          proceeds: { type: ['number', 'null'] },
          costBasis: { type: ['number', 'null'] },
          category: { type: ['string', 'null'], enum: ['A', 'B', 'C', 'D', 'E', 'F', null] },
          washSaleDisallowed: { type: ['number', 'null'] },
        },
        required: [
          'symbol',
          'description',
          'quantity',
          'acquiredDate',
          'soldDate',
          'proceeds',
          'costBasis',
          'category',
          'washSaleDisallowed',
        ],
      },
    },
  },
  required: ['broker', 'brokerTin', 'corrected', 'taxYear', 'div', 'int', 'bRows'],
};

type AssertionRow = typeof factAssertions.$inferSelect;

const toAssertion = (r: AssertionRow): FactAssertion => ({
  assertionId: r.assertionId,
  factId: r.factId as FactAssertion['factId'],
  taxYear: r.taxYear,
  value: JSON.parse(r.value),
  source: JSON.parse(r.source),
  assertedAt: r.assertedAt,
  supersedes: r.supersedes,
});

async function loadPrevLive(
  db: DB,
  workspaceId: string,
  userId: string,
  taxYear: number,
): Promise<FactAssertion[]> {
  const rows = await db
    .select()
    .from(factAssertions)
    .where(
      and(
        eq(factAssertions.workspaceId, workspaceId),
        eq(factAssertions.userId, userId),
        eq(factAssertions.taxYear, taxYear),
      ),
    );
  const superseded = new Set(rows.map((r) => r.supersedes).filter((v): v is string => v !== null));
  return rows
    .filter((r) => !superseded.has(r.assertionId))
    .filter((r) => (INVESTMENT_FORM_FACT_IDS as string[]).includes(r.factId))
    .map(toAssertion)
    .filter((a) => a.source.kind === 'document');
}

/**
 * Recompute the year's investment facts and document trades from its stored
 * forms. Trades belonging to forms that are no longer live (a corrected
 * consolidated arrived, a file was deleted) are swept; the ledger reads
 * trades live, so everything downstream recomputes on the next read.
 */
export async function replanInvestmentForms(
  db: DB,
  workspaceId: string,
  userId: string,
  taxYear: number,
  triggeringFileId: string,
): Promise<{ facts: number; tradesInserted: number; tradesSkipped: number }> {
  const stored = await db
    .select()
    .from(investmentForms)
    .where(
      and(
        eq(investmentForms.workspaceId, workspaceId),
        eq(investmentForms.userId, userId),
        eq(investmentForms.taxYear, taxYear),
      ),
    );
  const rows: StoredInvestmentFormRow[] = stored.map((r) => ({
    fileId: r.fileId,
    brokerTin: r.brokerTin,
    corrected: r.corrected,
    createdAt: r.createdAt.getTime(),
    extracted: JSON.parse(r.payload) as ExtractedInvestmentForms,
  }));
  const live = liveInvestmentForms(rows);
  const liveFileIds = new Set(live.map((r) => r.fileId));

  // Sweep document trades that belong to superseded or deleted forms.
  const docTrades = await db
    .select({ id: trades.id, externalId: trades.externalId })
    .from(trades)
    .where(and(eq(trades.workspaceId, workspaceId), like(trades.externalId, '1099b:%')));
  for (const t of docTrades) {
    const fileId = t.externalId?.split(':')[1];
    if (fileId !== undefined && !liveFileIds.has(fileId)) {
      await db.delete(trades).where(eq(trades.id, t.id));
    }
  }

  // Facts from the live totals.
  const prevLive = await loadPrevLive(db, workspaceId, userId, taxYear);
  const plan = planInvestmentFacts({
    live,
    prevLive,
    taxYear,
    triggeringFileId,
    nowIso: new Date().toISOString(),
  });
  const now = new Date();
  for (const assertion of plan) {
    await db
      .insert(factAssertions)
      .values({
        assertionId: assertion.assertionId,
        workspaceId,
        userId,
        factId: assertion.factId,
        taxYear: assertion.taxYear,
        value: JSON.stringify(assertion.value),
        source: JSON.stringify(assertion.source),
        assertedAt: assertion.assertedAt,
        supersedes: assertion.supersedes,
        createdAt: now,
      })
      .onConflictDoNothing();
  }

  // Trades from the live B rows, deduped against everything already known.
  const existing = await db
    .select({
      symbol: trades.symbol,
      side: trades.side,
      tradeDate: trades.tradeDate,
      units: trades.units,
      price: trades.price,
      externalId: trades.externalId,
    })
    .from(trades)
    .where(eq(trades.workspaceId, workspaceId));

  let inserted = 0;
  let skipped = 0;
  for (const form of live) {
    const derivation = tradesFromBRows(form.fileId, form.extracted.bRows, existing);
    skipped += derivation.skipped.length;
    for (const s of derivation.skipped) {
      if (s.proceedsDelta !== null && s.proceedsDelta > 1) {
        console.log(
          `[1099-B] ${s.symbol} ${s.soldDate}: broker proceeds differ from the recorded trade by $${s.proceedsDelta.toFixed(2)} — kept the recorded trade; the reconciliation check surfaces the totals`,
        );
      }
    }
    for (const t of derivation.insert) {
      await db
        .insert(trades)
        .values({
          id: crypto.randomUUID(),
          workspaceId,
          userId,
          symbol: t.symbol,
          side: t.side,
          tradeDate: t.tradeDate,
          units: t.units,
          price: t.price,
          fees: t.fees,
          source: t.source,
          externalId: t.externalId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
      inserted += 1;
    }
  }

  return { facts: plan.length, tradesInserted: inserted, tradesSkipped: skipped };
}

export async function extractInvestmentFormsJob(payload: unknown, db: DB): Promise<void> {
  const fileId = (payload as { fileId?: unknown })?.fileId;
  if (typeof fileId !== 'string' || fileId.length === 0) {
    throw new Error('extract-investment-forms payload requires a fileId string');
  }

  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) return; // deleted before the job ran

  const buffer = await storage.get(file.storagePath);
  const text = await extractText(buffer, file.mimeType);
  if (!text || text.trim().length === 0) {
    throw new Error('investment form has no extractable text');
  }

  const response = await structuredCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Extract the 1099 sections from this document (file: ${file.fileName}):\n\n${text.slice(0, MAX_TEXT_CHARS)}`,
    outputSchema: OUTPUT_SCHEMA,
    toolName: 'report_investment_forms',
    model: INVESTMENT_MODEL,
    maxTokens: 8192,
  });

  const parsed = extractedSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error(`investment form extraction failed validation: ${parsed.error.message}`);
  }
  const extracted = parsed.data;

  if (extracted.div === null && extracted.int === null && extracted.bRows.length === 0) {
    console.log(`[1099] ${file.fileName}: no 1099-B/DIV/INT sections — nothing extracted`);
    return;
  }

  const now = new Date();
  const [existing] = await db
    .select({ id: investmentForms.id })
    .from(investmentForms)
    .where(eq(investmentForms.fileId, fileId));
  if (existing) {
    await db
      .update(investmentForms)
      .set({
        taxYear: extracted.taxYear,
        broker: extracted.broker,
        brokerTin: extracted.brokerTin,
        corrected: extracted.corrected,
        payload: JSON.stringify(extracted),
        updatedAt: now,
      })
      .where(eq(investmentForms.id, existing.id));
  } else {
    await db.insert(investmentForms).values({
      id: crypto.randomUUID(),
      workspaceId: file.workspaceId,
      userId: file.userId,
      fileId,
      taxYear: extracted.taxYear,
      broker: extracted.broker,
      brokerTin: extracted.brokerTin,
      corrected: extracted.corrected,
      payload: JSON.stringify(extracted),
      createdAt: now,
      updatedAt: now,
    });
  }

  const result = await replanInvestmentForms(
    db,
    file.workspaceId,
    file.userId,
    extracted.taxYear,
    fileId,
  );

  await db.insert(aiUsage).values({
    id: crypto.randomUUID(),
    userId: file.userId,
    conversationId: null,
    model: INVESTMENT_MODEL,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    costCents: calculateCostCents(INVESTMENT_MODEL, response.inputTokens, response.outputTokens),
    createdAt: now,
  });

  console.log(
    `[1099] ${file.fileName}: broker=${extracted.broker ?? '?'} year=${extracted.taxYear} corrected=${extracted.corrected} — ${result.facts} fact(s), ${result.tradesInserted} trade(s), ${result.tradesSkipped} deduped`,
  );
}

/** Call once at boot to attach the handler to the job queue. */
export function registerExtractInvestmentFormsHandler(): void {
  registerJobHandler(JOB_TYPES.extractInvestmentForms, extractInvestmentFormsJob);
}
