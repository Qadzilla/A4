// ─── C2 · The 1099-NEC / 1099-K extraction job ─────────────────────
// Upload → Sonnet extraction against a typed schema → a stored income_forms
// row → fact assertions recomputed over the year's live rows
// (income-form-facts.ts). Same pipeline as the W-2; the special care here
// is the K form: box 1a is gross receipts, not income, and the prompt and
// provenance both say so at every step.

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { aiUsage, factAssertions, files, incomeForms } from '../db/schema';
import type { FactAssertion } from '../lib/calc/filing/facts';
import { calculateCostCents } from '../routes/chat-stream';
import { structuredCompletion } from './anthropic';
import {
  type ExtractedIncomeForm,
  INCOME_FORM_FACT_IDS,
  type StoredIncomeFormRow,
  liveIncomeFormRows,
  planIncomeFormFacts,
} from './income-form-facts';
import { JOB_TYPES, registerJobHandler } from './job-queue';
import { storage } from './storage';
import { extractText } from './text-extraction';

const INCOME_FORM_MODEL = 'claude-sonnet-4-6';
const MAX_TEXT_CHARS = 40_000;

const extractedIncomeFormSchema = z.object({
  kind: z.enum(['1099-NEC', '1099-K', 'other']),
  payerName: z.string().min(1).nullable(),
  payerTin: z.string().min(1).nullable(),
  corrected: z.boolean(),
  taxYear: z.number().int().min(2000).max(2100),
  nec: z.object({ box1: z.number().nullable(), box4: z.number().nullable() }).nullable(),
  k: z
    .object({
      box1a: z.number().nullable(),
      box4: z.number().nullable(),
      transactionCount: z.number().nullable(),
    })
    .nullable(),
});

const SYSTEM_PROMPT = `You extract the boxes from a US Form 1099-NEC (Nonemployee Compensation) or Form 1099-K (Payment Card and Third Party Network Transactions), given the text of an uploaded document.

Rules:
- kind is "1099-NEC" or "1099-K" from the form's own title. If the document is neither, kind is "other" and every other field is null.
- Report every box EXACTLY as printed. A box that is blank, unreadable, or absent is null. Never substitute zero for a blank — zero is a printed value, null is the absence of one.
- For a 1099-NEC: nec.box1 is box 1 (nonemployee compensation); nec.box4 is box 4 (federal income tax withheld). k is null.
- For a 1099-K: k.box1a is box 1a (gross amount of payment transactions) — this is GROSS receipts, not income; report it as printed and nothing else. k.box4 is box 4 (federal income tax withheld). k.transactionCount is box 3 (number of payment transactions). nec is null.
- corrected is true only when the CORRECTED checkbox is marked.
- payerTin is the payer's TIN as printed, with its hyphen. taxYear is the form's year.`;

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    kind: { type: 'string', enum: ['1099-NEC', '1099-K', 'other'] },
    payerName: { type: ['string', 'null'] },
    payerTin: { type: ['string', 'null'] },
    corrected: { type: 'boolean' },
    taxYear: { type: 'number' },
    nec: {
      type: ['object', 'null'],
      properties: { box1: { type: ['number', 'null'] }, box4: { type: ['number', 'null'] } },
      required: ['box1', 'box4'],
    },
    k: {
      type: ['object', 'null'],
      properties: {
        box1a: { type: ['number', 'null'] },
        box4: { type: ['number', 'null'] },
        transactionCount: { type: ['number', 'null'] },
      },
      required: ['box1a', 'box4', 'transactionCount'],
    },
  },
  required: ['kind', 'payerName', 'payerTin', 'corrected', 'taxYear', 'nec', 'k'],
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

/**
 * Live assertions for this planner's facts, split by who asserted them:
 * document-sourced rows are the planner's own to supersede; person-sourced
 * estimates of the shared facts are the floor rule's input and are only
 * ever superseded, never wiped.
 */
async function loadLiveAssertions(
  db: DB,
  workspaceId: string,
  userId: string,
  taxYear: number,
): Promise<{ prevLive: FactAssertion[]; personLive: FactAssertion[] }> {
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
  const live = rows
    .filter((r) => !superseded.has(r.assertionId))
    .filter((r) => (INCOME_FORM_FACT_IDS as string[]).includes(r.factId))
    .map(toAssertion);
  return {
    prevLive: live.filter((a) => a.source.kind === 'document'),
    personLive: live.filter((a) => a.source.kind === 'person'),
  };
}

/** Recompute and write the year's income-form facts from its stored rows. */
export async function replanIncomeFormFacts(
  db: DB,
  workspaceId: string,
  userId: string,
  taxYear: number,
  triggeringFileId: string,
): Promise<number> {
  const stored = await db
    .select()
    .from(incomeForms)
    .where(
      and(
        eq(incomeForms.workspaceId, workspaceId),
        eq(incomeForms.userId, userId),
        eq(incomeForms.taxYear, taxYear),
      ),
    );
  const rows: StoredIncomeFormRow[] = stored.map((r) => ({
    fileId: r.fileId,
    kind: r.kind as StoredIncomeFormRow['kind'],
    payerTin: r.payerTin,
    corrected: r.corrected,
    createdAt: r.createdAt.getTime(),
    extracted: JSON.parse(r.payload) as ExtractedIncomeForm,
  }));

  const { prevLive, personLive } = await loadLiveAssertions(db, workspaceId, userId, taxYear);
  const plan = planIncomeFormFacts({
    live: liveIncomeFormRows(rows),
    prevLive,
    personLive,
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
  return plan.length;
}

export async function extractIncomeFormJob(payload: unknown, db: DB): Promise<void> {
  const fileId = (payload as { fileId?: unknown })?.fileId;
  if (typeof fileId !== 'string' || fileId.length === 0) {
    throw new Error('extract-income-form payload requires a fileId string');
  }

  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) return; // deleted before the job ran

  const buffer = await storage.get(file.storagePath);
  const text = await extractText(buffer, file.mimeType);
  if (!text || text.trim().length === 0) {
    throw new Error('income form has no extractable text');
  }

  const response = await structuredCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Extract the boxes from this form (file: ${file.fileName}):\n\n${text.slice(0, MAX_TEXT_CHARS)}`,
    outputSchema: OUTPUT_SCHEMA,
    toolName: 'report_income_form',
    model: INCOME_FORM_MODEL,
    maxTokens: 2048,
  });

  const parsed = extractedIncomeFormSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error(`income form extraction failed validation: ${parsed.error.message}`);
  }
  const extracted = parsed.data;

  if (extracted.kind === 'other') {
    console.log(`[1099] ${file.fileName}: not a 1099-NEC or 1099-K — nothing extracted`);
    return;
  }

  const now = new Date();
  const [existing] = await db
    .select({ id: incomeForms.id })
    .from(incomeForms)
    .where(eq(incomeForms.fileId, fileId));
  if (existing) {
    await db
      .update(incomeForms)
      .set({
        kind: extracted.kind,
        taxYear: extracted.taxYear,
        payerName: extracted.payerName,
        payerTin: extracted.payerTin,
        corrected: extracted.corrected,
        payload: JSON.stringify(extracted),
        updatedAt: now,
      })
      .where(eq(incomeForms.id, existing.id));
  } else {
    await db.insert(incomeForms).values({
      id: crypto.randomUUID(),
      workspaceId: file.workspaceId,
      userId: file.userId,
      fileId,
      kind: extracted.kind,
      taxYear: extracted.taxYear,
      payerName: extracted.payerName,
      payerTin: extracted.payerTin,
      corrected: extracted.corrected,
      payload: JSON.stringify(extracted),
      createdAt: now,
      updatedAt: now,
    });
  }

  const asserted = await replanIncomeFormFacts(
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
    model: INCOME_FORM_MODEL,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    costCents: calculateCostCents(INCOME_FORM_MODEL, response.inputTokens, response.outputTokens),
    createdAt: now,
  });

  console.log(
    `[1099] ${file.fileName}: ${extracted.kind} payer=${extracted.payerName ?? '?'} year=${extracted.taxYear} corrected=${extracted.corrected} — ${asserted} fact assertion(s)`,
  );
}

/** Call once at boot to attach the handler to the job queue. */
export function registerExtractIncomeFormHandler(): void {
  registerJobHandler(JOB_TYPES.extractIncomeForm, extractIncomeFormJob);
}
