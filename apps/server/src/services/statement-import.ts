import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db';
import { accounts, aiUsage, files, holdings } from '../db/schema';
import { calculateCostCents } from '../routes/chat-stream';
import { structuredCompletion } from './anthropic';
import { JOB_TYPES, registerJobHandler } from './job-queue';
import { storage } from './storage';
import { extractText } from './text-extraction';

/**
 * Turns an uploaded brokerage statement (PDF/CSV) into holdings rows and a
 * cash-only account row. Self-contained: extracts its own text from storage
 * rather than depending on the embedding pipeline's chunks, so it can run in
 * parallel with RAG ingestion.
 *
 * Double-count rule: the created/updated account carries the statement's CASH
 * balance only — positions live exclusively in holdings, so portfolio totals
 * never count a position twice.
 */

const IMPORT_MODEL = 'claude-sonnet-4-6'; // extraction quality matters more than cost here
const MAX_TEXT_CHARS = 60_000;

const importResultSchema = z.object({
  institution: z.string().min(1).nullable(),
  positions: z.array(
    z.object({
      symbol: z.string().min(1),
      name: z.string().min(1),
      value: z.number().nonnegative(),
      quantity: z.number().positive().nullable(),
      costBasis: z.number().nonnegative().nullable(),
    }),
  ),
  cashBalance: z.number().nullable(),
});

const IMPORT_SYSTEM_PROMPT = `You extract portfolio positions from brokerage statements (PDF text or CSV exports).

Rules:
- Extract each position once: ticker symbol (uppercase), security name, current market value.
- Include quantity (shares/units) and total cost basis when the statement shows them; otherwise null.
- cashBalance is the cash/sweep/money-market balance only — never the total account value.
- institution is the brokerage name (e.g. "Fidelity", "Robinhood"); null if unclear.
- Do not invent positions. If the document is not a brokerage statement, return an empty positions array.`;

const IMPORT_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    institution: { type: ['string', 'null'] },
    positions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          name: { type: 'string' },
          value: { type: 'number' },
          quantity: { type: ['number', 'null'] },
          costBasis: { type: ['number', 'null'] },
        },
        required: ['symbol', 'name', 'value', 'quantity', 'costBasis'],
      },
    },
    cashBalance: { type: ['number', 'null'] },
  },
  required: ['institution', 'positions', 'cashBalance'],
};

export interface ImportSummary {
  positionsCreated: number;
  positionsUpdated: number;
  cashBalance: number | null;
  institution: string | null;
}

export async function importStatement(payload: unknown, db: DB): Promise<void> {
  const fileId = (payload as { fileId?: unknown })?.fileId;
  if (typeof fileId !== 'string' || fileId.length === 0) {
    throw new Error('import-statement payload requires a fileId string');
  }

  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) return; // deleted before the job ran

  const buffer = await storage.get(file.storagePath);
  const text = await extractText(buffer, file.mimeType);
  if (!text || text.trim().length === 0) {
    throw new Error('Statement has no extractable text');
  }

  const response = await structuredCompletion({
    systemPrompt: IMPORT_SYSTEM_PROMPT,
    userMessage: `Extract the portfolio positions from this statement (file: ${file.fileName}):\n\n${text.slice(0, MAX_TEXT_CHARS)}`,
    outputSchema: IMPORT_OUTPUT_SCHEMA,
    toolName: 'report_positions',
    model: IMPORT_MODEL,
    maxTokens: 8192,
  });

  const parsed = importResultSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error(`Import extraction failed validation: ${parsed.error.message}`);
  }
  const result = parsed.data;
  const now = new Date();

  // Upsert holdings by symbol
  for (const position of result.positions) {
    const symbol = position.symbol.toUpperCase();
    const [existing] = await db
      .select({ id: holdings.id })
      .from(holdings)
      .where(
        and(
          eq(holdings.workspaceId, file.workspaceId),
          eq(holdings.userId, file.userId),
          eq(holdings.symbol, symbol),
        ),
      );

    if (existing) {
      await db
        .update(holdings)
        .set({
          name: position.name,
          value: position.value,
          quantity: position.quantity,
          costBasis: position.costBasis,
          updatedAt: now,
        })
        .where(eq(holdings.id, existing.id));
    } else {
      await db.insert(holdings).values({
        id: crypto.randomUUID(),
        workspaceId: file.workspaceId,
        userId: file.userId,
        symbol,
        name: position.name,
        value: position.value,
        targetPct: 0,
        quantity: position.quantity,
        costBasis: position.costBasis,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Upsert the brokerage account with the CASH balance only (never positions)
  if (result.institution && result.cashBalance !== null) {
    const accountName = `${result.institution} (cash)`;
    const [existingAccount] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.workspaceId, file.workspaceId),
          eq(accounts.userId, file.userId),
          eq(accounts.institution, result.institution),
          eq(accounts.type, 'brokerage-cash'),
        ),
      );

    if (existingAccount) {
      await db
        .update(accounts)
        .set({ balance: result.cashBalance, updatedAt: now })
        .where(eq(accounts.id, existingAccount.id));
    } else {
      await db.insert(accounts).values({
        id: crypto.randomUUID(),
        workspaceId: file.workspaceId,
        userId: file.userId,
        name: accountName,
        institution: result.institution,
        type: 'brokerage-cash',
        balance: result.cashBalance,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  await db.insert(aiUsage).values({
    id: crypto.randomUUID(),
    userId: file.userId,
    conversationId: null,
    model: IMPORT_MODEL,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    costCents: calculateCostCents(IMPORT_MODEL, response.inputTokens, response.outputTokens),
    createdAt: now,
  });

  console.log(
    `[import] ${file.fileName}: ${result.positions.length} positions, cash=${result.cashBalance}, institution=${result.institution}`,
  );
}

/** Call once at boot to attach the handler to the job queue. */
export function registerStatementImportHandler(): void {
  registerJobHandler(JOB_TYPES.importStatement, importStatement);
}
