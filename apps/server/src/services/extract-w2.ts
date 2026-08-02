// ─── C1 · The W-2 extraction job ───────────────────────────────────
// Upload → Sonnet extraction against a typed schema → a stored w2_forms
// row → fact assertions recomputed over the year's live rows (w2-facts.ts).
// Same pipeline shape as reconcile-1099; the difference is the destination:
// a W-2 lands in the fact model with document provenance, where the filing
// engine — and eventually the manifest — reads it.

import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { aiUsage, factAssertions, files, w2Forms } from '../db/schema';
import type { FactAssertion } from '../lib/calc/filing/facts';
import { calculateCostCents } from '../routes/chat-stream';
import { structuredCompletion } from './anthropic';
import { JOB_TYPES, registerJobHandler } from './job-queue';
import { storage } from './storage';
import { extractText } from './text-extraction';
import {
  type ExtractedW2,
  type StoredW2Row,
  W2_FACT_IDS,
  liveW2Rows,
  planW2Facts,
} from './w2-facts';

const W2_MODEL = 'claude-sonnet-4-6';
const MAX_TEXT_CHARS = 40_000;

const extractedW2Schema = z.object({
  employerName: z.string().min(1).nullable(),
  employerEin: z.string().min(1).nullable(),
  corrected: z.boolean(),
  taxYear: z.number().int().min(2000).max(2100),
  boxes: z.object({
    box1: z.number().nullable(),
    box2: z.number().nullable(),
    box3: z.number().nullable(),
    box4: z.number().nullable(),
    box5: z.number().nullable(),
    box6: z.number().nullable(),
    box12: z.array(z.object({ code: z.string().min(1), amount: z.number() })),
    box14: z.string().nullable(),
    stateRows: z.array(
      z.object({
        state: z.string().min(1),
        stateWages: z.number().nullable(),
        stateTax: z.number().nullable(),
      }),
    ),
  }),
});

const SYSTEM_PROMPT = `You extract the boxes from a US Form W-2 (Wage and Tax Statement), given the text of an uploaded document.

Rules:
- Report every box EXACTLY as printed. Box 1 (wages) and box 3 (Social Security wages) routinely differ — 401(k) contributions are in box 3 but not box 1. NEVER reconcile, average, or correct one box against another.
- A box that is blank, unreadable, or absent is null. Never substitute zero for a blank — zero is a printed value, null is the absence of one.
- corrected is true only for a Form W-2c (Corrected Wage and Tax Statement).
- employerEin is the employer identification number as printed (box b), with its hyphen. taxYear is the form's year.
- box12 lists every entry with its letter code (D, W, DD, AA, …) and amount, verbatim.
- stateRows: one entry per state line (boxes 15–17): state abbreviation, state wages (box 16), state income tax (box 17).
- If the document is not a W-2 or W-2c, return null for employerName and employerEin and null for every box.`;

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    employerName: { type: ['string', 'null'] },
    employerEin: { type: ['string', 'null'] },
    corrected: { type: 'boolean' },
    taxYear: { type: 'number' },
    boxes: {
      type: 'object',
      properties: {
        box1: { type: ['number', 'null'] },
        box2: { type: ['number', 'null'] },
        box3: { type: ['number', 'null'] },
        box4: { type: ['number', 'null'] },
        box5: { type: ['number', 'null'] },
        box6: { type: ['number', 'null'] },
        box12: {
          type: 'array',
          items: {
            type: 'object',
            properties: { code: { type: 'string' }, amount: { type: 'number' } },
            required: ['code', 'amount'],
          },
        },
        box14: { type: ['string', 'null'] },
        stateRows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              state: { type: 'string' },
              stateWages: { type: ['number', 'null'] },
              stateTax: { type: ['number', 'null'] },
            },
            required: ['state', 'stateWages', 'stateTax'],
          },
        },
      },
      required: ['box1', 'box2', 'box3', 'box4', 'box5', 'box6', 'box12', 'box14', 'stateRows'],
    },
  },
  required: ['employerName', 'employerEin', 'corrected', 'taxYear', 'boxes'],
};

/** Live = not superseded by any other assertion (the A1 rule, in SQL). */
async function loadPrevLiveW2Assertions(
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
    .filter((r) => (W2_FACT_IDS as string[]).includes(r.factId))
    .map((r) => ({
      assertionId: r.assertionId,
      factId: r.factId as FactAssertion['factId'],
      taxYear: r.taxYear,
      value: JSON.parse(r.value),
      source: JSON.parse(r.source),
      assertedAt: r.assertedAt,
      supersedes: r.supersedes,
    }));
}

/** Recompute and write the year's W-2 facts from its stored rows. */
export async function replanW2Facts(
  db: DB,
  workspaceId: string,
  userId: string,
  taxYear: number,
  triggeringFileId: string,
): Promise<number> {
  const stored = await db
    .select()
    .from(w2Forms)
    .where(
      and(
        eq(w2Forms.workspaceId, workspaceId),
        eq(w2Forms.userId, userId),
        eq(w2Forms.taxYear, taxYear),
      ),
    );
  const rows: StoredW2Row[] = stored.map((r) => ({
    fileId: r.fileId,
    employerEin: r.employerEin,
    corrected: r.corrected,
    createdAt: r.createdAt.getTime(),
    extracted: JSON.parse(r.payload) as ExtractedW2,
  }));

  const prevLive = await loadPrevLiveW2Assertions(db, workspaceId, userId, taxYear);
  const plan = planW2Facts({
    live: liveW2Rows(rows),
    prevLive,
    workspaceKey: { taxYear },
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

export async function extractW2Job(payload: unknown, db: DB): Promise<void> {
  const fileId = (payload as { fileId?: unknown })?.fileId;
  if (typeof fileId !== 'string' || fileId.length === 0) {
    throw new Error('extract-w2 payload requires a fileId string');
  }

  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) return; // deleted before the job ran

  const buffer = await storage.get(file.storagePath);
  const text = await extractText(buffer, file.mimeType);
  if (!text || text.trim().length === 0) {
    throw new Error('W-2 has no extractable text');
  }

  const response = await structuredCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Extract the boxes from this W-2 (file: ${file.fileName}):\n\n${text.slice(0, MAX_TEXT_CHARS)}`,
    outputSchema: OUTPUT_SCHEMA,
    toolName: 'report_w2',
    model: W2_MODEL,
    maxTokens: 4096,
  });

  const parsed = extractedW2Schema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error(`W-2 extraction failed validation: ${parsed.error.message}`);
  }
  const extracted = parsed.data;

  // Not a W-2 at all: nothing stored, nothing asserted — the G-phase hook
  // for "we weren't expecting this" reads job outcomes, not ghost rows.
  if (extracted.employerName === null && extracted.employerEin === null) {
    const empty = Object.values(extracted.boxes).every(
      (v) => v === null || (Array.isArray(v) && v.length === 0),
    );
    if (empty) {
      console.log(`[W-2] ${file.fileName}: not a W-2 — nothing extracted`);
      return;
    }
  }

  const now = new Date();
  const [existing] = await db
    .select({ id: w2Forms.id })
    .from(w2Forms)
    .where(eq(w2Forms.fileId, fileId));
  if (existing) {
    await db
      .update(w2Forms)
      .set({
        taxYear: extracted.taxYear,
        employerName: extracted.employerName,
        employerEin: extracted.employerEin,
        corrected: extracted.corrected,
        payload: JSON.stringify(extracted),
        updatedAt: now,
      })
      .where(eq(w2Forms.id, existing.id));
  } else {
    await db.insert(w2Forms).values({
      id: crypto.randomUUID(),
      workspaceId: file.workspaceId,
      userId: file.userId,
      fileId,
      taxYear: extracted.taxYear,
      employerName: extracted.employerName,
      employerEin: extracted.employerEin,
      corrected: extracted.corrected,
      payload: JSON.stringify(extracted),
      createdAt: now,
      updatedAt: now,
    });
  }

  const asserted = await replanW2Facts(
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
    model: W2_MODEL,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    costCents: calculateCostCents(W2_MODEL, response.inputTokens, response.outputTokens),
    createdAt: now,
  });

  console.log(
    `[W-2] ${file.fileName}: employer=${extracted.employerName ?? '?'} year=${extracted.taxYear} corrected=${extracted.corrected} — ${asserted} fact assertion(s)`,
  );
}

/** Call once at boot to attach the handler to the job queue. */
export function registerExtractW2Handler(): void {
  registerJobHandler(JOB_TYPES.extractW2, extractW2Job);
}
