// ─── C5 · The 1099-R / 1099-G / W-2G extraction job ────────────────
// Upload → Sonnet extraction against a typed schema → a stored
// benefit_forms row → facts re-planned over the year's live rows
// (benefit-form-facts.ts). Box 7 is the whole story on a 1099-R, so the
// prompt defends it hardest: codes as printed, never inferred from
// context, and absent means absent.

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { aiUsage, benefitForms, factAssertions, files } from '../db/schema';
import type { FactAssertion } from '../lib/calc/filing/facts';
import { calculateCostCents } from '../routes/chat-stream';
import { structuredCompletion } from './anthropic';
import {
  BENEFIT_FACT_IDS,
  type ExtractedBenefitForm,
  type StoredBenefitFormRow,
  liveBenefitFormRows,
  planBenefitFacts,
} from './benefit-form-facts';
import { JOB_TYPES, registerJobHandler } from './job-queue';
import { storage } from './storage';
import { extractText } from './text-extraction';

const BENEFIT_MODEL = 'claude-sonnet-4-6';
const MAX_TEXT_CHARS = 40_000;

export const benefitFormExtractionSchema = z.object({
  kind: z.enum(['1099-R', '1099-G', 'W-2G', 'other']),
  payerName: z.string().min(1).nullable(),
  payerTin: z.string().min(1).nullable(),
  corrected: z.boolean(),
  taxYear: z.number().int().min(2000).max(2100),
  r1099: z
    .object({
      box1: z.number().nullable(),
      box2a: z.number().nullable(),
      box2bNotDetermined: z.boolean().nullable(),
      box4: z.number().nullable(),
      box7Codes: z.string().nullable(),
      iraSepSimple: z.boolean().nullable(),
    })
    .nullable(),
  g1099: z
    .object({
      box1: z.number().nullable(),
      box2: z.number().nullable(),
      box4: z.number().nullable(),
      state: z.string().nullable(),
    })
    .nullable(),
  w2g: z
    .object({
      box1: z.number().nullable(),
      box4: z.number().nullable(),
    })
    .nullable(),
});

const SYSTEM_PROMPT = `You extract a US Form 1099-R (Distributions From Pensions, Annuities, Retirement Plans), 1099-G (Certain Government Payments), or W-2G (Certain Gambling Winnings), given the text of an uploaded document.

Rules:
- kind is the form's own title: "1099-R", "1099-G", or "W-2G". If the document is none of these, kind is "other" and every other field is null.
- Report every figure EXACTLY as printed. A blank, unreadable or absent box is null. A printed zero is 0, not null. Never derive one box from another — box 2a in particular is reported as printed or null, never computed from box 1.
- 1099-R: r1099.box1 is box 1 (gross distribution); r1099.box2a is box 2a (taxable amount); box2bNotDetermined is the box 2b "taxable amount not determined" checkbox; box4 is federal income tax withheld; box7Codes is the distribution code(s) in box 7 EXACTLY as printed (e.g. "1", "G", "7", "1B") — never inferred from surrounding text; iraSepSimple is the IRA/SEP/SIMPLE checkbox.
- 1099-G: g1099.box1 is box 1 (unemployment compensation); g1099.box2 is box 2 (state or local income tax refunds); box4 is federal income tax withheld; state is the issuing state's abbreviation if shown.
- W-2G: w2g.box1 is box 1 (reportable winnings); w2g.box4 is box 4 (federal income tax withheld).
- corrected is true only when the form is marked CORRECTED. payerTin as printed. taxYear is the form's year.`;

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    kind: { type: 'string', enum: ['1099-R', '1099-G', 'W-2G', 'other'] },
    payerName: { type: ['string', 'null'] },
    payerTin: { type: ['string', 'null'] },
    corrected: { type: 'boolean' },
    taxYear: { type: 'number' },
    r1099: {
      type: ['object', 'null'],
      properties: {
        box1: { type: ['number', 'null'] },
        box2a: { type: ['number', 'null'] },
        box2bNotDetermined: { type: ['boolean', 'null'] },
        box4: { type: ['number', 'null'] },
        box7Codes: { type: ['string', 'null'] },
        iraSepSimple: { type: ['boolean', 'null'] },
      },
      required: ['box1', 'box2a', 'box2bNotDetermined', 'box4', 'box7Codes', 'iraSepSimple'],
    },
    g1099: {
      type: ['object', 'null'],
      properties: {
        box1: { type: ['number', 'null'] },
        box2: { type: ['number', 'null'] },
        box4: { type: ['number', 'null'] },
        state: { type: ['string', 'null'] },
      },
      required: ['box1', 'box2', 'box4', 'state'],
    },
    w2g: {
      type: ['object', 'null'],
      properties: {
        box1: { type: ['number', 'null'] },
        box4: { type: ['number', 'null'] },
      },
      required: ['box1', 'box4'],
    },
  },
  required: ['kind', 'payerName', 'payerTin', 'corrected', 'taxYear', 'r1099', 'g1099', 'w2g'],
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
 * Live assertions for this planner's facts, split by who asserted them —
 * the C2 pattern: document-sourced rows are ours to supersede; a person's
 * estimates of the shared facts are floor-rule input, never wiped here.
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
    .filter((r) => (BENEFIT_FACT_IDS as string[]).includes(r.factId))
    .map(toAssertion);
  return {
    prevLive: live.filter((a) => a.source.kind === 'document'),
    personLive: live.filter((a) => a.source.kind === 'person'),
  };
}

/** Recompute and write the year's benefit-form facts from stored rows. */
export async function replanBenefitFacts(
  db: DB,
  workspaceId: string,
  userId: string,
  taxYear: number,
  triggeringFileId: string,
): Promise<number> {
  const stored = await db
    .select()
    .from(benefitForms)
    .where(
      and(
        eq(benefitForms.workspaceId, workspaceId),
        eq(benefitForms.userId, userId),
        eq(benefitForms.taxYear, taxYear),
      ),
    );
  const rows: StoredBenefitFormRow[] = stored.map((r) => ({
    fileId: r.fileId,
    kind: r.kind as StoredBenefitFormRow['kind'],
    payerTin: r.payerTin,
    corrected: r.corrected,
    createdAt: r.createdAt.getTime(),
    extracted: JSON.parse(r.payload) as ExtractedBenefitForm,
  }));

  const { prevLive, personLive } = await loadLiveAssertions(db, workspaceId, userId, taxYear);
  const plan = planBenefitFacts({
    live: liveBenefitFormRows(rows),
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

export async function extractBenefitFormsJob(payload: unknown, db: DB): Promise<void> {
  const fileId = (payload as { fileId?: unknown })?.fileId;
  if (typeof fileId !== 'string' || fileId.length === 0) {
    throw new Error('extract-benefit-forms payload requires a fileId string');
  }

  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) return; // deleted before the job ran

  const buffer = await storage.get(file.storagePath);
  const text = await extractText(buffer, file.mimeType);
  if (!text || text.trim().length === 0) {
    throw new Error('benefit form has no extractable text');
  }

  const response = await structuredCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Extract this form (file: ${file.fileName}):\n\n${text.slice(0, MAX_TEXT_CHARS)}`,
    outputSchema: OUTPUT_SCHEMA,
    toolName: 'report_benefit_form',
    model: BENEFIT_MODEL,
    maxTokens: 2048,
  });

  const parsed = benefitFormExtractionSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error(`benefit form extraction failed validation: ${parsed.error.message}`);
  }
  const extracted = parsed.data;

  if (extracted.kind === 'other') {
    console.log(`[benefit] ${file.fileName}: not a 1099-R/G or W-2G — nothing extracted`);
    return;
  }

  const now = new Date();
  const [existing] = await db
    .select({ id: benefitForms.id })
    .from(benefitForms)
    .where(eq(benefitForms.fileId, fileId));
  if (existing) {
    await db
      .update(benefitForms)
      .set({
        kind: extracted.kind,
        taxYear: extracted.taxYear,
        payerName: extracted.payerName,
        payerTin: extracted.payerTin,
        corrected: extracted.corrected,
        payload: JSON.stringify(extracted),
        updatedAt: now,
      })
      .where(eq(benefitForms.id, existing.id));
  } else {
    await db.insert(benefitForms).values({
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

  const asserted = await replanBenefitFacts(
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
    model: BENEFIT_MODEL,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    costCents: calculateCostCents(BENEFIT_MODEL, response.inputTokens, response.outputTokens),
    createdAt: now,
  });

  console.log(
    `[benefit] ${file.fileName}: ${extracted.kind} payer=${extracted.payerName ?? '?'} year=${extracted.taxYear} corrected=${extracted.corrected} — ${asserted} fact assertion(s)`,
  );
}

/** Call once at boot to attach the handler to the job queue. */
export function registerExtractBenefitFormsHandler(): void {
  registerJobHandler(JOB_TYPES.extractBenefitForms, extractBenefitFormsJob);
}
