import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { aiUsage, files, tax1099s } from '../db/schema';
import type { Extracted1099 } from '../lib/calc/reconcile';
import { calculateCostCents } from '../routes/chat-stream';
import { structuredCompletion } from './anthropic';
import { JOB_TYPES, registerJobHandler } from './job-queue';
import { storage } from './storage';
import { extractText } from './text-extraction';

/**
 * Turns an uploaded 1099-B (or consolidated 1099) into per-security summary
 * rows stored on tax1099s. The reconciliation itself is computed on demand
 * by the tax router against the lot engine's ledger — this job only extracts
 * and stores what the broker reported.
 */

const RECONCILE_MODEL = 'claude-sonnet-4-6'; // same bar as statement import
const MAX_TEXT_CHARS = 60_000;

const extracted1099Schema = z.object({
  broker: z.string().min(1).nullable(),
  taxYear: z.number().int().min(2000).max(2100),
  rows: z.array(
    z.object({
      symbol: z.string().min(1),
      description: z.string().nullable(),
      proceeds: z.number(),
      costBasis: z.number().nullable(),
      gain: z.number().nullable(),
      term: z.enum(['short', 'long', 'unknown']),
      quantity: z.number().nullable(),
    }),
  ),
});

const SYSTEM_PROMPT = `You extract per-security totals from a US 1099-B or consolidated 1099 tax form (text of a PDF).

Rules:
- One row per security PER TERM: combine individual lots of the same security and holding-period category into a single row (sum proceeds, cost basis, gain).
- term is "short" for short-term sections (Form 8949 Box A/B/C), "long" for long-term sections (Box D/E/F), "unknown" only if the form truly doesn't say.
- proceeds = total sale proceeds for that security+term. costBasis = reported cost basis, null when the form shows it as unknown/not reported. gain = reported gain/loss including any wash-sale adjustment the broker applied; null if not shown.
- symbol is the ticker (uppercase). If only a description is given, infer the ticker only when unambiguous (e.g. "APPLE INC" → AAPL); otherwise use the description as the symbol verbatim.
- taxYear is the form's tax year. broker is the payer/institution name.
- Extract only sale/disposition rows — ignore dividends, interest, and summary boxes that duplicate the per-security detail.
- Do not invent rows. If the document is not a 1099, return an empty rows array.`;

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    broker: { type: ['string', 'null'] },
    taxYear: { type: 'number' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          description: { type: ['string', 'null'] },
          proceeds: { type: 'number' },
          costBasis: { type: ['number', 'null'] },
          gain: { type: ['number', 'null'] },
          term: { type: 'string', enum: ['short', 'long', 'unknown'] },
          quantity: { type: ['number', 'null'] },
        },
        required: ['symbol', 'description', 'proceeds', 'costBasis', 'gain', 'term', 'quantity'],
      },
    },
  },
  required: ['broker', 'taxYear', 'rows'],
};

export async function reconcile1099Job(payload: unknown, db: DB): Promise<void> {
  const fileId = (payload as { fileId?: unknown })?.fileId;
  if (typeof fileId !== 'string' || fileId.length === 0) {
    throw new Error('reconcile-1099 payload requires a fileId string');
  }

  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) return; // deleted before the job ran

  const buffer = await storage.get(file.storagePath);
  const text = await extractText(buffer, file.mimeType);
  if (!text || text.trim().length === 0) {
    throw new Error('1099 has no extractable text');
  }

  const response = await structuredCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Extract the per-security sale totals from this tax form (file: ${file.fileName}):\n\n${text.slice(0, MAX_TEXT_CHARS)}`,
    outputSchema: OUTPUT_SCHEMA,
    toolName: 'report_1099',
    model: RECONCILE_MODEL,
    maxTokens: 8192,
  });

  const parsed = extracted1099Schema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error(`1099 extraction failed validation: ${parsed.error.message}`);
  }
  const extracted: Extracted1099 = parsed.data;
  const now = new Date();

  const [existing] = await db
    .select({ id: tax1099s.id })
    .from(tax1099s)
    .where(eq(tax1099s.fileId, fileId));
  if (existing) {
    await db
      .update(tax1099s)
      .set({
        taxYear: extracted.taxYear,
        broker: extracted.broker,
        payload: JSON.stringify(extracted),
        updatedAt: now,
      })
      .where(eq(tax1099s.id, existing.id));
  } else {
    await db.insert(tax1099s).values({
      id: crypto.randomUUID(),
      workspaceId: file.workspaceId,
      userId: file.userId,
      fileId,
      taxYear: extracted.taxYear,
      broker: extracted.broker,
      payload: JSON.stringify(extracted),
      createdAt: now,
      updatedAt: now,
    });
  }

  await db.insert(aiUsage).values({
    id: crypto.randomUUID(),
    userId: file.userId,
    conversationId: null,
    model: RECONCILE_MODEL,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    costCents: calculateCostCents(RECONCILE_MODEL, response.inputTokens, response.outputTokens),
    createdAt: now,
  });

  console.log(
    `[1099] ${file.fileName}: ${extracted.rows.length} security rows, year=${extracted.taxYear}, broker=${extracted.broker}`,
  );
}

/** Call once at boot to attach the handler to the job queue. */
export function registerReconcile1099Handler(): void {
  registerJobHandler(JOB_TYPES.reconcile1099, reconcile1099Job);
}
