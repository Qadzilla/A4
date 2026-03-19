import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import type { DB } from '../db';
import {
  workspaces,
  canvasItems,
  canvasConnections,
  accounts,
  budgetCategories,
  subscriptions,
  invoices,
  invoiceLineItems,
  debts,
  holdings,
  networthCategories,
  networthEntries,
  receipts,
  marketBars,
} from '../db/schema';
import { ITEM_DEFAULTS, defaultNames, createDefaultData } from './canvas-defaults';
import { findNextPosition } from './auto-position';
// Lazy import to avoid loading OpenAI SDK at server startup
const lazySearchDocuments = () => import('./vector-search').then((m) => m.searchDocuments);
import {
  computeTaxEstimate,
  createDefaultTaxEstimatorData,
  computeLoan,
  createDefaultLoanCalculatorData,
  computeProjection,
  createDefaultProjectionData,
  computeBreakeven,
  createDefaultBreakevenData,
  computeDepreciation,
  createDefaultDepreciationData,
  computeRentVsBuy,
  createDefaultRentVsBuyData,
  simulateDebtPaydown,
  createDefaultDebtPlannerData,
} from '../lib/calc';
import type {
  TaxEstimatorData,
  LoanCalculatorData,
  ProjectionCardData,
  BreakevenCardData,
  DepreciationCardData,
  RentVsBuyCardData,
  Debt,
} from '../lib/calc';

export interface ToolContext {
  db: DB;
  userId: string;
  workspaceId: string;
}

type ToolExecutor = (input: Record<string, unknown>, ctx: ToolContext) => Promise<Record<string, unknown>>;

interface ToolRegistration {
  definition: Tool;
  execute: ToolExecutor;
}

function truncateSchedule<T>(schedule: T[], limit = 24): { rows: T[]; truncated: boolean; totalRows: number } {
  if (schedule.length <= limit) return { rows: schedule, truncated: false, totalRows: schedule.length };
  const half = Math.floor(limit / 2);
  return { rows: [...schedule.slice(0, half), ...schedule.slice(-half)], truncated: true, totalRows: schedule.length };
}

const TOOLS: ToolRegistration[] = [
  // 1. get_workspace_summary
  {
    definition: {
      name: 'get_workspace_summary',
      description: 'Get an overview of the current workspace including name, type, and counts of all data types.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    execute: async (_input, ctx) => {
      const [workspace] = await ctx.db
        .select({ name: workspaces.name, type: workspaces.type })
        .from(workspaces)
        .where(and(eq(workspaces.id, ctx.workspaceId), eq(workspaces.userId, ctx.userId)));

      if (!workspace) return { error: 'Workspace not found' };

      const countTable = async (table: typeof accounts | typeof budgetCategories | typeof subscriptions | typeof invoices | typeof debts | typeof holdings | typeof networthCategories) => {
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
          .where(and(eq(canvasItems.workspaceId, ctx.workspaceId), eq(canvasItems.userId, ctx.userId)))
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
        properties: { type: { type: 'string', description: 'Filter by item type (e.g. "note", "budget-card")' } },
        required: [],
      },
    },
    execute: async (input, ctx) => {
      const conditions = [eq(canvasItems.workspaceId, ctx.workspaceId), eq(canvasItems.userId, ctx.userId)];
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
        .select({ id: canvasItems.id, type: canvasItems.type, name: canvasItems.name, data: canvasItems.data })
        .from(canvasItems)
        .where(
          and(
            eq(canvasItems.id, input.itemId as string),
            eq(canvasItems.workspaceId, ctx.workspaceId),
            eq(canvasItems.userId, ctx.userId),
          ),
        );

      if (!row) return { error: 'Item not found' };
      return { id: row.id, type: row.type, name: row.name, data: row.data ? JSON.parse(row.data) : null };
    },
  },

  // 4. get_accounts
  {
    definition: {
      name: 'get_accounts',
      description: 'List financial accounts with balances, optionally filtered by type.',
      input_schema: {
        type: 'object' as const,
        properties: { type: { type: 'string', description: 'Filter by account type (e.g. "checking", "savings")' } },
        required: [],
      },
    },
    execute: async (input, ctx) => {
      const conditions = [eq(accounts.workspaceId, ctx.workspaceId), eq(accounts.userId, ctx.userId)];
      if (input.type) conditions.push(eq(accounts.type, input.type as string));

      const rows = await ctx.db
        .select({ id: accounts.id, name: accounts.name, type: accounts.type, balance: accounts.balance, institution: accounts.institution })
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
        .select({ id: budgetCategories.id, name: budgetCategories.name, budgeted: budgetCategories.budgeted, actual: budgetCategories.actual })
        .from(budgetCategories)
        .where(and(eq(budgetCategories.workspaceId, ctx.workspaceId), eq(budgetCategories.userId, ctx.userId)));

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
        properties: { status: { type: 'string', description: 'Filter by status (draft/sent/paid/overdue)' } },
        required: [],
      },
    },
    execute: async (input, ctx) => {
      const conditions = [eq(invoices.workspaceId, ctx.workspaceId), eq(invoices.userId, ctx.userId)];
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
          lineItems: items.map((li) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice })),
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
        properties: { status: { type: 'string', description: 'Filter by status (active/paused/cancelled)' } },
        required: [],
      },
    },
    execute: async (input, ctx) => {
      const conditions = [eq(subscriptions.workspaceId, ctx.workspaceId), eq(subscriptions.userId, ctx.userId)];
      if (input.status) conditions.push(eq(subscriptions.status, input.status as string));

      const rows = await ctx.db
        .select({ id: subscriptions.id, name: subscriptions.name, amount: subscriptions.amount, frequency: subscriptions.frequency, status: subscriptions.status })
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
        .select({ id: holdings.id, symbol: holdings.symbol, name: holdings.name, value: holdings.value, targetPct: holdings.targetPct })
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
        .select({ id: networthCategories.id, name: networthCategories.name, kind: networthCategories.kind })
        .from(networthCategories)
        .where(and(eq(networthCategories.workspaceId, ctx.workspaceId), eq(networthCategories.userId, ctx.userId)));

      const entries = await ctx.db
        .select({
          id: networthEntries.id,
          name: networthEntries.name,
          categoryId: networthEntries.categoryId,
          value: networthEntries.value,
        })
        .from(networthEntries)
        .where(and(eq(networthEntries.workspaceId, ctx.workspaceId), eq(networthEntries.userId, ctx.userId)));

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
      description: 'Create a new canvas item in the workspace. Auto-positions below existing items.',
      input_schema: {
        type: 'object' as const,
        properties: {
          type: { type: 'string', description: 'Item type (e.g. "note", "budget-card", "kpi-card")' },
          name: { type: 'string', description: 'Optional display name for the item' },
          data: { type: 'object', description: 'Optional data payload for the item. For notes, pass { text: "content" }.' },
        },
        required: ['type'],
      },
    },
    execute: async (input, ctx) => {
      const type = input.type as string;
      const defaults = ITEM_DEFAULTS[type];
      if (!defaults) {
        return { error: `Invalid item type "${type}". Valid types: ${Object.keys(ITEM_DEFAULTS).join(', ')}` };
      }

      const { width, height } = defaults;

      // Get existing items for positioning
      const existingItems = await ctx.db
        .select({ x: canvasItems.x, y: canvasItems.y, width: canvasItems.width, height: canvasItems.height })
        .from(canvasItems)
        .where(and(eq(canvasItems.workspaceId, ctx.workspaceId), eq(canvasItems.userId, ctx.userId)));

      const { x, y } = findNextPosition(existingItems, width, height);

      // Get max zIndex
      const [maxZ] = await ctx.db
        .select({ maxZIndex: sql<number>`COALESCE(MAX(${canvasItems.zIndex}), 0)` })
        .from(canvasItems)
        .where(and(eq(canvasItems.workspaceId, ctx.workspaceId), eq(canvasItems.userId, ctx.userId)));
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

      return { id, type, name, x, y, width, height, zIndex, data: data ?? null, _canvasUpdate: true };
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
        await ctx.db
          .update(canvasItems)
          .set(updates)
          .where(eq(canvasItems.id, itemId));
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
          fromAnchor: { type: 'string', description: 'Source anchor point (top/right/bottom/left)' },
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
      return { error: 'Deleting canvas items requires manual confirmation. Please ask the user to delete it themselves.' };
    },
  },

  // ─── Calculation Tools (18–24) ─────────────────────────────────────

  // 18. calculate_tax
  {
    definition: {
      name: 'calculate_tax',
      description: 'Estimate US federal + state income tax. Returns tax breakdown, effective rate, and marginal rates.',
      input_schema: {
        type: 'object' as const,
        properties: {
          taxYear: { type: 'number', description: 'Tax year (2025 or 2026)' },
          filingStatus: { type: 'string', description: 'Filing status: single, mfj, mfs, hoh' },
          stateCode: { type: 'string', description: '2-letter state code (e.g. "CA") or empty for no state tax' },
          w2Wages: { type: 'number', description: 'W-2 wages' },
          selfEmploymentIncome: { type: 'number', description: 'Self-employment income' },
          investmentIncome: { type: 'number', description: 'Investment income' },
          otherIncome: { type: 'number', description: 'Other income' },
          retirement401k: { type: 'number', description: '401(k) contributions' },
          traditionalIRA: { type: 'number', description: 'Traditional IRA contributions' },
          hsaContribution: { type: 'number', description: 'HSA contributions' },
          studentLoanInterest: { type: 'number', description: 'Student loan interest paid' },
          deductionType: { type: 'string', description: '"standard" or "itemized"' },
          saltDeduction: { type: 'number', description: 'State and local tax deduction (capped at $10k)' },
          mortgageInterest: { type: 'number', description: 'Mortgage interest paid' },
          charitableGiving: { type: 'number', description: 'Charitable contributions' },
          otherItemized: { type: 'number', description: 'Other itemized deductions' },
          numDependentChildren: { type: 'number', description: 'Number of dependent children for child tax credit' },
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
          downPaymentPercent: { type: 'number', description: 'Down payment percentage (default 20)' },
          loanTermYears: { type: 'number', description: 'Loan term in years (default 30)' },
          annualInterestRate: { type: 'number', description: 'Annual interest rate as percentage (e.g. 6.5)' },
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
          annualGrowthRate: { type: 'number', description: 'Annual growth rate percentage (e.g. 7)' },
          projectionYears: { type: 'number', description: 'Number of years to project (default 10)' },
          inflationRate: { type: 'number', description: 'Annual inflation rate percentage (default 0)' },
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
      description: 'Calculate break-even point given fixed costs, variable cost per unit, and price per unit.',
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
      description: 'Calculate asset depreciation schedule using straight-line, declining-balance, double-declining, or sum-of-years methods.',
      input_schema: {
        type: 'object' as const,
        properties: {
          assetCost: { type: 'number', description: 'Original cost of the asset' },
          salvageValue: { type: 'number', description: 'Salvage value at end of life (default 0)' },
          usefulLifeYears: { type: 'number', description: 'Useful life in years' },
          method: { type: 'string', description: 'Depreciation method: straight-line, declining-balance, double-declining, sum-of-years (default straight-line)' },
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
      description: 'Compare renting vs buying a home over time. Returns yearly snapshots and a recommendation.',
      input_schema: {
        type: 'object' as const,
        properties: {
          monthlyRent: { type: 'number', description: 'Current monthly rent' },
          homePrice: { type: 'number', description: 'Home purchase price' },
          analysisYears: { type: 'number', description: 'Analysis period in years (default 10)' },
          downPaymentPercent: { type: 'number', description: 'Down payment percentage (default 20)' },
          annualInterestRate: { type: 'number', description: 'Mortgage interest rate (default 6.5)' },
          loanTermYears: { type: 'number', description: 'Loan term in years (default 30)' },
          annualRentIncrease: { type: 'number', description: 'Annual rent increase percentage (default 3)' },
          annualPropertyTax: { type: 'number', description: 'Annual property tax' },
          annualHomeInsurance: { type: 'number', description: 'Annual home insurance' },
          annualMaintenancePercent: { type: 'number', description: 'Annual maintenance as % of home value (default 1)' },
          annualHomeAppreciation: { type: 'number', description: 'Annual home appreciation percentage (default 3)' },
          annualInvestmentReturn: { type: 'number', description: 'Annual investment return percentage (default 7)' },
          closingCostPercent: { type: 'number', description: 'Closing cost as % of home price (default 3)' },
          sellingCostPercent: { type: 'number', description: 'Selling cost as % of home value (default 6)' },
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
      description: 'Simulate debt payoff using avalanche or snowball strategy. Returns payoff timeline and interest saved.',
      input_schema: {
        type: 'object' as const,
        properties: {
          strategy: { type: 'string', description: 'Payoff strategy: "avalanche" (highest rate first) or "snowball" (smallest balance first). Default: avalanche' },
          extraMonthlyBudget: { type: 'number', description: 'Extra monthly amount to put toward debt (default 0)' },
          startDate: { type: 'string', description: 'Start date as ISO month "YYYY-MM"' },
          debts: {
            type: 'array',
            description: 'Array of debts to pay off',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Debt name' },
                balance: { type: 'number', description: 'Current balance' },
                annualInterestRate: { type: 'number', description: 'Annual interest rate percentage' },
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
      const debtsInput = input.debts as Array<{ name: string; balance: number; annualInterestRate: number; minimumPayment: number }>;
      const debts: Debt[] = debtsInput.map((d) => ({
        id: crypto.randomUUID(),
        name: d.name,
        balance: d.balance,
        annualInterestRate: d.annualInterestRate,
        minimumPayment: d.minimumPayment,
      }));

      const defaultConfig = createDefaultDebtPlannerData();
      const strategy = ((input.strategy as string) ?? defaultConfig.strategy) as 'avalanche' | 'snowball';
      const config = {
        strategy,
        extraMonthlyBudget: (input.extraMonthlyBudget as number) ?? defaultConfig.extraMonthlyBudget,
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
        'Search uploaded documents in the workspace using semantic similarity. Returns the most relevant text chunks from uploaded files (PDF, CSV, Excel, etc.) that match the query.',
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
          return { results: [], message: 'No matching documents found. The workspace may not have any uploaded documents, or none matched the query.' };
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
        return { results: [], message: 'Document search is not available. Embedding service may be unavailable.' };
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
            description: 'Array of 2-4 scenarios. Each needs a label, card type, and calculator parameters.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                type: {
                  type: 'string',
                  description:
                    'One of: projection-card, loan-calculator-card, tax-estimator-card, breakeven-card, depreciation-card, rent-vs-buy-card',
                },
                params: { type: 'object', description: 'Calculator parameters (same fields as calculate_* tools)' },
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
      const scenarios = input.scenarios as Array<{ label: string; type: string; params: Record<string, unknown> }>;
      return executeScenarioComparison(ctx.db, ctx, comparisonName, scenarios as any) as unknown as Record<
        string,
        unknown
      >;
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
    if (field in input && typeof input[field] === 'string' && !UUID_RE.test(input[field] as string)) {
      return { result: { error: `Invalid ${field}: must be a valid UUID` }, isError: true };
    }
  }

  // Type validation for create_canvas_item
  if (name === 'create_canvas_item' && input.type && !ITEM_DEFAULTS[input.type as string]) {
    return {
      result: { error: `Invalid item type "${input.type}". Valid types: ${Object.keys(ITEM_DEFAULTS).join(', ')}` },
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
      result: { error: 'Internal error executing tool. Please try again or use a different approach.' },
      isError: true,
    };
  }
}
