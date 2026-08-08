import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DB } from '../db';
import {
  accounts,
  entities,
  entityEdges,
  entityMentions,
  files,
  holdings,
  marketBars,
  trades,
  transactions,
  workspaces,
} from '../db/schema';
import { findUnmatchedTransactions } from './reconciliation';
// Lazy import to avoid loading OpenAI SDK at server startup
const lazySearchDocuments = () => import('./vector-search').then((m) => m.searchDocuments);
import {
  computeProjection,
  computeRealizedGains,
  computeTaxEstimate,
  createDefaultProjectionData,
  createDefaultTaxEstimatorData,
} from '../lib/calc';
import type { LotTrade, ProjectionCardData, TaxEstimatorData } from '../lib/calc';
import { buildForm8949Rows } from '../lib/calc/exports';
import { stateTaxOnGains } from '../lib/calc/state-gains';
import { getPolygonService } from '../trpc/context';
import { computeBenchmark } from './benchmark';
import {
  explainDeterminationTool,
  getReadinessTool,
  priceUnknownTool,
  recordFactTool,
} from './filing-tools';
import { buildTaxPicture } from './tax-picture';

export interface ToolContext {
  db: DB;
  userId: string;
  workspaceId: string;
  /** G2: record_fact stamps the conversation an answer was given in. */
  conversationId?: string;
  /** The desk's tax year. The filing tools work on a year, not on "now". */
  taxYear?: number;
}

type ToolExecutor = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<Record<string, unknown>>;

interface ToolRegistration {
  definition: Tool;
  execute: ToolExecutor;
}

function truncateSchedule<T>(
  schedule: T[],
  limit = 24,
): { rows: T[]; truncated: boolean; totalRows: number } {
  if (schedule.length <= limit)
    return { rows: schedule, truncated: false, totalRows: schedule.length };
  const half = Math.floor(limit / 2);
  return {
    rows: [...schedule.slice(0, half), ...schedule.slice(-half)],
    truncated: true,
    totalRows: schedule.length,
  };
}

async function loadTrades(ctx: ToolContext): Promise<LotTrade[]> {
  const rows = await ctx.db
    .select()
    .from(trades)
    .where(and(eq(trades.workspaceId, ctx.workspaceId), eq(trades.userId, ctx.userId)));
  return rows.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    side: t.side as 'buy' | 'sell',
    tradeDate: t.tradeDate,
    units: t.units,
    price: t.price,
    fees: t.fees,
  }));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LONG_TERM_DAYS = 365;
const WASH_WINDOW_DAYS = 30;

/** Big enough for a real layout, small enough not to bloat a stored panel. */
const MAX_PANEL_HTML = 24_000;

/**
 * The pre-trade check behind Bip's most important behavior: surfacing what a
 * sale actually costs BEFORE it happens. FIFO order, per-lot terms, tax at
 * the user's marginal/LTCG position, and wash-sale exposure.
 */
async function preTradeCheck(
  ctx: ToolContext,
  symbol: string,
  requestedUnits: number | undefined,
): Promise<Record<string, unknown>> {
  const [holding] = await ctx.db
    .select()
    .from(holdings)
    .where(
      and(
        eq(holdings.workspaceId, ctx.workspaceId),
        eq(holdings.userId, ctx.userId),
        eq(holdings.symbol, symbol),
      ),
    );
  const allTrades = await loadTrades(ctx);
  const summary = computeRealizedGains(allTrades);
  const openLots = summary.openLots.filter((l) => l.symbol === symbol);

  // Best available per-unit price: live holding value ÷ quantity, else null
  const currentPrice =
    holding && holding.quantity && holding.quantity > 0 ? holding.value / holding.quantity : null;

  if (!holding && openLots.length === 0) {
    return {
      available: false,
      reason: `No position or trade history found for ${symbol}.`,
    };
  }

  const totalUnits =
    openLots.length > 0 ? openLots.reduce((s, l) => s + l.units, 0) : (holding?.quantity ?? null);
  const unitsToSell =
    requestedUnits && requestedUnits > 0 && totalUnits !== null
      ? Math.min(requestedUnits, totalUnits)
      : totalUnits;

  const today = Date.now();
  const lots = openLots.map((lot) => {
    const heldDays = Math.floor(
      (today - new Date(`${lot.acquiredAt}T00:00:00Z`).getTime()) / DAY_MS,
    );
    return {
      acquiredAt: lot.acquiredAt,
      units: lot.units,
      costPerUnit: lot.costPerUnit,
      term: heldDays > LONG_TERM_DAYS ? 'long' : 'short',
      daysUntilLongTerm: heldDays > LONG_TERM_DAYS ? 0 : LONG_TERM_DAYS + 1 - heldDays,
    };
  });

  // Simulate the FIFO sale where lots + a price are known
  let estimatedGainShort: number | null = null;
  let estimatedGainLong: number | null = null;
  if (lots.length > 0 && currentPrice !== null && unitsToSell !== null) {
    let remaining = unitsToSell;
    estimatedGainShort = 0;
    estimatedGainLong = 0;
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.units, remaining);
      const gain = take * (currentPrice - lot.costPerUnit);
      if (lot.term === 'long') estimatedGainLong += gain;
      else estimatedGainShort += gain;
      remaining -= take;
    }
  }

  // Wash-sale exposure: selling at a loss with buys in the last 30 days
  // disallows the loss; rebuying within 30 days after would too.
  const cutoff = new Date(today - WASH_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
  const recentBuys = allTrades.filter(
    (t) => t.side === 'buy' && t.symbol.toUpperCase() === symbol && t.tradeDate >= cutoff,
  );
  const estimatedTotalGain =
    estimatedGainShort !== null && estimatedGainLong !== null
      ? estimatedGainShort + estimatedGainLong
      : null;
  const washSaleRisk =
    estimatedTotalGain !== null && estimatedTotalGain < 0
      ? recentBuys.length > 0
        ? 'selling now at a loss triggers a wash sale — replacement shares were bought within the last 30 days'
        : 'selling at a loss is fine ONLY if no replacement shares are bought within 30 days after the sale'
      : null;

  // Tax context: marginal rates + 0% LTCG headroom
  const picture = await buildTaxPicture(ctx.db, ctx.userId, ctx.workspaceId);
  // B1: the state layer, alongside federal and never blended into it — MA's
  // 8.5% short-term rate is bigger than most users' federal bracket, and a
  // sale shown federal-only understates the bill for the state we claim.
  const stateTax =
    picture.hasProfile && estimatedGainShort !== null && estimatedGainLong !== null
      ? stateTaxOnGains(picture.inputs.stateCode, picture.inputs.taxYear, {
          shortTerm: estimatedGainShort,
          longTerm: estimatedGainLong,
        })
      : null;
  const ltcgRoom = picture.result.ltcgZeroBracketRoom;
  const estimatedTax =
    estimatedGainShort !== null && estimatedGainLong !== null
      ? Math.max(0, estimatedGainShort) * (picture.result.marginalFederalRate / 100) +
        Math.max(0, estimatedGainLong - ltcgRoom) * 0.15
      : null;

  return {
    available: true,
    symbol,
    currentValue: holding?.value ?? null,
    currentPricePerUnit: currentPrice,
    unitsToSell,
    lots,
    estimatedGain:
      estimatedTotalGain !== null
        ? {
            total: estimatedTotalGain,
            shortTerm: estimatedGainShort,
            longTerm: estimatedGainLong,
            estimatedFederalTax: estimatedTax,
            note:
              ltcgRoom > 0
                ? picture.kiddie.note !== null
                  ? `Long-term gains up to $${Math.round(ltcgRoom)} fall in the 0% federal bracket this year. ${picture.kiddie.note}`
                  : `Long-term gains up to $${Math.round(ltcgRoom)} fall in the 0% federal bracket this year.`
                : null,
          }
        : {
            note: 'Gain cannot be estimated — lot history or share quantity is missing. Import statements or connect a brokerage for lot-level data.',
          },
    stateTax,
    washSaleRisk,
    marginalFederalRatePct: picture.result.marginalFederalRate,
    basedOn: lots.length > 0 ? 'lot history' : 'holding record only',
  };
}

const TOOLS: ToolRegistration[] = [
  // 1. get_workspace_summary
  {
    definition: {
      name: 'get_workspace_summary',
      description:
        'Get an overview of the current workspace including name, type, and counts of all data types.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    execute: async (_input, ctx) => {
      const [workspace] = await ctx.db
        .select({ name: workspaces.name, type: workspaces.type })
        .from(workspaces)
        .where(and(eq(workspaces.id, ctx.workspaceId), eq(workspaces.userId, ctx.userId)));

      if (!workspace) return { error: 'Workspace not found' };

      const countTable = async (
        table: typeof accounts | typeof holdings | typeof transactions | typeof files,
      ) => {
        const rows = await ctx.db
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.workspaceId, ctx.workspaceId), eq(table.userId, ctx.userId)));
        return rows.length;
      };

      const [accts, hlds, txns, docs] = await Promise.all([
        countTable(accounts),
        countTable(holdings),
        countTable(transactions),
        countTable(files),
      ]);

      return {
        name: workspace.name,
        type: workspace.type,
        counts: {
          accounts: accts,
          holdings: hlds,
          transactions: txns,
          documents: docs,
        },
      };
    },
  },

  // 2. get_accounts
  {
    definition: {
      name: 'get_accounts',
      description: 'List financial accounts with balances, optionally filtered by type.',
      input_schema: {
        type: 'object' as const,
        properties: {
          type: {
            type: 'string',
            description: 'Filter by account type (e.g. "checking", "savings")',
          },
        },
        required: [],
      },
    },
    execute: async (input, ctx) => {
      const conditions = [
        eq(accounts.workspaceId, ctx.workspaceId),
        eq(accounts.userId, ctx.userId),
      ];
      if (input.type) conditions.push(eq(accounts.type, input.type as string));

      const rows = await ctx.db
        .select({
          id: accounts.id,
          name: accounts.name,
          type: accounts.type,
          balance: accounts.balance,
          institution: accounts.institution,
        })
        .from(accounts)
        .where(and(...conditions))
        .limit(100);

      if (rows.length === 0) return { accounts: [], message: 'No accounts found' };
      return { accounts: rows };
    },
  },

  // 3. get_holdings
  {
    definition: {
      name: 'get_holdings',
      description: 'List portfolio holdings ordered by value.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    execute: async (_input, ctx) => {
      const rows = await ctx.db
        .select({
          id: holdings.id,
          symbol: holdings.symbol,
          name: holdings.name,
          value: holdings.value,
          targetPct: holdings.targetPct,
        })
        .from(holdings)
        .where(and(eq(holdings.workspaceId, ctx.workspaceId), eq(holdings.userId, ctx.userId)))
        .orderBy(desc(holdings.value))
        .limit(100);

      return { holdings: rows };
    },
  },

  // 4. get_market_data
  {
    definition: {
      name: 'get_market_data',
      description: 'Get cached market price bars for a symbol.',
      input_schema: {
        type: 'object' as const,
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol (e.g. "AAPL")' },
          timespan: { type: 'string', description: 'Bar timespan (e.g. "day", "hour")' },
        },
        required: ['symbol'],
      },
    },
    execute: async (input, ctx) => {
      // Market data is a global cache — no workspace/user scope
      const conditions = [eq(marketBars.symbol, (input.symbol as string).toUpperCase())];
      if (input.timespan) conditions.push(eq(marketBars.timespan, input.timespan as string));

      const rows = await ctx.db
        .select({
          timestamp: marketBars.timestamp,
          open: marketBars.open,
          high: marketBars.high,
          low: marketBars.low,
          close: marketBars.close,
          volume: marketBars.volume,
        })
        .from(marketBars)
        .where(and(...conditions))
        .limit(500);

      return { symbol: (input.symbol as string).toUpperCase(), bars: rows };
    },
  },

  // 5. calculate_tax
  {
    definition: {
      name: 'calculate_tax',
      description:
        'Estimate US federal + state income tax. Returns tax breakdown, effective rate, and marginal rates.',
      input_schema: {
        type: 'object' as const,
        properties: {
          taxYear: { type: 'number', description: 'Tax year (2025 or 2026)' },
          filingStatus: { type: 'string', description: 'Filing status: single, mfj, mfs, hoh' },
          stateCode: {
            type: 'string',
            description: '2-letter state code (e.g. "CA") or empty for no state tax',
          },
          w2Wages: { type: 'number', description: 'W-2 wages' },
          selfEmploymentIncome: { type: 'number', description: 'Self-employment income' },
          investmentIncome: {
            type: 'number',
            description: 'Interest + ordinary dividends (taxed as ordinary income)',
          },
          capitalGainsShort: {
            type: 'number',
            description: 'Net short-term capital gains (held ≤1 year, ordinary rates)',
          },
          capitalGainsLong: {
            type: 'number',
            description: 'Net long-term capital gains (held >1 year, 0/15/20% brackets)',
          },
          otherIncome: { type: 'number', description: 'Other income' },
          retirement401k: { type: 'number', description: '401(k) contributions' },
          traditionalIRA: { type: 'number', description: 'Traditional IRA contributions' },
          hsaContribution: { type: 'number', description: 'HSA contributions' },
          studentLoanInterest: { type: 'number', description: 'Student loan interest paid' },
          deductionType: { type: 'string', description: '"standard" or "itemized"' },
          saltDeduction: {
            type: 'number',
            description: 'State and local tax deduction (capped at $10k)',
          },
          mortgageInterest: { type: 'number', description: 'Mortgage interest paid' },
          charitableGiving: { type: 'number', description: 'Charitable contributions' },
          otherItemized: { type: 'number', description: 'Other itemized deductions' },
          numDependentChildren: {
            type: 'number',
            description: 'Number of dependent children for child tax credit',
          },
          otherCredits: { type: 'number', description: 'Other tax credits' },
          federalWithheld: { type: 'number', description: 'Federal tax already withheld' },
          stateWithheld: { type: 'number', description: 'State tax already withheld' },
          estimatedPayments: { type: 'number', description: 'Estimated tax payments made' },
        },
        required: [],
      },
    },
    execute: async (input, _ctx) => {
      const data = { ...createDefaultTaxEstimatorData(), ...input } as TaxEstimatorData;
      return computeTaxEstimate(data) as unknown as Record<string, unknown>;
    },
  },

  // 6. calculate_projection
  {
    definition: {
      name: 'calculate_projection',
      description: 'Project investment/savings growth over time with compound interest.',
      input_schema: {
        type: 'object' as const,
        properties: {
          startingAmount: { type: 'number', description: 'Initial investment amount' },
          monthlyContribution: { type: 'number', description: 'Monthly contribution amount' },
          annualGrowthRate: {
            type: 'number',
            description: 'Annual growth rate percentage (e.g. 7)',
          },
          projectionYears: {
            type: 'number',
            description: 'Number of years to project (default 10)',
          },
          inflationRate: {
            type: 'number',
            description: 'Annual inflation rate percentage (default 0)',
          },
        },
        required: ['startingAmount', 'monthlyContribution'],
      },
    },
    execute: async (input, _ctx) => {
      const data = { ...createDefaultProjectionData(), ...input } as ProjectionCardData;
      return computeProjection(data) as unknown as Record<string, unknown>;
    },
  },

  // 7. search_documents
  {
    definition: {
      name: 'search_documents',
      description:
        'Search uploaded documents in the workspace using hybrid retrieval: exact keyword matching (names, dollar amounts, account numbers, invoice IDs), semantic similarity (meaning and paraphrase), and visual page matching (finds scanned tables, charts, and stamps by description, e.g. "the page with the pie chart"). Returns the most relevant text chunks and visually matched pages from uploaded files (PDF, CSV, Excel, etc.).',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find relevant document content.',
          },
          topK: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5).',
          },
        },
        required: ['query'],
      },
    },
    execute: async (input, ctx) => {
      const query = input.query as string;
      if (!query || query.trim().length === 0) {
        return { error: 'Query must be a non-empty string.' };
      }

      try {
        const searchDocuments = await lazySearchDocuments();
        const results = await searchDocuments(query, ctx.workspaceId, ctx.db, {
          topK: input.topK as number | undefined,
        });

        if (results.length === 0) {
          return {
            results: [],
            message:
              'No matching documents found. The workspace may not have any uploaded documents, or none matched the query.',
          };
        }

        return {
          results: results.map((r) => ({
            fileName: r.fileName,
            content: r.content,
            score: Math.round(r.score * 1000) / 1000,
            chunkIndex: r.chunkIndex,
          })),
        };
      } catch {
        return {
          results: [],
          message: 'Document search is not available. Embedding service may be unavailable.',
        };
      }
    },
  },

  // 8. search_entities
  {
    definition: {
      name: 'search_entities',
      description:
        'Search the workspace entity graph — resolved merchants, institutions, people, organizations, and account references identified across uploaded documents AND financial cards. Use for "who/what" questions ("who do I pay the most?", "what do I know about Chase?"). For finding text passages, use search_documents instead.',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description:
              'Name or partial name to search for. Empty string lists the top entities by mention count.',
          },
          type: {
            type: 'string',
            enum: ['merchant', 'institution', 'person', 'organization', 'account_ref'],
            description: 'Optional filter by entity type.',
          },
        },
        required: ['query'],
      },
    },
    execute: async (input, ctx) => {
      const query = ((input.query as string) ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
      const typeFilter = input.type as string | undefined;

      const conditions = [
        eq(entities.workspaceId, ctx.workspaceId),
        eq(entities.userId, ctx.userId),
        isNull(entities.mergedInto),
      ];
      if (typeFilter) conditions.push(eq(entities.type, typeFilter));

      const rows = await ctx.db
        .select()
        .from(entities)
        .where(and(...conditions))
        .orderBy(desc(entities.mentionCount));

      const matches = rows
        .filter((e) => {
          if (query.length === 0) return true;
          if (e.normalizedName.includes(query)) return true;
          const aliases = JSON.parse(e.aliases) as string[];
          return aliases.some((a) => a.toLowerCase().includes(query));
        })
        .slice(0, 15);

      if (matches.length === 0) {
        return {
          entities: [],
          message:
            'No matching entities. The graph is built from uploaded documents and financial cards — it may still be processing recent uploads.',
        };
      }

      const results = [];
      for (const entity of matches) {
        const sources = await ctx.db
          .select({
            sourceType: entityMentions.sourceType,
            snippet: entityMentions.snippet,
            amount: entityMentions.amount,
          })
          .from(entityMentions)
          .where(eq(entityMentions.entityId, entity.id))
          .limit(3);
        results.push({
          entityId: entity.id,
          name: entity.canonicalName,
          type: entity.type,
          aliases: JSON.parse(entity.aliases) as string[],
          mentionCount: entity.mentionCount,
          sampleSources: sources,
        });
      }
      return { entities: results };
    },
  },

  // 9. get_entity_connections
  {
    definition: {
      name: 'get_entity_connections',
      description:
        'Walk the entity relationship graph from a starting entity — e.g. which account a merchant charges, which institution holds an account. Get the entityId from search_entities first.',
      input_schema: {
        type: 'object' as const,
        properties: {
          entityId: { type: 'string', description: 'Starting entity id (from search_entities).' },
          depth: {
            type: 'number',
            description: 'How many hops to follow: 1 (direct, default) or 2.',
          },
        },
        required: ['entityId'],
      },
    },
    execute: async (input, ctx) => {
      const entityId = input.entityId as string;
      const depth = Math.min(Math.max(Number(input.depth) || 1, 1), 2);
      const MAX_NODES = 50;

      const [start] = await ctx.db
        .select()
        .from(entities)
        .where(
          and(
            eq(entities.id, entityId),
            eq(entities.workspaceId, ctx.workspaceId),
            eq(entities.userId, ctx.userId),
          ),
        );
      if (!start) return { error: 'Entity not found. Use search_entities to find valid ids.' };

      const allEdges = await ctx.db
        .select()
        .from(entityEdges)
        .where(eq(entityEdges.workspaceId, ctx.workspaceId));

      const visited = new Set<string>([entityId]);
      const foundEdges: Array<{ from: string; to: string; relationship: string }> = [];
      let frontier = [entityId];
      for (let hop = 0; hop < depth && visited.size < MAX_NODES; hop++) {
        const next: string[] = [];
        for (const edge of allEdges) {
          const touchesFrontier =
            frontier.includes(edge.fromEntityId) || frontier.includes(edge.toEntityId);
          if (!touchesFrontier) continue;
          foundEdges.push({
            from: edge.fromEntityId,
            to: edge.toEntityId,
            relationship: edge.relationship,
          });
          for (const nodeId of [edge.fromEntityId, edge.toEntityId]) {
            if (!visited.has(nodeId) && visited.size < MAX_NODES) {
              visited.add(nodeId);
              next.push(nodeId);
            }
          }
        }
        frontier = next;
        if (frontier.length === 0) break;
      }

      const nodeRows = await ctx.db
        .select({
          id: entities.id,
          name: entities.canonicalName,
          type: entities.type,
          mentionCount: entities.mentionCount,
        })
        .from(entities)
        .where(inArray(entities.id, [...visited]));

      // Dedupe edges collected across hops
      const edgeKeys = new Set<string>();
      const uniqueEdges = foundEdges.filter((e) => {
        const key = `${e.from}|${e.to}|${e.relationship}`;
        if (edgeKeys.has(key)) return false;
        edgeKeys.add(key);
        return true;
      });

      return {
        start: { entityId: start.id, name: start.canonicalName, type: start.type },
        nodes: nodeRows,
        edges: uniqueEdges,
        truncated: visited.size >= MAX_NODES,
      };
    },
  },

  // 10. find_unmatched_transactions
  {
    definition: {
      name: 'find_unmatched_transactions',
      description:
        'Reconcile the ledger against uploaded documents: finds statement lines (amounts stated in documents) with no matching transaction, and transactions not found in any document. Matches on entity + amount (within a cent) + date (within 3 days). Optionally scope to one uploaded file.',
      input_schema: {
        type: 'object' as const,
        properties: {
          fileId: {
            type: 'string',
            description: 'Optional: reconcile against a single uploaded file only.',
          },
        },
        required: [],
      },
    },
    execute: async (input, ctx) => {
      const result = await findUnmatchedTransactions(
        ctx.workspaceId,
        ctx.db,
        input.fileId as string | undefined,
      );
      return {
        matchedCount: result.matchedCount,
        inDocumentsNotInLedger: result.unmatchedDocumentMentions.map((m) => ({
          entityName: m.entityName,
          amount: m.amount,
          date: m.date ? m.date.toISOString().slice(0, 10) : null,
          snippet: m.snippet,
        })),
        inLedgerNotInDocuments: result.unmatchedTransactions.map((t) => ({
          transactionId: t.transactionId,
          description: t.description,
          amount: t.amount,
          date: t.date,
        })),
      };
    },
  },

  // 11. get_tax_picture
  {
    definition: {
      name: 'get_tax_picture',
      description:
        "The user's year-round tax picture: projected total tax and refund/owed, effective and marginal rates, the 0% long-term capital gains headroom (ltcgZeroBracketRoom), quarterly safe-harbor payment plan, and unrealized-gains context. Use this before discussing any trade's tax impact.",
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    execute: async (_input, ctx) => {
      const picture = await buildTaxPicture(ctx.db, ctx.userId, ctx.workspaceId);
      return picture as unknown as Record<string, unknown>;
    },
  },

  // 12. estimate_capital_gains
  {
    definition: {
      name: 'estimate_capital_gains',
      description:
        'Realized capital gains for a tax year, computed from the imported trade history via FIFO lot matching: short/long totals, wash-sale disallowances, and per-sale detail. Returns available:false when no trades are imported.',
      input_schema: {
        type: 'object' as const,
        properties: {
          taxYear: { type: 'number', description: 'Tax year (defaults to the current year)' },
        },
        required: [],
      },
    },
    execute: async (input, ctx) => {
      const rows = await loadTrades(ctx);
      if (rows.length === 0) {
        return {
          available: false,
          reason: 'No trade history imported — connect a brokerage or upload statements.',
        };
      }
      const taxYear = (input.taxYear as number | undefined) ?? new Date().getFullYear();
      const summary = computeRealizedGains(rows, taxYear);
      return {
        available: true,
        taxYear,
        shortTermGain: summary.shortTermGain,
        longTermGain: summary.longTermGain,
        washDisallowed: summary.washDisallowed,
        uncoveredUnits: summary.uncoveredUnits,
        sales: summary.sales.slice(0, 40),
      };
    },
  },

  // 13. benchmark_comparison
  {
    definition: {
      name: 'benchmark_comparison',
      description:
        'Same-dollars, same-dates S&P 500 counterfactual: what the money invested in current positions would be worth had it gone into SPY on the same acquisition dates. Includes coverage (fraction of holdings comparable). Returns available:false when data is insufficient.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    execute: async (_input, ctx) => {
      const polygon = getPolygonService();
      if (!polygon) return { available: false, reason: 'Market data is not configured.' };
      try {
        const result = await computeBenchmark(ctx.db, polygon, ctx.userId, ctx.workspaceId);
        if (!result) {
          return {
            available: false,
            reason:
              'Not enough data — positions need a known cost basis and acquisition date (statement imports provide these).',
          };
        }
        return { available: true, ...result } as unknown as Record<string, unknown>;
      } catch {
        return { available: false, reason: 'Market data is currently unreachable.' };
      }
    },
  },

  // 14. show_on_desk
  {
    definition: {
      name: 'show_on_desk',
      description: `Build a visual answer and put it on the user's canvas. Use this for almost any question where seeing the figures laid out would help more than reading them in a sentence — a stock broken down, a tax position, the moves available and what each is worth, a comparison, a timeline, a breakdown.

Gather the real figures with the other tools FIRST, then pass a self-contained HTML fragment that lays them out. You are composing the presentation, never the data: every number in the fragment must be one a tool actually returned or the user actually gave you. If you don't have a figure, leave it out or mark it unknown — never fill a gap to make the layout tidy.

DO NOT write a <style> block or a class of your own — the fragment is rejected if you do. A stylesheet is already loaded with the classes below; your job is only to choose which of them the answer needs and fill them with real figures. Compose them freely — most answers are two or three stacked in a <div class="stack">. The only CSS you ever write inline is a width on a bar, a background on a swatch, and left on a range pin.

A whole answer looks like this:

  <div class="stack">
    <div class="card">
      <div class="label">If the year ended today</div>
      <div class="lead-row"><div class="lead num">$3,246</div><div class="chip h">still to pay</div></div>
      <p class="sub">$7,046 total tax, of which $3,800 has already come out of your pay.</p>
    </div>
    <div class="card">
      <div class="label">Federal income tax · single · 2026</div>
      <div class="band"><div class="r">22%</div><div class="t"></div><div class="g num">$49,825 - $106,250</div></div>
      <div class="band on"><div class="r">12%</div><div class="t"><i style="width:79%"></i></div><div class="g num">$12,250 - $49,825</div></div>
      <div class="band"><div class="r">10%</div><div class="t"><i style="width:100%"></i></div><div class="g num">$0 - $12,250</div></div>
    </div>
  </div>

The classes:

  card         a white panel. Wrap most things in one. <div class="label"> for its heading.
  lead         one big number the answer turns on. Inside <div class="lead-row"> with a chip beside it.
  figs         a row of 2-4 related figures. <div class="figs"><div><div class="label">..</div><div class="v">..</div></div>..</div>
  band         one rung of a rate ladder: <div class="band on"><div class="r">12%</div><div class="t"><i style="width:79%"></i></div><div class="g">$12,250 - $49,825</div></div>. Add "on" to the rung they're in.
  meter        <div class="meter"><i style="width:54%"></i></div>, how much of something is used.
  opt          one option: <div class="opt"><div><h4>..</h4><p>..</p></div><div class="w">..</div></div>. Several make the options list.
  ba           before and after: <div class="ba"><div class="s now">..</div><div class="mid">-></div><div class="s next">..</div></div>, each with .label and .v.
  ev           one point on a timeline: <div class="ev now"><div class="d">15 Sep</div><div class="m"></div><div class="b">Title<em>detail</em></div></div>. Add "done" or "now".
  cd           a countdown: <div class="cd"><b>96</b><span>days</span></div>.
  split        a total divided up: <div class="split"><i style="width:42%;background:var(--accent)"></i>..</div>, then <div class="legend"> rows of <b> swatch, name, .pct, .amt. Slices of one total are shades of the same blue in this order — var(--accent), var(--accent-2), var(--accent-3), var(--ink-4) — never green/red/amber, which mean good and bad rather than first and second.
  table        thead/tbody. class="r" on right-aligned cells, .tick on symbols, .none for a missing value.
  callout      one fact pulled out, with a .v number inside.
  step         a numbered instruction: <div class="step"><div class="i">1</div><div><h4>..</h4><p>..</p></div></div>.
  quote        a company header: <div class="quote"><div><div class="t">NVDA</div><div class="sub">..</div></div><div><div class="p">$198.32</div>..</div></div>.
  range        where a value sits in a span, with .cap and .pin positioned by left:%, and an .ends row beneath.
  stats        a grid of standing figures, each <div><div class="k">..</div><div class="v">..</div></div>.
  def          a term explained in plain words, with the jargon in a <span class="term"> underneath.
  caveat       a condition attached to a number: <div class="caveat"><div class="i">!</div><div>..</div></div>.
  row          one line of a status list: <div class="row"><i style="background:var(--pos)"></i><span>..</span><span class="v">..</span></div>.
  chip         a small tag. Add "p" green, "h" amber, "n" red, "a" blue.
  mek          brackets drawn to scale, when the point is how BIG each band is. Each rung is <div class="m"><div class="r">12%</div><div class="bar" style="height:36px"><i class="keep" style="width:88%"></i><i class="tax" style="width:12%"></i></div></div> inside a <div class="mek">, where the bar's height is proportional to the band's width in dollars. The deduction is the top rung at 0%, all keep. Close with a <div class="cap"> legend inside the same .mek.
  fall         a waterfall, when one number becomes another through additions and subtractions. Each step is <div class="s sub"><div class="t"><b style="top:37%;height:7%"></b></div><div class="k">Federal tax<em>-$2,947</em></div></div> inside <div class="fall">. top and height are percentages of the first bar; "sub" subtracts, "add" adds, "total" is a subtotal, no class is the opening figure.
  scen         three or more ways it could go: <div class="scen"><div class="s on"><div class="label">In 96 days</div><div class="v">$0</div><div class="l"><span>Term</span><span>Long</span></div>..</div>..</div>. Use "on" only for the one the user asked about, never to recommend one.
  bars         two or three things measured the same way, figure above each bar: <div class="bars"><div class="b"><em>+$848</em><i style="height:62%"></i><span>You</span></div><div class="b alt"><em>+$734</em><i style="height:54%"></i><span>S&P 500</span></div></div>.
  alloc        what a total is spread across: <div class="alloc"><div class="donut" style="background:conic-gradient(var(--accent) 0 49%, var(--accent-2) 49% 69%, var(--accent-3) 69% 84%, var(--ink-4) 84% 100%)"><div class="c"><b>9</b><span>positions</span></div></div><div class="legend">..</div></div>. Segments must run in that colour order and the percentages must be cumulative.
  spark        a tiny trend, inside a figure or a table cell: <svg class="spark p" viewBox="0 0 100 26" preserveAspectRatio="none"><polyline points="0,20 50,12 100,4"/></svg>. y runs 0 at the top to 26 at the bottom. Add "p" for a rising line, "n" for a falling one.
  plot         a price line with the things that happened on it. Put the <svg> and then <div class="mark buy" style="left:22%;top:64%"></div> and <div class="tag" style="left:22%;top:74%">You bought</div> inside <div class="plot">, and an <div class="axis"> underneath.
  recon        their figure against yours: a <div class="recon head"> row of labels, then <div class="recon"><span class="tick">NVDA</span><span>$317.92</span><span>$353.96</span><span class="d neg">-$36.04</span></div> per line.
  unknown      when the honest answer is that we can't say: <div class="unknown"><h4>..</h4><p>..</p><span class="fix">what would fix it →</span></div>. Reach for this instead of writing 0 or leaving a figure out silently.

The panel responds to a pointer. Use these to keep a layout calm at rest while still carrying the detail — put the secondary figure behind an interaction rather than dropping it or giving it a whole row:

  work         the arithmetic, folded away: <details class="work"><summary>Show the working</summary><div class="body"><div class="l"><span>Gross pay</span><span class="num">$42,425</span></div>..<div class="l total"><span>Total</span><span class="num">$7,046</span></div></div></details>. Add this whenever a headline figure is the result of a calculation — it is how someone checks you rather than trusts you.
  hint         a label that appears on hover. Put class="hint" on the thing and <span class="tip">Federal · $2,956</span> inside it. Good on split segments, donut legends and chips.
  peek         a detail that fades in when its row is pointed at: <span class="peek">· since 15 Jan</span> inside a table row, band or status row.
  pt           a readable point on a price line: <div class="pt hint" style="left:45%;top:44%"><span class="tip">Nov 2025 · $147.80</span></div> inside .plot.
  swap         the same figures two ways — dollars or share. <div class="swap"><input type="radio" name="X" id="a" checked><input type="radio" name="X" id="b"><div class="tabs"><label for="a">Dollars</label><label for="b">Share</label></div><div class="view-a">..</div><div class="view-b">..</div></div>. The first input drives .view-a and the second .view-b; give every swap in the panel its own radio name and its own pair of ids.

Put class="num" on every element containing figures so they align. Colour meaning with class pos / neg / hold / muted / faint, never a hard-coded hex. Colour is never the only signal a number is up or down: add class "up" or "down" for an arrow, or write the sign. Mark a figure you calculated rather than read with <span class="est">estimate</span>. If you need a colour, use var(--accent), var(--pos), var(--neg), var(--hold), var(--ink-3), var(--line). Keep it to about 640px wide. No scripts, no images, no external anything. SVG is fine and is the way to draw a chart — a line chart is an area path at 0.18 opacity under a 2px stroke in var(--accent).`,
      input_schema: {
        type: 'object' as const,
        properties: {
          title: {
            type: 'string',
            description: 'Short label for the top of the panel, e.g. "NVDA, broken down"',
          },
          subtitle: {
            type: 'string',
            description: 'Optional one-phrase qualifier, e.g. "as of today" or "2026"',
          },
          html: {
            type: 'string',
            description:
              'Self-contained HTML fragment. No <html>, <head> or <body> wrapper, no scripts.',
          },
        },
        required: ['title', 'html'],
      },
    },
    execute: async (input, _ctx) => {
      const html = typeof input.html === 'string' ? input.html : '';
      if (html.length === 0) {
        return { available: false, reason: 'No markup supplied.' };
      }
      // The catalogue only holds if it's enforced. Left as advice, the model
      // reliably reinvents its own classes, and every answer comes out looking
      // like a different product.
      if (/<style[\s>]/i.test(html)) {
        return {
          available: false,
          reason:
            'That fragment declares its own styles. Rebuild it from the classes in the catalogue — card, lead, figs, band, mek, fall, meter, opt, ba, scen, bars, alloc, spark, ev, cd, split, table, recon, callout, step, quote, plot, range, stats, def, caveat, unknown, row, chip — with no <style> block.',
        };
      }
      if (html.length > MAX_PANEL_HTML) {
        return {
          available: false,
          reason: `That layout is too large (${html.length} characters). Keep it under ${MAX_PANEL_HTML}.`,
        };
      }
      // The client renders this sandboxed; the server's job is only to carry it
      return {
        available: true,
        title: typeof input.title === 'string' ? input.title : 'Answer',
        subtitle: typeof input.subtitle === 'string' ? input.subtitle : null,
        html,
      };
    },
  },

  // 15. prepare_export
  {
    definition: {
      name: 'prepare_export',
      description:
        "Prepare a document the user can download: a Form 8949 worksheet of the year's realized gains, or a cost-basis report of current positions. Returns what the document will contain and where to download it. Use when the user asks for something to give an accountant, to file with, or to keep.",
      input_schema: {
        type: 'object' as const,
        properties: {
          kind: {
            type: 'string',
            enum: ['form-8949', 'cost-basis'],
            description:
              "'form-8949' for realized gains in the shape the tax form expects; 'cost-basis' for what is currently held and what it cost",
          },
          taxYear: {
            type: 'number',
            description: 'Tax year for form-8949 (defaults to the current year)',
          },
        },
        required: ['kind'],
      },
    },
    execute: async (input, ctx) => {
      const kind = input.kind === 'cost-basis' ? 'cost-basis' : 'form-8949';
      const taxYear = (input.taxYear as number | undefined) ?? new Date().getFullYear();

      if (kind === 'form-8949') {
        const rows = await loadTrades(ctx);
        if (rows.length === 0) {
          return {
            available: false,
            reason:
              'No trade history imported, so there are no realized gains to report. Connect a brokerage or upload statements first.',
          };
        }
        const summary = computeRealizedGains(rows, taxYear);
        const reportable = buildForm8949Rows(summary.sales);
        if (reportable.length === 0) {
          return {
            available: false,
            reason: `No sales with a known cost basis in ${taxYear} — nothing to report on Form 8949.`,
          };
        }
        return {
          available: true,
          kind,
          taxYear,
          rowCount: reportable.length,
          shortTermGain: summary.shortTermGain,
          longTermGain: summary.longTermGain,
          washDisallowed: summary.washDisallowed,
          downloadPath: `/api/exports/form-8949?workspaceId=${ctx.workspaceId}&taxYear=${taxYear}`,
        };
      }

      const positions = await ctx.db
        .select()
        .from(holdings)
        .where(and(eq(holdings.workspaceId, ctx.workspaceId), eq(holdings.userId, ctx.userId)));
      if (positions.length === 0) {
        return { available: false, reason: 'No positions to report on.' };
      }
      const known = positions.filter((h) => h.costBasis !== null && h.costBasis > 0);
      return {
        available: true,
        kind,
        rowCount: positions.length,
        basisKnownCount: known.length,
        downloadPath: `/api/exports/cost-basis?workspaceId=${ctx.workspaceId}`,
      };
    },
  },

  // 15. pre_trade_check
  {
    definition: {
      name: 'pre_trade_check',
      description:
        "Check the consequences of selling a position BEFORE the user does it: per-lot holding periods (short vs long, days until long-term), estimated gain at the current value, the estimated tax at the user's rates, and wash-sale warnings. Always run this when the user is considering selling something.",
      input_schema: {
        type: 'object' as const,
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol of the position to sell' },
          units: {
            type: 'number',
            description: 'Units to sell (defaults to the whole position)',
          },
        },
        required: ['symbol'],
      },
    },
    execute: async (input, ctx) => {
      const symbol = (input.symbol as string).toUpperCase();
      const requestedUnits = input.units as number | undefined;
      return preTradeCheck(ctx, symbol, requestedUnits);
    },
  },

  // ─── G2 · The filing engine's four hands ──────────────────────────
  // None of these compute anything. They record what the person said,
  // read what the engine decided, and hand back its reasoning verbatim.

  // 16. record_fact
  {
    definition: {
      name: 'record_fact',
      description: `Record something the user just told you about their year, so the filing engine can use it. Fact ids come from a closed registry — an id outside it is rejected, with the nearest real ones returned so you can correct yourself.

Record ONLY what the user actually stated in this conversation. Never record a figure you read off a document, inferred, or calculated: documents are extracted separately and a recorded guess is indistinguishable from a fact once it is written.

Send the value as a plain value — true/false for yes/no facts, a number for amounts, "YYYY-MM-DD" for dates, a string otherwise. Send null when the user says they don't know: that is a real answer the engine uses, not a missing argument.`,
      input_schema: {
        type: 'object' as const,
        properties: {
          factId: {
            type: 'string',
            description:
              "Fact id from the registry, e.g. 'state-of-residence', 'rent-months-california', 'unreported-tips'.",
          },
          value: {
            description: "The value as the user gave it. null means they said they don't know.",
          },
          taxYear: { type: 'number', description: 'Tax year (defaults to the desk year)' },
        },
        required: ['factId'],
      },
    },
    execute: async (input, ctx) => {
      return recordFactTool(
        ctx.db,
        { userId: ctx.userId, workspaceId: ctx.workspaceId },
        {
          factId: input.factId,
          value: 'value' in input ? input.value : null,
          taxYear: resolveTaxYear(input, ctx),
          conversationId: ctx.conversationId ?? null,
        },
      );
    },
  },

  // 17. get_readiness
  {
    definition: {
      name: 'get_readiness',
      description:
        "Where a tax year stands: the verdict (ready / ready-with-cautions / blocked / not-started), every line with its status, what is blocking, any contradiction between two sources, and the unanswered questions ranked by what they are worth. This is the engine's own assessment — use it for 'am I ready to file', 'what's left', 'what should I look at'.",
      input_schema: {
        type: 'object' as const,
        properties: {
          taxYear: { type: 'number', description: 'Tax year (defaults to the desk year)' },
        },
        required: [],
      },
    },
    execute: async (input, ctx) =>
      getReadinessTool(
        ctx.db,
        { userId: ctx.userId, workspaceId: ctx.workspaceId },
        resolveTaxYear(input, ctx),
      ),
  },

  // 18. price_unknown
  {
    definition: {
      name: 'price_unknown',
      description: `What it is worth to find something out, in dollars. With a factId, the engine evaluates the whole year both ways and returns the two branches and the difference between them. Without one, it returns the outstanding questions ranked by that difference.

Use it whenever the user doesn't know an answer, or asks what matters most. Both branches are returned and neither is likely — pricing an unknown is never deciding it. A branch that cannot compute at all is reported in blockedDiffers, which is worth more than a $0 delta suggests.`,
      input_schema: {
        type: 'object' as const,
        properties: {
          factId: {
            type: 'string',
            description: 'Price this one fact. Omit for the ranked list.',
          },
          taxYear: { type: 'number', description: 'Tax year (defaults to the desk year)' },
        },
        required: [],
      },
    },
    execute: async (input, ctx) =>
      priceUnknownTool(
        ctx.db,
        { userId: ctx.userId, workspaceId: ctx.workspaceId },
        resolveTaxYear(input, ctx),
        input.factId,
      ),
  },

  // 19. explain_determination
  {
    definition: {
      name: 'explain_determination',
      description: `Why the engine decided something: the rule it applied, the authority behind it, each step of the test with the value it saw, and any caveats. Names: residency, dependency, filing-status, penalty, education, savers-credit, premium-tax-credit, self-employment, capital-gains, tips-overtime, nonresident, treaties, state, multi-state.

Use this before explaining any determination. Quote the citation exactly as returned — never restate it from memory, and never cite a publication this has not given you.`,
      input_schema: {
        type: 'object' as const,
        properties: {
          determination: {
            type: 'string',
            description: "Which determination to explain, e.g. 'residency' or 'state'.",
          },
          taxYear: { type: 'number', description: 'Tax year (defaults to the desk year)' },
        },
        required: ['determination'],
      },
    },
    execute: async (input, ctx) =>
      explainDeterminationTool(
        ctx.db,
        { userId: ctx.userId, workspaceId: ctx.workspaceId },
        resolveTaxYear(input, ctx),
        input.determination,
      ),
  },
];

/**
 * The year a filing tool works on. The desk the conversation is happening
 * in wins over the calendar: someone doing their 2025 return in April 2026
 * means 2025 every time they say "last year".
 */
function resolveTaxYear(input: Record<string, unknown>, ctx: ToolContext): number {
  const given = input.taxYear;
  if (typeof given === 'number' && Number.isInteger(given) && given >= 2000 && given <= 2100) {
    return given;
  }
  return ctx.taxYear ?? new Date().getFullYear();
}

export function getToolDefinitions(): Tool[] {
  return TOOLS.map((t) => t.definition);
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  const tool = TOOLS.find((t) => t.definition.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.execute(input, ctx);
}

// ─── Safety Guardrails ──────────────────────────────────────────────

function truncateForLog(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string' && v.length > 200) out[k] = v.slice(0, 200) + '…';
    else if (Array.isArray(v) && v.length > 5) out[k] = [...v.slice(0, 5), `…(${v.length} total)`];
    else out[k] = v;
  }
  return out;
}

function filterVaultData(obj: Record<string, unknown>): Record<string, unknown> {
  const REDACTED = '[encrypted — not accessible via AI]';
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'ciphertext' || k === 'iv') {
      out[k] = REDACTED;
    } else if (typeof v === 'string' && v.length >= 200 && /^[A-Za-z0-9+/=]+$/.test(v)) {
      out[k] = REDACTED;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = filterVaultData(v as Record<string, unknown>);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? filterVaultData(item as Record<string, unknown>)
          : item,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function safeExecuteTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: Record<string, unknown>; isError: boolean }> {
  // Validate name
  if (!name || typeof name !== 'string') {
    return { result: { error: 'Invalid tool name' }, isError: true };
  }

  // Validate input is a non-null, non-array object
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { result: { error: 'Invalid tool input: expected an object' }, isError: true };
  }

  // UUID validation for ID fields
  for (const field of ['itemId', 'fromItemId', 'toItemId']) {
    if (
      field in input &&
      typeof input[field] === 'string' &&
      !UUID_RE.test(input[field] as string)
    ) {
      return { result: { error: `Invalid ${field}: must be a valid UUID` }, isError: true };
    }
  }

  console.log('[AI Tool] Executing:', name, { input: truncateForLog(input) });
  const start = Date.now();

  try {
    const result = await executeTool(name, input, ctx);
    const durationMs = Date.now() - start;
    console.log('[AI Tool]', name, 'completed in', durationMs + 'ms');
    return { result: filterVaultData(result), isError: false };
  } catch (err) {
    const durationMs = Date.now() - start;
    console.error('[AI Tool]', name, 'failed in', durationMs + 'ms', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      result: {
        error: 'Internal error executing tool. Please try again or use a different approach.',
      },
      isError: true,
    };
  }
}
