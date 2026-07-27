import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DB } from '../db';
import {
  accounts,
  budgetCategories,
  budgetGroups,
  canvasConnections,
  canvasItems,
  debts,
  entities,
  entityEdges,
  entityMentions,
  holdings,
  invoiceLineItems,
  invoices,
  marketBars,
  networthCategories,
  networthEntries,
  receipts,
  subscriptions,
  workspaces,
} from '../db/schema';
import { findNextPosition } from './auto-position';
import { ITEM_DEFAULTS, createDefaultData, defaultNames } from './canvas-defaults';
import { findUnmatchedTransactions } from './reconciliation';
// Lazy import to avoid loading OpenAI SDK at server startup
const lazySearchDocuments = () => import('./vector-search').then((m) => m.searchDocuments);
import {
  computeBreakeven,
  computeDepreciation,
  computeLoan,
  computeProjection,
  computeRentVsBuy,
  computeTaxEstimate,
  createDefaultBreakevenData,
  createDefaultDebtPlannerData,
  createDefaultDepreciationData,
  createDefaultLoanCalculatorData,
  createDefaultProjectionData,
  createDefaultRentVsBuyData,
  createDefaultTaxEstimatorData,
  simulateDebtPaydown,
} from '../lib/calc';
import type {
  BreakevenCardData,
  Debt,
  DepreciationCardData,
  LoanCalculatorData,
  ProjectionCardData,
  RentVsBuyCardData,
  TaxEstimatorData,
} from '../lib/calc';

export interface ToolContext {
  db: DB;
  userId: string;
  workspaceId: string;
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
        table:
          | typeof accounts
          | typeof budgetCategories
          | typeof subscriptions
          | typeof invoices
          | typeof debts
          | typeof holdings
          | typeof networthCategories,
      ) => {
        const rows = await ctx.db
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.workspaceId, ctx.workspaceId), eq(table.userId, ctx.userId)));
        return rows.length;
      };

      const [accts, budgets, subs, invs, dts, hlds, nwCats, items] = await Promise.all([
        countTable(accounts),
        countTable(budgetCategories),
        countTable(subscriptions),
        countTable(invoices),
        countTable(debts),
        countTable(holdings),
        countTable(networthCategories),
        ctx.db
          .select({ id: canvasItems.id })
          .from(canvasItems)
          .where(
            and(eq(canvasItems.workspaceId, ctx.workspaceId), eq(canvasItems.userId, ctx.userId)),
          )
          .then((r) => r.length),
      ]);

      return {
        name: workspace.name,
        type: workspace.type,
        counts: {
          accounts: accts,
          budgetCategories: budgets,
          subscriptions: subs,
          invoices: invs,
          debts: dts,
          holdings: hlds,
          networthCategories: nwCats,
          canvasItems: items,
        },
      };
    },
  },

  // 2. get_canvas_items
  {
    definition: {
      name: 'get_canvas_items',
      description: 'List canvas items in the workspace, optionally filtered by type.',
      input_schema: {
        type: 'object' as const,
        properties: {
          type: { type: 'string', description: 'Filter by item type (e.g. "note", "budget-card")' },
        },
        required: [],
      },
    },
    execute: async (input, ctx) => {
      const conditions = [
        eq(canvasItems.workspaceId, ctx.workspaceId),
        eq(canvasItems.userId, ctx.userId),
      ];
      if (input.type) conditions.push(eq(canvasItems.type, input.type as string));

      const rows = await ctx.db
        .select({ id: canvasItems.id, type: canvasItems.type, name: canvasItems.name })
        .from(canvasItems)
        .where(and(...conditions))
        .limit(100);

      if (rows.length === 0) return { items: [], message: 'No canvas items found' };
      return { items: rows };
    },
  },

  // 3. get_item_data
  {
    definition: {
      name: 'get_item_data',
      description: 'Get the full data payload of a specific canvas item by ID.',
      input_schema: {
        type: 'object' as const,
        properties: { itemId: { type: 'string', description: 'The canvas item ID' } },
        required: ['itemId'],
      },
    },
    execute: async (input, ctx) => {
      const [row] = await ctx.db
        .select({
          id: canvasItems.id,
          type: canvasItems.type,
          name: canvasItems.name,
          data: canvasItems.data,
        })
        .from(canvasItems)
        .where(
          and(
            eq(canvasItems.id, input.itemId as string),
            eq(canvasItems.workspaceId, ctx.workspaceId),
            eq(canvasItems.userId, ctx.userId),
          ),
        );

      if (!row) return { error: 'Item not found' };
      return {
        id: row.id,
        type: row.type,
        name: row.name,
        data: row.data ? JSON.parse(row.data) : null,
      };
    },
  },

  // 4. get_accounts
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

  // 5. get_budget
  {
    definition: {
      name: 'get_budget',
      description: 'Get all budget categories with budgeted and actual amounts.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    execute: async (_input, ctx) => {
      const rows = await ctx.db
        .select({
          id: budgetCategories.id,
          name: budgetCategories.name,
          budgeted: budgetCategories.budgeted,
          actual: budgetCategories.actual,
        })
        .from(budgetCategories)
        .where(
          and(
            eq(budgetCategories.workspaceId, ctx.workspaceId),
            eq(budgetCategories.userId, ctx.userId),
          ),
        );

      return { categories: rows };
    },
  },

  // 6. get_invoices
  {
    definition: {
      name: 'get_invoices',
      description: 'List invoices with computed totals, optionally filtered by status.',
      input_schema: {
        type: 'object' as const,
        properties: {
          status: { type: 'string', description: 'Filter by status (draft/sent/paid/overdue)' },
        },
        required: [],
      },
    },
    execute: async (input, ctx) => {
      const conditions = [
        eq(invoices.workspaceId, ctx.workspaceId),
        eq(invoices.userId, ctx.userId),
      ];
      if (input.status) conditions.push(eq(invoices.status, input.status as string));

      const invRows = await ctx.db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          date: invoices.date,
          dueDate: invoices.dueDate,
          status: invoices.status,
          taxRate: invoices.taxRate,
        })
        .from(invoices)
        .where(and(...conditions))
        .limit(50);

      if (invRows.length === 0) return { invoices: [] };

      // Batch fetch line items for all matching invoices
      const invoiceIds = invRows.map((i) => i.id);
      const allLineItems = await ctx.db
        .select({
          invoiceId: invoiceLineItems.invoiceId,
          description: invoiceLineItems.description,
          quantity: invoiceLineItems.quantity,
          unitPrice: invoiceLineItems.unitPrice,
        })
        .from(invoiceLineItems);

      // Group line items by invoice
      const lineItemsByInvoice = new Map<string, typeof allLineItems>();
      for (const li of allLineItems) {
        if (!invoiceIds.includes(li.invoiceId)) continue;
        const existing = lineItemsByInvoice.get(li.invoiceId) ?? [];
        existing.push(li);
        lineItemsByInvoice.set(li.invoiceId, existing);
      }

      const result = invRows.map((inv) => {
        const items = lineItemsByInvoice.get(inv.id) ?? [];
        const subtotal = items.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
        const total = subtotal * (1 + inv.taxRate / 100);
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          date: inv.date,
          dueDate: inv.dueDate,
          status: inv.status,
          subtotal,
          total,
          lineItems: items.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
          })),
        };
      });

      return { invoices: result };
    },
  },

  // 7. get_receipts
  {
    definition: {
      name: 'get_receipts',
      description: 'List receipts in the workspace.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    execute: async (_input, ctx) => {
      const rows = await ctx.db
        .select({
          id: receipts.id,
          merchant: receipts.merchant,
          amount: receipts.amount,
          date: receipts.date,
          paymentMethod: receipts.paymentMethod,
          status: receipts.status,
        })
        .from(receipts)
        .where(and(eq(receipts.workspaceId, ctx.workspaceId), eq(receipts.userId, ctx.userId)))
        .limit(100);

      return { receipts: rows };
    },
  },

  // 8. get_subscriptions
  {
    definition: {
      name: 'get_subscriptions',
      description: 'List subscriptions, optionally filtered by status.',
      input_schema: {
        type: 'object' as const,
        properties: {
          status: { type: 'string', description: 'Filter by status (active/paused/cancelled)' },
        },
        required: [],
      },
    },
    execute: async (input, ctx) => {
      const conditions = [
        eq(subscriptions.workspaceId, ctx.workspaceId),
        eq(subscriptions.userId, ctx.userId),
      ];
      if (input.status) conditions.push(eq(subscriptions.status, input.status as string));

      const rows = await ctx.db
        .select({
          id: subscriptions.id,
          name: subscriptions.name,
          amount: subscriptions.amount,
          frequency: subscriptions.frequency,
          status: subscriptions.status,
        })
        .from(subscriptions)
        .where(and(...conditions))
        .limit(100);

      return { subscriptions: rows };
    },
  },

  // 9. get_holdings
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

  // 10. get_debts
  {
    definition: {
      name: 'get_debts',
      description: 'List debts with balances and interest rates.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    execute: async (_input, ctx) => {
      const rows = await ctx.db
        .select({
          id: debts.id,
          name: debts.name,
          balance: debts.balance,
          annualInterestRate: debts.annualInterestRate,
          minimumPayment: debts.minimumPayment,
        })
        .from(debts)
        .where(and(eq(debts.workspaceId, ctx.workspaceId), eq(debts.userId, ctx.userId)))
        .orderBy(desc(debts.balance))
        .limit(50);

      return { debts: rows };
    },
  },

  // 11. get_networth
  {
    definition: {
      name: 'get_networth',
      description: 'Get net worth breakdown with categories, entries, and totals.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    execute: async (_input, ctx) => {
      const cats = await ctx.db
        .select({
          id: networthCategories.id,
          name: networthCategories.name,
          kind: networthCategories.kind,
        })
        .from(networthCategories)
        .where(
          and(
            eq(networthCategories.workspaceId, ctx.workspaceId),
            eq(networthCategories.userId, ctx.userId),
          ),
        );

      const entries = await ctx.db
        .select({
          id: networthEntries.id,
          name: networthEntries.name,
          categoryId: networthEntries.categoryId,
          value: networthEntries.value,
        })
        .from(networthEntries)
        .where(
          and(
            eq(networthEntries.workspaceId, ctx.workspaceId),
            eq(networthEntries.userId, ctx.userId),
          ),
        );

      // Group entries by category
      const entriesByCat = new Map<string, typeof entries>();
      for (const e of entries) {
        const existing = entriesByCat.get(e.categoryId) ?? [];
        existing.push(e);
        entriesByCat.set(e.categoryId, existing);
      }

      let totalAssets = 0;
      let totalLiabilities = 0;

      const categories = cats.map((c) => {
        const catEntries = entriesByCat.get(c.id) ?? [];
        const sum = catEntries.reduce((s, e) => s + e.value, 0);
        if (c.kind === 'asset') totalAssets += sum;
        else if (c.kind === 'liability') totalLiabilities += sum;
        return {
          id: c.id,
          name: c.name,
          kind: c.kind,
          entries: catEntries.map((e) => ({ id: e.id, name: e.name, value: e.value })),
        };
      });

      return {
        categories,
        totalAssets,
        totalLiabilities,
        netWorth: totalAssets - totalLiabilities,
      };
    },
  },

  // 12. get_market_data
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

  // 13. create_canvas_item
  {
    definition: {
      name: 'create_canvas_item',
      description:
        'Create a new canvas item in the workspace. Auto-positions below existing items.',
      input_schema: {
        type: 'object' as const,
        properties: {
          type: {
            type: 'string',
            description: 'Item type (e.g. "note", "budget-card", "kpi-card")',
          },
          name: { type: 'string', description: 'Optional display name for the item' },
          data: {
            type: 'object',
            description: 'Optional data payload for the item. For notes, pass { text: "content" }.',
          },
        },
        required: ['type'],
      },
    },
    execute: async (input, ctx) => {
      const type = input.type as string;
      const defaults = ITEM_DEFAULTS[type];
      if (!defaults) {
        return {
          error: `Invalid item type "${type}". Valid types: ${Object.keys(ITEM_DEFAULTS).join(', ')}`,
        };
      }

      const { width, height } = defaults;

      // Get existing items for positioning
      const existingItems = await ctx.db
        .select({
          x: canvasItems.x,
          y: canvasItems.y,
          width: canvasItems.width,
          height: canvasItems.height,
        })
        .from(canvasItems)
        .where(
          and(eq(canvasItems.workspaceId, ctx.workspaceId), eq(canvasItems.userId, ctx.userId)),
        );

      const { x, y } = findNextPosition(existingItems, width, height);

      // Get max zIndex
      const [maxZ] = await ctx.db
        .select({ maxZIndex: sql<number>`COALESCE(MAX(${canvasItems.zIndex}), 0)` })
        .from(canvasItems)
        .where(
          and(eq(canvasItems.workspaceId, ctx.workspaceId), eq(canvasItems.userId, ctx.userId)),
        );
      const zIndex = (maxZ?.maxZIndex ?? 0) + 1;

      const name = (input.name as string | undefined) ?? defaultNames[type] ?? 'Untitled';
      const defaultData = createDefaultData(type);
      const inputData = input.data as Record<string, unknown> | undefined;
      const data = inputData ? { ...defaultData, ...inputData } : defaultData;

      const id = crypto.randomUUID();
      await ctx.db.insert(canvasItems).values({
        id,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        type,
        name,
        x,
        y,
        width,
        height,
        zIndex,
        data: data ? JSON.stringify(data) : undefined,
      });

      return {
        id,
        type,
        name,
        x,
        y,
        width,
        height,
        zIndex,
        data: data ?? null,
        _canvasUpdate: true,
      };
    },
  },

  // 14. update_canvas_item
  {
    definition: {
      name: 'update_canvas_item',
      description: 'Update the name and/or data of an existing canvas item.',
      input_schema: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'The canvas item ID to update' },
          name: { type: 'string', description: 'New display name' },
          data: { type: 'object', description: 'New data payload (full replacement)' },
        },
        required: ['itemId'],
      },
    },
    execute: async (input, ctx) => {
      const itemId = input.itemId as string;

      const [existing] = await ctx.db
        .select()
        .from(canvasItems)
        .where(
          and(
            eq(canvasItems.id, itemId),
            eq(canvasItems.workspaceId, ctx.workspaceId),
            eq(canvasItems.userId, ctx.userId),
          ),
        );

      if (!existing) return { error: 'Item not found' };

      const updates: Partial<{ name: string; data: string }> = {};
      if (input.name !== undefined) updates.name = input.name as string;
      if (input.data !== undefined) updates.data = JSON.stringify(input.data);

      if (Object.keys(updates).length > 0) {
        await ctx.db.update(canvasItems).set(updates).where(eq(canvasItems.id, itemId));
      }

      const newName = updates.name ?? existing.name;
      const newData = input.data ?? (existing.data ? JSON.parse(existing.data) : null);

      return {
        id: existing.id,
        type: existing.type,
        name: newName,
        x: existing.x,
        y: existing.y,
        width: existing.width,
        height: existing.height,
        zIndex: existing.zIndex,
        data: newData,
        _canvasUpdate: true,
      };
    },
  },

  // 15. create_connection
  {
    definition: {
      name: 'create_connection',
      description: 'Create a bezier connection between two canvas items.',
      input_schema: {
        type: 'object' as const,
        properties: {
          fromItemId: { type: 'string', description: 'Source item ID' },
          fromAnchor: {
            type: 'string',
            description: 'Source anchor point (top/right/bottom/left)',
          },
          toItemId: { type: 'string', description: 'Target item ID' },
          toAnchor: { type: 'string', description: 'Target anchor point (top/right/bottom/left)' },
        },
        required: ['fromItemId', 'fromAnchor', 'toItemId', 'toAnchor'],
      },
    },
    execute: async (input, ctx) => {
      const fromItemId = input.fromItemId as string;
      const toItemId = input.toItemId as string;
      const fromAnchor = input.fromAnchor as string;
      const toAnchor = input.toAnchor as string;

      if (fromItemId === toItemId) {
        return { error: 'Cannot connect an item to itself' };
      }

      const items = await ctx.db
        .select({ id: canvasItems.id })
        .from(canvasItems)
        .where(
          and(
            inArray(canvasItems.id, [fromItemId, toItemId]),
            eq(canvasItems.workspaceId, ctx.workspaceId),
            eq(canvasItems.userId, ctx.userId),
          ),
        );

      const foundIds = new Set(items.map((i) => i.id));
      if (!foundIds.has(fromItemId) || !foundIds.has(toItemId)) {
        const missing = [fromItemId, toItemId].filter((id) => !foundIds.has(id));
        return { error: `Item(s) not found: ${missing.join(', ')}` };
      }

      const id = crypto.randomUUID();
      await ctx.db.insert(canvasConnections).values({
        id,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        fromItemId,
        fromAnchor,
        toItemId,
        toAnchor,
      });

      return { id, fromItemId, fromAnchor, toItemId, toAnchor, _canvasUpdate: true };
    },
  },

  // 16. position_items
  {
    definition: {
      name: 'position_items',
      description: 'Reposition one or more canvas items to specific coordinates.',
      input_schema: {
        type: 'object' as const,
        properties: {
          positions: {
            type: 'array',
            description: 'Array of items to reposition',
            items: {
              type: 'object',
              properties: {
                itemId: { type: 'string', description: 'Canvas item ID' },
                x: { type: 'number', description: 'New x coordinate' },
                y: { type: 'number', description: 'New y coordinate' },
              },
              required: ['itemId', 'x', 'y'],
            },
          },
        },
        required: ['positions'],
      },
    },
    execute: async (input, ctx) => {
      const positions = input.positions as Array<{ itemId: string; x: number; y: number }>;
      if (!positions || positions.length === 0) return { updated: 0 };

      let count = 0;
      for (const pos of positions) {
        const result = await ctx.db
          .update(canvasItems)
          .set({ x: pos.x, y: pos.y })
          .where(
            and(
              eq(canvasItems.id, pos.itemId),
              eq(canvasItems.workspaceId, ctx.workspaceId),
              eq(canvasItems.userId, ctx.userId),
            ),
          );
        if (result.changes > 0) count++;
      }

      return { updated: count, _canvasUpdate: true };
    },
  },

  // 17. delete_canvas_item
  {
    definition: {
      name: 'delete_canvas_item',
      description: 'Delete a canvas item (requires manual confirmation).',
      input_schema: {
        type: 'object' as const,
        properties: {
          itemId: { type: 'string', description: 'The canvas item ID to delete' },
        },
        required: ['itemId'],
      },
    },
    execute: async (_input, _ctx) => {
      return {
        error:
          'Deleting canvas items requires manual confirmation. Please ask the user to delete it themselves.',
      };
    },
  },

  // ─── Calculation Tools (18–24) ─────────────────────────────────────

  // 18. calculate_tax
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
          investmentIncome: { type: 'number', description: 'Investment income' },
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

  // 19. calculate_loan
  {
    definition: {
      name: 'calculate_loan',
      description: 'Calculate mortgage/loan amortization schedule with monthly payment breakdown.',
      input_schema: {
        type: 'object' as const,
        properties: {
          homePrice: { type: 'number', description: 'Home/asset price' },
          downPaymentPercent: {
            type: 'number',
            description: 'Down payment percentage (default 20)',
          },
          loanTermYears: { type: 'number', description: 'Loan term in years (default 30)' },
          annualInterestRate: {
            type: 'number',
            description: 'Annual interest rate as percentage (e.g. 6.5)',
          },
          startDate: { type: 'string', description: 'Start date as ISO month "YYYY-MM"' },
          annualPropertyTax: { type: 'number', description: 'Annual property tax in dollars' },
          annualInsurance: { type: 'number', description: 'Annual insurance in dollars' },
          monthlyHOA: { type: 'number', description: 'Monthly HOA fee' },
          pmiRatePercent: { type: 'number', description: 'PMI rate percentage' },
          extraMonthlyPayment: { type: 'number', description: 'Extra monthly payment amount' },
        },
        required: ['homePrice', 'annualInterestRate'],
      },
    },
    execute: async (input, _ctx) => {
      const data = { ...createDefaultLoanCalculatorData(), ...input } as LoanCalculatorData;
      const result = computeLoan(data);
      const { rows, truncated, totalRows } = truncateSchedule(result.schedule);
      return {
        loanAmount: result.loanAmount,
        monthlyPI: result.monthlyPI,
        monthlyPropertyTax: result.monthlyPropertyTax,
        monthlyInsurance: result.monthlyInsurance,
        monthlyPMI: result.monthlyPMI,
        monthlyHOA: result.monthlyHOA,
        totalMonthlyPayment: result.totalMonthlyPayment,
        totalInterest: result.totalInterest,
        totalCost: result.totalCost,
        payoffDate: result.payoffDate,
        schedule: rows,
        scheduleTruncated: truncated,
        scheduleTotalRows: totalRows,
        withExtra: result.withExtra ?? null,
      };
    },
  },

  // 20. calculate_projection
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

  // 21. calculate_breakeven
  {
    definition: {
      name: 'calculate_breakeven',
      description:
        'Calculate break-even point given fixed costs, variable cost per unit, and price per unit.',
      input_schema: {
        type: 'object' as const,
        properties: {
          fixedCosts: { type: 'number', description: 'Total fixed costs' },
          variableCostPerUnit: { type: 'number', description: 'Variable cost per unit' },
          pricePerUnit: { type: 'number', description: 'Selling price per unit' },
        },
        required: ['fixedCosts', 'variableCostPerUnit', 'pricePerUnit'],
      },
    },
    execute: async (input, _ctx) => {
      const data = { ...createDefaultBreakevenData(), ...input } as BreakevenCardData;
      return computeBreakeven(data) as unknown as Record<string, unknown>;
    },
  },

  // 22. calculate_depreciation
  {
    definition: {
      name: 'calculate_depreciation',
      description:
        'Calculate asset depreciation schedule using straight-line, declining-balance, double-declining, or sum-of-years methods.',
      input_schema: {
        type: 'object' as const,
        properties: {
          assetCost: { type: 'number', description: 'Original cost of the asset' },
          salvageValue: { type: 'number', description: 'Salvage value at end of life (default 0)' },
          usefulLifeYears: { type: 'number', description: 'Useful life in years' },
          method: {
            type: 'string',
            description:
              'Depreciation method: straight-line, declining-balance, double-declining, sum-of-years (default straight-line)',
          },
        },
        required: ['assetCost', 'usefulLifeYears'],
      },
    },
    execute: async (input, _ctx) => {
      const data = { ...createDefaultDepreciationData(), ...input } as DepreciationCardData;
      return computeDepreciation(data) as unknown as Record<string, unknown>;
    },
  },

  // 23. calculate_rent_vs_buy
  {
    definition: {
      name: 'calculate_rent_vs_buy',
      description:
        'Compare renting vs buying a home over time. Returns yearly snapshots and a recommendation.',
      input_schema: {
        type: 'object' as const,
        properties: {
          monthlyRent: { type: 'number', description: 'Current monthly rent' },
          homePrice: { type: 'number', description: 'Home purchase price' },
          analysisYears: { type: 'number', description: 'Analysis period in years (default 10)' },
          downPaymentPercent: {
            type: 'number',
            description: 'Down payment percentage (default 20)',
          },
          annualInterestRate: {
            type: 'number',
            description: 'Mortgage interest rate (default 6.5)',
          },
          loanTermYears: { type: 'number', description: 'Loan term in years (default 30)' },
          annualRentIncrease: {
            type: 'number',
            description: 'Annual rent increase percentage (default 3)',
          },
          annualPropertyTax: { type: 'number', description: 'Annual property tax' },
          annualHomeInsurance: { type: 'number', description: 'Annual home insurance' },
          annualMaintenancePercent: {
            type: 'number',
            description: 'Annual maintenance as % of home value (default 1)',
          },
          annualHomeAppreciation: {
            type: 'number',
            description: 'Annual home appreciation percentage (default 3)',
          },
          annualInvestmentReturn: {
            type: 'number',
            description: 'Annual investment return percentage (default 7)',
          },
          closingCostPercent: {
            type: 'number',
            description: 'Closing cost as % of home price (default 3)',
          },
          sellingCostPercent: {
            type: 'number',
            description: 'Selling cost as % of home value (default 6)',
          },
        },
        required: ['monthlyRent', 'homePrice'],
      },
    },
    execute: async (input, _ctx) => {
      const data = { ...createDefaultRentVsBuyData(), ...input } as RentVsBuyCardData;
      const result = computeRentVsBuy(data);
      // Extract yearly snapshots from monthly schedule
      const yearlySnapshots = result.schedule.filter((row) => row.month % 12 === 0);
      return {
        totalRentCost: result.totalRentCost,
        finalInvestmentBalance: result.finalInvestmentBalance,
        rentNetPosition: result.rentNetPosition,
        totalBuyCost: result.totalBuyCost,
        finalHomeValue: result.finalHomeValue,
        finalHomeEquity: result.finalHomeEquity,
        buyNetPosition: result.buyNetPosition,
        crossoverMonth: result.crossoverMonth,
        crossoverDate: result.crossoverDate,
        recommendation: result.recommendation,
        netDifference: result.netDifference,
        monthlyMortgagePI: result.monthlyMortgagePI,
        initialMonthlyBuyCost: result.initialMonthlyBuyCost,
        yearlySnapshots,
      };
    },
  },

  // 24. calculate_debt_payoff
  {
    definition: {
      name: 'calculate_debt_payoff',
      description:
        'Simulate debt payoff using avalanche or snowball strategy. Returns payoff timeline and interest saved.',
      input_schema: {
        type: 'object' as const,
        properties: {
          strategy: {
            type: 'string',
            description:
              'Payoff strategy: "avalanche" (highest rate first) or "snowball" (smallest balance first). Default: avalanche',
          },
          extraMonthlyBudget: {
            type: 'number',
            description: 'Extra monthly amount to put toward debt (default 0)',
          },
          startDate: { type: 'string', description: 'Start date as ISO month "YYYY-MM"' },
          debts: {
            type: 'array',
            description: 'Array of debts to pay off',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Debt name' },
                balance: { type: 'number', description: 'Current balance' },
                annualInterestRate: {
                  type: 'number',
                  description: 'Annual interest rate percentage',
                },
                minimumPayment: { type: 'number', description: 'Minimum monthly payment' },
              },
              required: ['name', 'balance', 'annualInterestRate', 'minimumPayment'],
            },
          },
        },
        required: ['debts'],
      },
    },
    execute: async (input, _ctx) => {
      const debtsInput = input.debts as Array<{
        name: string;
        balance: number;
        annualInterestRate: number;
        minimumPayment: number;
      }>;
      const debts: Debt[] = debtsInput.map((d) => ({
        id: crypto.randomUUID(),
        name: d.name,
        balance: d.balance,
        annualInterestRate: d.annualInterestRate,
        minimumPayment: d.minimumPayment,
      }));

      const defaultConfig = createDefaultDebtPlannerData();
      const strategy = ((input.strategy as string) ?? defaultConfig.strategy) as
        | 'avalanche'
        | 'snowball';
      const config = {
        strategy,
        extraMonthlyBudget:
          (input.extraMonthlyBudget as number) ?? defaultConfig.extraMonthlyBudget,
        startDate: (input.startDate as string) ?? defaultConfig.startDate,
      };

      const result = simulateDebtPaydown(config, debts);
      const { rows, truncated, totalRows } = truncateSchedule(result.schedule);
      return {
        debtResults: result.debtResults,
        totalMonths: result.totalMonths,
        debtFreeDate: result.debtFreeDate,
        totalInterest: result.totalInterest,
        totalPaid: result.totalPaid,
        baselineMonths: result.baselineMonths,
        baselineTotalInterest: result.baselineTotalInterest,
        monthsSaved: result.monthsSaved,
        interestSaved: result.interestSaved,
        schedule: rows,
        scheduleTruncated: truncated,
        scheduleTotalRows: totalRows,
      };
    },
  },

  // 25. list_workspaces
  {
    definition: {
      name: 'list_workspaces',
      description:
        'List ALL workspaces owned by the current user, including the current one and all others. You MUST call this first before using query_workspace. Use this whenever the user asks about data across multiple workspaces or total/aggregate figures.',
      input_schema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
    execute: async (_input, ctx) => {
      const rows = await ctx.db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          type: workspaces.type,
          description: workspaces.description,
        })
        .from(workspaces)
        .where(eq(workspaces.userId, ctx.userId));

      return { workspaces: rows };
    },
  },

  // 26. query_workspace
  {
    definition: {
      name: 'query_workspace',
      description:
        'Query financial data from another workspace owned by the user. Call list_workspaces first to get workspace IDs, then call this for each workspace you need data from. Use for cross-workspace totals, comparisons, or any question about data outside the current workspace.',
      input_schema: {
        type: 'object' as const,
        properties: {
          workspace_id: {
            type: 'string',
            description: 'The ID of the workspace to query.',
          },
          question: {
            type: 'string',
            description: 'The question or topic to query about in the target workspace.',
          },
        },
        required: ['workspace_id', 'question'],
      },
    },
    execute: async (input, ctx) => {
      const { verifyWorkspaceAccess, dispatchWorkspaceQuery } = await import('./cross-workspace');
      const workspaceId = input.workspace_id as string;
      const question = input.question as string;

      if (!workspaceId || !question) {
        return { error: 'Both workspace_id and question are required.' };
      }

      const hasAccess = await verifyWorkspaceAccess(ctx.db, ctx.userId, workspaceId);
      if (!hasAccess) {
        return { error: "You don't have access to that workspace." };
      }

      const result = await dispatchWorkspaceQuery(ctx.db, ctx.userId, workspaceId, question);
      return { result };
    },
  },

  // 27. search_documents
  {
    definition: {
      name: 'search_documents',
      description:
        'Search uploaded documents in the workspace using hybrid retrieval: exact keyword matching (names, dollar amounts, account numbers, invoice IDs) fused with semantic similarity (meaning and paraphrase). Returns the most relevant text chunks from uploaded files (PDF, CSV, Excel, etc.). Works well for both precise lookups like "4,251.03" and conceptual queries like "recurring charges".',
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

  // 28. create_scenario_comparison
  {
    definition: {
      name: 'create_scenario_comparison',
      description:
        'Create 2-4 financial calculator cards on the canvas with a comparison summary page. Use for "what if" comparisons like "15 vs 30 year mortgage" or "max 401k vs match only".',
      input_schema: {
        type: 'object' as const,
        properties: {
          comparison_name: {
            type: 'string',
            description: 'Title for the comparison (e.g. "Mortgage: 15-Year vs 30-Year")',
          },
          scenarios: {
            type: 'array',
            description:
              'Array of 2-4 scenarios. Each needs a label, card type, and calculator parameters.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                type: {
                  type: 'string',
                  description:
                    'One of: projection-card, loan-calculator-card, tax-estimator-card, breakeven-card, depreciation-card, rent-vs-buy-card',
                },
                params: {
                  type: 'object',
                  description: 'Calculator parameters (same fields as calculate_* tools)',
                },
              },
              required: ['label', 'type', 'params'],
            },
          },
        },
        required: ['comparison_name', 'scenarios'],
      },
    },
    execute: async (input, ctx) => {
      const { executeScenarioComparison } = await import('./scenario-engine');
      const comparisonName = input.comparison_name as string;
      const scenarios = input.scenarios as Array<{
        label: string;
        type: string;
        params: Record<string, unknown>;
      }>;
      return executeScenarioComparison(
        ctx.db,
        ctx,
        comparisonName,
        scenarios as any,
      ) as unknown as Record<string, unknown>;
    },
  },

  // 29. populate_budget
  {
    definition: {
      name: 'populate_budget',
      description:
        'Populate a budget card with groups and categories. Call this AFTER create_canvas_item for a budget-card. Creates budget groups (e.g. "Fixed Expenses") and categories (e.g. "Rent" $800) in the database so the card displays them.',
      input_schema: {
        type: 'object' as const,
        properties: {
          groups: {
            type: 'array',
            description: 'Budget groups to create. Each group contains categories.',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Group name (e.g. "Fixed Expenses", "Variable Expenses")',
                },
                categories: {
                  type: 'array',
                  description: 'Categories within this group',
                  items: {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string',
                        description: 'Category name (e.g. "Rent", "Groceries")',
                      },
                      budgeted: { type: 'number', description: 'Budgeted amount' },
                      actual: { type: 'number', description: 'Actual spent amount (default 0)' },
                      notes: { type: 'string', description: 'Optional notes' },
                    },
                    required: ['name', 'budgeted'],
                  },
                },
              },
              required: ['name', 'categories'],
            },
          },
          ungrouped: {
            type: 'array',
            description: 'Categories without a group (optional)',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Category name' },
                budgeted: { type: 'number', description: 'Budgeted amount' },
                actual: { type: 'number', description: 'Actual spent amount (default 0)' },
                notes: { type: 'string', description: 'Optional notes' },
              },
              required: ['name', 'budgeted'],
            },
          },
        },
        required: [],
      },
    },
    execute: async (input, ctx) => {
      const GROUP_COLORS = [
        '#3b82f6',
        '#22c55e',
        '#f59e0b',
        '#ef4444',
        '#8b5cf6',
        '#ec4899',
        '#06b6d4',
        '#f97316',
      ];
      const now = new Date();
      let created = 0;

      const groups = input.groups as
        | Array<{
            name: string;
            categories: Array<{ name: string; budgeted: number; actual?: number; notes?: string }>;
          }>
        | undefined;

      if (groups) {
        for (let i = 0; i < groups.length; i++) {
          const group = groups[i]!;
          const groupId = crypto.randomUUID();
          await ctx.db.insert(budgetGroups).values({
            id: groupId,
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            name: group.name,
            color: GROUP_COLORS[i % GROUP_COLORS.length]!,
          });

          for (const cat of group.categories) {
            await ctx.db.insert(budgetCategories).values({
              id: crypto.randomUUID(),
              workspaceId: ctx.workspaceId,
              userId: ctx.userId,
              name: cat.name,
              budgeted: cat.budgeted,
              actual: cat.actual ?? 0,
              notes: cat.notes ?? null,
              groupId,
            });
            created++;
          }
        }
      }

      const ungrouped = input.ungrouped as
        | Array<{ name: string; budgeted: number; actual?: number; notes?: string }>
        | undefined;
      if (ungrouped) {
        for (const cat of ungrouped) {
          await ctx.db.insert(budgetCategories).values({
            id: crypto.randomUUID(),
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            name: cat.name,
            budgeted: cat.budgeted,
            actual: cat.actual ?? 0,
            notes: cat.notes ?? null,
            groupId: null,
          });
          created++;
        }
      }

      return { success: true, categoriesCreated: created, _canvasUpdate: true };
    },
  },

  // 30. populate_invoice
  {
    definition: {
      name: 'populate_invoice',
      description:
        'Populate an invoice card with header info and line items. Call this AFTER create_canvas_item for an invoice-card. Creates the invoice record and its line items in the database.',
      input_schema: {
        type: 'object' as const,
        properties: {
          invoiceNumber: { type: 'string', description: 'Invoice number (e.g. "INV-001")' },
          date: { type: 'string', description: 'Invoice date YYYY-MM-DD' },
          dueDate: { type: 'string', description: 'Due date YYYY-MM-DD' },
          fromName: { type: 'string', description: 'Sender name' },
          fromEmail: { type: 'string', description: 'Sender email' },
          fromAddress: { type: 'string', description: 'Sender address' },
          toName: { type: 'string', description: 'Recipient name' },
          toEmail: { type: 'string', description: 'Recipient email' },
          toAddress: { type: 'string', description: 'Recipient address' },
          taxRate: { type: 'number', description: 'Tax rate as percentage (default 0)' },
          status: {
            type: 'string',
            description: 'Invoice status: draft, sent, paid, overdue (default "draft")',
          },
          notes: { type: 'string', description: 'Optional notes' },
          lineItems: {
            type: 'array',
            description: 'Line items on the invoice',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'Item description' },
                quantity: { type: 'number', description: 'Quantity' },
                unitPrice: { type: 'number', description: 'Unit price' },
              },
              required: ['description', 'quantity', 'unitPrice'],
            },
          },
        },
        required: ['invoiceNumber', 'date', 'dueDate', 'lineItems'],
      },
    },
    execute: async (input, ctx) => {
      const invoiceId = crypto.randomUUID();
      await ctx.db.insert(invoices).values({
        id: invoiceId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        invoiceNumber: input.invoiceNumber as string,
        date: input.date as string,
        dueDate: input.dueDate as string,
        fromName: (input.fromName as string) ?? null,
        fromEmail: (input.fromEmail as string) ?? null,
        fromAddress: (input.fromAddress as string) ?? null,
        toName: (input.toName as string) ?? null,
        toEmail: (input.toEmail as string) ?? null,
        toAddress: (input.toAddress as string) ?? null,
        taxRate: (input.taxRate as number) ?? 0,
        status: (input.status as string) ?? 'draft',
        notes: (input.notes as string) ?? null,
      });

      const items = input.lineItems as Array<{
        description: string;
        quantity: number;
        unitPrice: number;
      }>;
      for (let i = 0; i < items.length; i++) {
        const li = items[i]!;
        await ctx.db.insert(invoiceLineItems).values({
          id: crypto.randomUUID(),
          invoiceId,
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          sortOrder: i,
        });
      }

      return { success: true, invoiceId, lineItemsCreated: items.length, _canvasUpdate: true };
    },
  },

  // 31. populate_receipt
  {
    definition: {
      name: 'populate_receipt',
      description:
        'Populate a receipt card with receipt entries. Call this AFTER create_canvas_item for a receipt-card. Creates receipt records in the database.',
      input_schema: {
        type: 'object' as const,
        properties: {
          receipts: {
            type: 'array',
            description: 'Receipt entries to create',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'Receipt date YYYY-MM-DD' },
                merchant: { type: 'string', description: 'Merchant / vendor name' },
                amount: { type: 'number', description: 'Total amount including tax' },
                tax: { type: 'number', description: 'Tax amount (default 0)' },
                paymentMethod: {
                  type: 'string',
                  description:
                    'Payment method: cash, card, check, transfer, other (default "card")',
                },
                status: {
                  type: 'string',
                  description: 'Status: pending, reviewed, reimbursed (default "pending")',
                },
                notes: { type: 'string', description: 'Optional notes' },
              },
              required: ['date', 'merchant', 'amount'],
            },
          },
        },
        required: ['receipts'],
      },
    },
    execute: async (input, ctx) => {
      const items = input.receipts as Array<{
        date: string;
        merchant: string;
        amount: number;
        tax?: number;
        paymentMethod?: string;
        status?: string;
        notes?: string;
      }>;
      for (const r of items) {
        await ctx.db.insert(receipts).values({
          id: crypto.randomUUID(),
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          date: r.date,
          merchant: r.merchant,
          amount: r.amount,
          tax: r.tax ?? 0,
          paymentMethod: r.paymentMethod ?? 'card',
          status: r.status ?? 'pending',
          notes: r.notes ?? null,
        });
      }
      return { success: true, receiptsCreated: items.length, _canvasUpdate: true };
    },
  },

  // 32. populate_subscriptions
  {
    definition: {
      name: 'populate_subscriptions',
      description:
        'Populate a subscription card with subscription entries. Call this AFTER create_canvas_item for a subscription-card. Creates subscription records in the database.',
      input_schema: {
        type: 'object' as const,
        properties: {
          subscriptions: {
            type: 'array',
            description: 'Subscription entries to create',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Subscription name (e.g. "Netflix", "AWS")' },
                amount: { type: 'number', description: 'Recurring amount' },
                frequency: {
                  type: 'string',
                  description:
                    'Billing frequency: weekly, biweekly, monthly, quarterly, annual (default "monthly")',
                },
                startDate: { type: 'string', description: 'Start date YYYY-MM-DD (default today)' },
                nextBillingDate: {
                  type: 'string',
                  description: 'Next billing date YYYY-MM-DD (default today)',
                },
                status: {
                  type: 'string',
                  description: 'Status: active, paused, cancelled (default "active")',
                },
                notes: { type: 'string', description: 'Optional notes' },
              },
              required: ['name', 'amount'],
            },
          },
        },
        required: ['subscriptions'],
      },
    },
    execute: async (input, ctx) => {
      const items = input.subscriptions as Array<{
        name: string;
        amount: number;
        frequency?: string;
        startDate?: string;
        nextBillingDate?: string;
        status?: string;
        notes?: string;
      }>;
      const today = new Date().toISOString().slice(0, 10);
      for (const s of items) {
        await ctx.db.insert(subscriptions).values({
          id: crypto.randomUUID(),
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          name: s.name,
          amount: s.amount,
          frequency: s.frequency ?? 'monthly',
          startDate: s.startDate ?? today,
          nextBillingDate: s.nextBillingDate ?? today,
          status: s.status ?? 'active',
          notes: s.notes ?? null,
        });
      }
      return { success: true, subscriptionsCreated: items.length, _canvasUpdate: true };
    },
  },

  // 33. populate_accounts
  {
    definition: {
      name: 'populate_accounts',
      description:
        'Populate an account card with account entries. Call this AFTER create_canvas_item for an account-card. Creates account records in the database.',
      input_schema: {
        type: 'object' as const,
        properties: {
          accounts: {
            type: 'array',
            description: 'Account entries to create',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Account name (e.g. "Chase Checking")' },
                institution: {
                  type: 'string',
                  description: 'Financial institution (e.g. "Chase")',
                },
                type: {
                  type: 'string',
                  description:
                    'Account type: checking, savings, credit-card, investment, loan, other',
                },
                balance: { type: 'number', description: 'Current balance' },
                notes: { type: 'string', description: 'Optional notes' },
              },
              required: ['name', 'institution', 'type', 'balance'],
            },
          },
        },
        required: ['accounts'],
      },
    },
    execute: async (input, ctx) => {
      const items = input.accounts as Array<{
        name: string;
        institution: string;
        type: string;
        balance: number;
        notes?: string;
      }>;
      for (const a of items) {
        await ctx.db.insert(accounts).values({
          id: crypto.randomUUID(),
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          name: a.name,
          institution: a.institution,
          type: a.type,
          balance: a.balance,
          notes: a.notes ?? null,
        });
      }
      return { success: true, accountsCreated: items.length, _canvasUpdate: true };
    },
  },

  // 34. populate_holdings
  {
    definition: {
      name: 'populate_holdings',
      description:
        'Populate a portfolio card with stock/fund holdings. Call this AFTER create_canvas_item for a portfolio-card. Creates holding records in the database.',
      input_schema: {
        type: 'object' as const,
        properties: {
          holdings: {
            type: 'array',
            description: 'Holdings to create',
            items: {
              type: 'object',
              properties: {
                symbol: { type: 'string', description: 'Ticker symbol (e.g. "AAPL", "VTI")' },
                name: { type: 'string', description: 'Full name (e.g. "Apple Inc.")' },
                value: { type: 'number', description: 'Current market value' },
                targetPct: { type: 'number', description: 'Target allocation percentage (0-100)' },
              },
              required: ['symbol', 'name', 'value', 'targetPct'],
            },
          },
        },
        required: ['holdings'],
      },
    },
    execute: async (input, ctx) => {
      const items = input.holdings as Array<{
        symbol: string;
        name: string;
        value: number;
        targetPct: number;
      }>;
      for (const h of items) {
        await ctx.db.insert(holdings).values({
          id: crypto.randomUUID(),
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          symbol: h.symbol,
          name: h.name,
          value: h.value,
          targetPct: h.targetPct,
        });
      }
      return { success: true, holdingsCreated: items.length, _canvasUpdate: true };
    },
  },

  // 35. populate_networth
  {
    definition: {
      name: 'populate_networth',
      description:
        'Populate a net worth card with asset/liability categories and entries. Call this AFTER create_canvas_item for a networth-card. Creates categories and entries in the database.',
      input_schema: {
        type: 'object' as const,
        properties: {
          categories: {
            type: 'array',
            description: 'Net worth categories with entries',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Category name (e.g. "Cash & Savings", "Real Estate")',
                },
                kind: { type: 'string', description: '"asset" or "liability"' },
                entries: {
                  type: 'array',
                  description: 'Entries within this category',
                  items: {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string',
                        description: 'Entry name (e.g. "Checking Account", "Mortgage")',
                      },
                      value: { type: 'number', description: 'Dollar value' },
                      notes: { type: 'string', description: 'Optional notes' },
                    },
                    required: ['name', 'value'],
                  },
                },
              },
              required: ['name', 'kind', 'entries'],
            },
          },
        },
        required: ['categories'],
      },
    },
    execute: async (input, ctx) => {
      const cats = input.categories as Array<{
        name: string;
        kind: string;
        entries: Array<{ name: string; value: number; notes?: string }>;
      }>;
      let entriesCreated = 0;
      for (const cat of cats) {
        const categoryId = crypto.randomUUID();
        await ctx.db.insert(networthCategories).values({
          id: categoryId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          name: cat.name,
          kind: cat.kind as 'asset' | 'liability',
        });
        for (const entry of cat.entries) {
          await ctx.db.insert(networthEntries).values({
            id: crypto.randomUUID(),
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            name: entry.name,
            categoryId,
            value: entry.value,
            notes: entry.notes ?? null,
          });
          entriesCreated++;
        }
      }
      return { success: true, categoriesCreated: cats.length, entriesCreated, _canvasUpdate: true };
    },
  },

  // 36. populate_debts
  {
    definition: {
      name: 'populate_debts',
      description:
        'Populate a debt planner card with debt entries. Call this AFTER create_canvas_item for a debt-planner-card. Creates debt records in the database.',
      input_schema: {
        type: 'object' as const,
        properties: {
          debts: {
            type: 'array',
            description: 'Debt entries to create',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Debt name (e.g. "Student Loan", "Credit Card")',
                },
                balance: { type: 'number', description: 'Current balance owed' },
                annualInterestRate: {
                  type: 'number',
                  description: 'Annual interest rate as percentage (e.g. 6.5)',
                },
                minimumPayment: { type: 'number', description: 'Minimum monthly payment' },
              },
              required: ['name', 'balance', 'annualInterestRate', 'minimumPayment'],
            },
          },
        },
        required: ['debts'],
      },
    },
    execute: async (input, ctx) => {
      const items = input.debts as Array<{
        name: string;
        balance: number;
        annualInterestRate: number;
        minimumPayment: number;
      }>;
      for (const d of items) {
        await ctx.db.insert(debts).values({
          id: crypto.randomUUID(),
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          name: d.name,
          balance: d.balance,
          annualInterestRate: d.annualInterestRate,
          minimumPayment: d.minimumPayment,
        });
      }
      return { success: true, debtsCreated: items.length, _canvasUpdate: true };
    },
  },

  // 37. search_entities
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

  // 38. get_entity_connections
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

  // 39. find_unmatched_transactions
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
];

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

  // Type validation for create_canvas_item
  if (name === 'create_canvas_item' && input.type && !ITEM_DEFAULTS[input.type as string]) {
    return {
      result: {
        error: `Invalid item type "${input.type}". Valid types: ${Object.keys(ITEM_DEFAULTS).join(', ')}`,
      },
      isError: true,
    };
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
