// ─── C4 · The 1098-T / 1098-E / 1095-A extraction job ──────────────
// Upload → Sonnet extraction against a typed schema → a stored
// education_health_forms row → facts re-planned over the year's live rows
// (education-health-facts.ts). The 1095-A is the hardest extraction in
// C-phase: a twelve-row monthly table where a printed zero and a blank
// mean different things, and D3 reconciles month-wise — so the schema
// carries every month as printed and the prompt defends the distinction.

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { aiUsage, educationHealthForms, factAssertions, files } from '../db/schema';
import type { FactAssertion } from '../lib/calc/filing/facts';
import { calculateCostCents } from '../routes/chat-stream';
import { structuredCompletion } from './anthropic';
import {
  EDU_HEALTH_FACT_IDS,
  type ExtractedEducationHealthForm,
  type StoredEducationHealthRow,
  TAXABLE_SCHOLARSHIP_RULE,
  liveEducationHealthRows,
  planEducationHealthFacts,
} from './education-health-facts';
import { JOB_TYPES, registerJobHandler } from './job-queue';
import { storage } from './storage';
import { extractText } from './text-extraction';

const EDU_HEALTH_MODEL = 'claude-sonnet-4-6';
const MAX_TEXT_CHARS = 40_000;

export const educationHealthExtractionSchema = z.object({
  kind: z.enum(['1098-T', '1098-E', '1095-A', 'other']),
  issuerName: z.string().min(1).nullable(),
  issuerTin: z.string().min(1).nullable(),
  corrected: z.boolean(),
  taxYear: z.number().int().min(2000).max(2100),
  t1098: z
    .object({
      box1: z.number().nullable(),
      box2: z.number().nullable(),
      box5: z.number().nullable(),
      box8HalfTime: z.boolean().nullable(),
      box9Graduate: z.boolean().nullable(),
    })
    .nullable(),
  e1098: z.object({ box1: z.number().nullable() }).nullable(),
  a1095: z
    .object({
      months: z
        .array(
          z.object({
            month: z.number().int().min(1).max(12),
            premium: z.number().nullable(),
            slcsp: z.number().nullable(),
            aptc: z.number().nullable(),
          }),
        )
        .max(12),
    })
    .nullable(),
});

const SYSTEM_PROMPT = `You extract a US Form 1098-T (Tuition Statement), 1098-E (Student Loan Interest Statement), or 1095-A (Health Insurance Marketplace Statement), given the text of an uploaded document.

Rules:
- kind is the form's own title: "1098-T", "1098-E", or "1095-A". If the document is none of these, kind is "other" and every other field is null.
- Report every figure EXACTLY as printed. A blank, unreadable or absent box is null. A PRINTED ZERO IS 0, NOT NULL — on a 1095-A the difference between a $0.00 month and a blank month changes the reconciliation, so preserve it exactly.
- 1098-T: t1098.box1 is box 1 (payments received for qualified tuition); t1098.box2 is the retired amounts-billed box if the school still printed one; t1098.box5 is box 5 (scholarships or grants); box8HalfTime is the box 8 checkbox (at least half-time student); box9Graduate is the box 9 checkbox (graduate student). Checkboxes: true if checked, false if visibly unchecked, null if absent.
- 1098-E: e1098.box1 is box 1 (student loan interest received by lender).
- 1095-A: a1095.months lists ONLY the months that appear in Part III (lines 21–32), one entry per month with its number (January = 1): premium is column A (monthly enrollment premium), slcsp is column B (second lowest cost silver plan), aptc is column C (advance payment of premium tax credit). Do not invent months the form leaves entirely blank; do include months printed with zeros.
- corrected is true only when the form is marked CORRECTED. issuerTin is the school's, lender's, or marketplace-policy issuer's TIN as printed. taxYear is the form's year.`;

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    kind: { type: 'string', enum: ['1098-T', '1098-E', '1095-A', 'other'] },
    issuerName: { type: ['string', 'null'] },
    issuerTin: { type: ['string', 'null'] },
    corrected: { type: 'boolean' },
    taxYear: { type: 'number' },
    t1098: {
      type: ['object', 'null'],
      properties: {
        box1: { type: ['number', 'null'] },
        box2: { type: ['number', 'null'] },
        box5: { type: ['number', 'null'] },
        box8HalfTime: { type: ['boolean', 'null'] },
        box9Graduate: { type: ['boolean', 'null'] },
      },
      required: ['box1', 'box2', 'box5', 'box8HalfTime', 'box9Graduate'],
    },
    e1098: {
      type: ['object', 'null'],
      properties: { box1: { type: ['number', 'null'] } },
      required: ['box1'],
    },
    a1095: {
      type: ['object', 'null'],
      properties: {
        months: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              month: { type: 'number' },
              premium: { type: ['number', 'null'] },
              slcsp: { type: ['number', 'null'] },
              aptc: { type: ['number', 'null'] },
            },
            required: ['month', 'premium', 'slcsp', 'aptc'],
          },
        },
      },
      required: ['months'],
    },
  },
  required: ['kind', 'issuerName', 'issuerTin', 'corrected', 'taxYear', 't1098', 'e1098', 'a1095'],
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
 * Live assertions this planner owns: document-sourced, plus the c4 rule's
 * own derivation. Person-sourced answers to the shared bools are never
 * touched here.
 */
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
    .filter((r) => (EDU_HEALTH_FACT_IDS as string[]).includes(r.factId))
    .map(toAssertion)
    .filter(
      (a) =>
        a.source.kind === 'document' ||
        (a.source.kind === 'rule' && a.source.ruleId === TAXABLE_SCHOLARSHIP_RULE),
    );
}

/** Recompute and write the year's education/health facts from stored rows. */
export async function replanEducationHealthFacts(
  db: DB,
  workspaceId: string,
  userId: string,
  taxYear: number,
  triggeringFileId: string,
): Promise<number> {
  const stored = await db
    .select()
    .from(educationHealthForms)
    .where(
      and(
        eq(educationHealthForms.workspaceId, workspaceId),
        eq(educationHealthForms.userId, userId),
        eq(educationHealthForms.taxYear, taxYear),
      ),
    );
  const rows: StoredEducationHealthRow[] = stored.map((r) => ({
    fileId: r.fileId,
    kind: r.kind as StoredEducationHealthRow['kind'],
    issuerTin: r.issuerTin,
    corrected: r.corrected,
    createdAt: r.createdAt.getTime(),
    extracted: JSON.parse(r.payload) as ExtractedEducationHealthForm,
  }));

  const prevLive = await loadPrevLive(db, workspaceId, userId, taxYear);
  const plan = planEducationHealthFacts({
    live: liveEducationHealthRows(rows),
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
  return plan.length;
}

export async function extractEducationHealthJob(payload: unknown, db: DB): Promise<void> {
  const fileId = (payload as { fileId?: unknown })?.fileId;
  if (typeof fileId !== 'string' || fileId.length === 0) {
    throw new Error('extract-education-health payload requires a fileId string');
  }

  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) return; // deleted before the job ran

  const buffer = await storage.get(file.storagePath);
  const text = await extractText(buffer, file.mimeType);
  if (!text || text.trim().length === 0) {
    throw new Error('education/health form has no extractable text');
  }

  const response = await structuredCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Extract this form (file: ${file.fileName}):\n\n${text.slice(0, MAX_TEXT_CHARS)}`,
    outputSchema: OUTPUT_SCHEMA,
    toolName: 'report_education_health_form',
    model: EDU_HEALTH_MODEL,
    maxTokens: 4096,
  });

  const parsed = educationHealthExtractionSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error(`education/health extraction failed validation: ${parsed.error.message}`);
  }
  const extracted = parsed.data;

  if (extracted.kind === 'other') {
    console.log(`[edu/health] ${file.fileName}: not a 1098-T/E or 1095-A — nothing extracted`);
    return;
  }

  const now = new Date();
  const [existing] = await db
    .select({ id: educationHealthForms.id })
    .from(educationHealthForms)
    .where(eq(educationHealthForms.fileId, fileId));
  if (existing) {
    await db
      .update(educationHealthForms)
      .set({
        kind: extracted.kind,
        taxYear: extracted.taxYear,
        issuerName: extracted.issuerName,
        issuerTin: extracted.issuerTin,
        corrected: extracted.corrected,
        payload: JSON.stringify(extracted),
        updatedAt: now,
      })
      .where(eq(educationHealthForms.id, existing.id));
  } else {
    await db.insert(educationHealthForms).values({
      id: crypto.randomUUID(),
      workspaceId: file.workspaceId,
      userId: file.userId,
      fileId,
      kind: extracted.kind,
      taxYear: extracted.taxYear,
      issuerName: extracted.issuerName,
      issuerTin: extracted.issuerTin,
      corrected: extracted.corrected,
      payload: JSON.stringify(extracted),
      createdAt: now,
      updatedAt: now,
    });
  }

  const asserted = await replanEducationHealthFacts(
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
    model: EDU_HEALTH_MODEL,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    costCents: calculateCostCents(EDU_HEALTH_MODEL, response.inputTokens, response.outputTokens),
    createdAt: now,
  });

  console.log(
    `[edu/health] ${file.fileName}: ${extracted.kind} issuer=${extracted.issuerName ?? '?'} year=${extracted.taxYear} corrected=${extracted.corrected} — ${asserted} fact assertion(s)`,
  );
}

/** Call once at boot to attach the handler to the job queue. */
export function registerExtractEducationHealthHandler(): void {
  registerJobHandler(JOB_TYPES.extractEducationHealth, extractEducationHealthJob);
}
