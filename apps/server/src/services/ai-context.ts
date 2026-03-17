import { and, eq, desc, sql, isNull, or, gt } from 'drizzle-orm';
import type { Citation } from '@a4/shared-schemas';
import type { DB } from '../db';
import {
  workspaces,
  canvasItems,
  accounts,
  budgetCategories,
  networthCategories,
  networthEntries,
  subscriptions,
  invoices,
  invoiceLineItems,
  debts,
  holdings,
  workspaceInsights,
} from '../db/schema';

export const SYSTEM_PREAMBLE = `You are Paige, an AI financial analyst embedded in the user's financial workspace.
You have access to the user's actual financial data — never make up numbers.
Always ground your answers in the data available through your tools.

## Your capabilities
- Answer questions about the user's finances using real data from their workspace
- Create, update, and organize canvas items (budgets, accounts, charts, etc.)
- Run financial calculations (tax estimates, loan amortization, projections, etc.)
- Search and summarize uploaded documents
- Spot anomalies and surface insights

## Rules
- NEVER fabricate financial data. If you don't have the data, say so and suggest how the user can add it.
- ALWAYS cite which canvas items, accounts, or documents your answer is based on.
- When creating canvas items, position them logically near related items.
- For destructive actions (deleting items, large data changes), confirm with the user first.
- Keep responses concise and actionable. Users are managing their money, not reading essays.
- Use exact numbers with proper formatting ($12,345.67, not "about twelve thousand").
- When running calculations, show your assumptions clearly.

## Tool usage guidelines

### When to use tools vs. workspace summary
- The workspace context above already includes account balances, budget totals, net worth, subscriptions, debts, holdings, and canvas items. For simple questions like "what's my net worth?" or "how much do I spend on subscriptions?", answer directly from this context — don't call a tool.
- Use read-only tools (get_invoices, get_accounts, etc.) when the user asks for *detailed* data not in the summary. The summary has counts and totals; the tools return full records with all fields.
- Use get_item_data to read a specific canvas item's data when the user references it by name or asks about its contents.
- Use get_market_data for real-time stock prices, crypto prices, or market data not already in the workspace context.

### Canvas creation best practices
- When using create_canvas_item, always choose a descriptive name based on conversation context. Use "Q1 2026 Marketing Budget" instead of "Untitled Budget" or "New Budget".
- When creating items with data, populate realistic defaults derived from the conversation (e.g., if the user says "make me a budget for $3000/month rent", pre-fill that amount).
- After creating a canvas item, briefly confirm what was created and mention the user can find it on their canvas.

### Calculation guidelines
- Use calculation tools when the user asks questions like "how much tax will I owe?", "what's the amortization schedule?", or "project my savings growth".
- Show key results inline in your response — don't just say "I ran the calculation". Present the most important numbers directly.
- State assumptions clearly, e.g. "Assuming single filing status and CA state taxes, ..." or "Using a 7% annual return rate, ...".
- If the user wants to keep a calculation result, offer to create a canvas item (e.g., a tax-estimator-card or projection-card) so it persists on their workspace.

### Restrictions
- You cannot delete canvas items. If the user asks to delete something, explain they must do it manually from the canvas.
- You cannot modify or read vault-encrypted data (secrets). Never include encrypted data in responses.
- You cannot access data from other workspaces. If the user asks about data in a different workspace, let them know they need to switch workspaces.

### Response formatting
- Format numbers as currency ($12,345.67) and percentages (12.5%) — never use raw unformatted numbers.
- Use markdown tables for tabular data such as account lists, budget breakdowns, and amortization schedules.
- Keep tool-augmented responses concise. The user can open the canvas item for full details — focus on the key takeaways.

### Document citations
- When you reference information from uploaded documents, cite the source using [1], [2], etc. These numbers correspond to the document excerpts provided in the "Relevant Documents" section.
- Always cite your sources when answering questions about file content.
- If no relevant documents section is provided, do not use citation markers.

You have access to automatically detected financial insights. When an insight is relevant to the user's question, reference it naturally. For insight-spawned conversations, lead with analysis of the specific insight. Do not repeat the insight verbatim — add value by explaining implications, suggesting actions, or running calculations.`;

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

async function buildAccountsSection(db: DB, userId: string, workspaceId: string): Promise<string> {
  const rows = await db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type, balance: accounts.balance })
    .from(accounts)
    .where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.userId, userId)))
    .orderBy(desc(accounts.balance));

  if (rows.length === 0) return '';

  const total = rows.reduce((sum, r) => sum + r.balance, 0);
  const display = rows.length > 20 ? rows.slice(0, 10) : rows;
  const lines = display.map((r) => `- ${r.name}: ${fmt(r.balance)} (${r.type}) [id: ${r.id}]`);

  if (rows.length > 20) {
    lines.push(`- ... and ${rows.length - 10} more accounts`);
  }

  return `### Accounts (${rows.length} total, ${fmt(total)} combined)\n${lines.join('\n')}`;
}

async function buildBudgetSection(db: DB, userId: string, workspaceId: string): Promise<string> {
  const rows = await db
    .select({
      name: budgetCategories.name,
      budgeted: budgetCategories.budgeted,
      actual: budgetCategories.actual,
    })
    .from(budgetCategories)
    .where(and(eq(budgetCategories.workspaceId, workspaceId), eq(budgetCategories.userId, userId)));

  if (rows.length === 0) return '';

  const totalBudgeted = rows.reduce((s, r) => s + r.budgeted, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const remaining = totalBudgeted - totalActual;

  const overBudget = rows.filter((r) => r.actual > r.budgeted);
  const overLine = overBudget.length > 0
    ? `\n- Over budget: ${overBudget.map((r) => `${r.name} (${fmt(r.actual)}/${fmt(r.budgeted)})`).join(', ')}`
    : '';

  return `### Budget (${rows.length} categories)\n- Planned: ${fmt(totalBudgeted)} | Actual: ${fmt(totalActual)} | Remaining: ${fmt(remaining)}${overLine}`;
}

async function buildNetworthSection(db: DB, userId: string, workspaceId: string): Promise<string> {
  const categories = await db
    .select({ id: networthCategories.id, kind: networthCategories.kind })
    .from(networthCategories)
    .where(and(eq(networthCategories.workspaceId, workspaceId), eq(networthCategories.userId, userId)));

  if (categories.length === 0) return '';

  const entries = await db
    .select({ categoryId: networthEntries.categoryId, value: networthEntries.value })
    .from(networthEntries)
    .where(and(eq(networthEntries.workspaceId, workspaceId), eq(networthEntries.userId, userId)));

  if (entries.length === 0) return '';

  const catKindMap = new Map(categories.map((c) => [c.id, c.kind]));
  let assets = 0;
  let liabilities = 0;

  for (const e of entries) {
    const kind = catKindMap.get(e.categoryId);
    if (kind === 'asset') assets += e.value;
    else if (kind === 'liability') liabilities += e.value;
  }

  const netWorth = assets - liabilities;

  return `### Net Worth: ${fmt(netWorth)}\n- Assets: ${fmt(assets)} | Liabilities: ${fmt(liabilities)}`;
}

async function buildSubscriptionsSection(db: DB, userId: string, workspaceId: string): Promise<string> {
  const rows = await db
    .select({
      id: subscriptions.id,
      name: subscriptions.name,
      amount: subscriptions.amount,
      frequency: subscriptions.frequency,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, 'active'),
      ),
    )
    .orderBy(desc(subscriptions.amount));

  if (rows.length === 0) return '';

  const toMonthly = (amount: number, freq: string): number => {
    switch (freq) {
      case 'weekly': return (amount * 52) / 12;
      case 'biweekly': return (amount * 26) / 12;
      case 'monthly': return amount;
      case 'quarterly': return amount / 3;
      case 'annual': return amount / 12;
      default: return amount;
    }
  };

  const monthlyTotal = rows.reduce((s, r) => s + toMonthly(r.amount, r.frequency), 0);
  const display = rows.length > 15 ? rows.slice(0, 10) : rows;
  const lines = display.map((r) => `- ${r.name}: ${fmt(r.amount)}/${r.frequency} [id: ${r.id}]`);

  if (rows.length > 15) {
    lines.push(`- ... and ${rows.length - 10} more subscriptions`);
  }

  return `### Subscriptions (${rows.length} active, ~${fmt(monthlyTotal)}/month)\n${lines.join('\n')}`;
}

async function buildInvoicesSection(db: DB, userId: string, workspaceId: string): Promise<string> {
  const allInvoices = await db
    .select({
      id: invoices.id,
      status: invoices.status,
      taxRate: invoices.taxRate,
    })
    .from(invoices)
    .where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.userId, userId)));

  if (allInvoices.length === 0) return '';

  // Get all line items for these invoices
  const invoiceIds = allInvoices.map((i) => i.id);
  const lineItems = await db
    .select({
      invoiceId: invoiceLineItems.invoiceId,
      quantity: invoiceLineItems.quantity,
      unitPrice: invoiceLineItems.unitPrice,
    })
    .from(invoiceLineItems);

  // Compute totals per invoice
  const invoiceTotals = new Map<string, number>();
  for (const li of lineItems) {
    if (!invoiceIds.includes(li.invoiceId)) continue;
    const prev = invoiceTotals.get(li.invoiceId) ?? 0;
    invoiceTotals.set(li.invoiceId, prev + li.quantity * li.unitPrice);
  }

  // Apply tax and group by status
  const statusTotals: Record<string, { count: number; total: number }> = {};
  for (const inv of allInvoices) {
    const subtotal = invoiceTotals.get(inv.id) ?? 0;
    const total = subtotal * (1 + inv.taxRate / 100);
    if (!statusTotals[inv.status]) {
      statusTotals[inv.status] = { count: 0, total: 0 };
    }
    const entry = statusTotals[inv.status]!;
    entry.count++;
    entry.total += total;
  }

  const summaryParts = Object.entries(statusTotals).map(
    ([status, { count, total }]) => `${count} ${status} (${fmt(total)})`,
  );

  const outstanding = (statusTotals['sent']?.total ?? 0) + (statusTotals['overdue']?.total ?? 0);

  let result = `### Invoices (${allInvoices.length} total)\n- Summary: ${summaryParts.join(', ')}`;
  if (outstanding > 0) {
    result += `\n- Total outstanding: ${fmt(outstanding)}`;
  }

  return result;
}

async function buildDebtsSection(db: DB, userId: string, workspaceId: string): Promise<string> {
  const rows = await db
    .select({
      id: debts.id,
      name: debts.name,
      balance: debts.balance,
      annualInterestRate: debts.annualInterestRate,
      minimumPayment: debts.minimumPayment,
    })
    .from(debts)
    .where(and(eq(debts.workspaceId, workspaceId), eq(debts.userId, userId)))
    .orderBy(desc(debts.balance));

  if (rows.length === 0) return '';

  const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
  const totalMinPayment = rows.reduce((s, r) => s + r.minimumPayment, 0);

  const lines = rows.map(
    (r) => `- ${r.name}: ${fmt(r.balance)} at ${r.annualInterestRate}% (min ${fmt(r.minimumPayment)}/mo) [id: ${r.id}]`,
  );

  return `### Debts (${rows.length} total, ${fmt(totalBalance)} total balance)\n${lines.join('\n')}\n- Total minimum payments: ${fmt(totalMinPayment)}/month`;
}

async function buildHoldingsSection(db: DB, userId: string, workspaceId: string): Promise<string> {
  const rows = await db
    .select({
      id: holdings.id,
      symbol: holdings.symbol,
      value: holdings.value,
      targetPct: holdings.targetPct,
    })
    .from(holdings)
    .where(and(eq(holdings.workspaceId, workspaceId), eq(holdings.userId, userId)))
    .orderBy(desc(holdings.value));

  if (rows.length === 0) return '';

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const display = rows.length > 20 ? rows.slice(0, 10) : rows;
  const lines = display.map(
    (r) => `- ${r.symbol}: ${fmt(r.value)} (target ${r.targetPct}%) [id: ${r.id}]`,
  );

  if (rows.length > 20) {
    lines.push(`- ... and ${rows.length - 10} more positions`);
  }

  return `### Portfolio (${rows.length} positions, ${fmt(totalValue)} total)\n${lines.join('\n')}`;
}

async function buildCanvasItemsSection(db: DB, userId: string, workspaceId: string): Promise<string> {
  const rows = await db
    .select({ id: canvasItems.id, type: canvasItems.type, name: canvasItems.name })
    .from(canvasItems)
    .where(and(eq(canvasItems.workspaceId, workspaceId), eq(canvasItems.userId, userId)));

  if (rows.length === 0) return '';

  if (rows.length > 50) {
    // Summarize by type count
    const typeCounts: Record<string, number> = {};
    for (const r of rows) {
      typeCounts[r.type] = (typeCounts[r.type] ?? 0) + 1;
    }
    const parts = Object.entries(typeCounts).map(([type, count]) => `${type}: ${count} items`);
    return `### Canvas Items (${rows.length} items)\n- ${parts.join(' | ')}`;
  }

  const lines = rows.map((r) => `- ${r.type}: "${r.name}" (id: ${r.id})`);
  return `### Canvas Items (${rows.length} items)\n${lines.join('\n')}`;
}

export async function buildInsightsSection(db: DB, userId: string, workspaceId: string): Promise<string> {
  const rows = await db
    .select({
      severity: workspaceInsights.severity,
      title: workspaceInsights.title,
      summary: workspaceInsights.summary,
    })
    .from(workspaceInsights)
    .where(
      and(
        eq(workspaceInsights.userId, userId),
        eq(workspaceInsights.workspaceId, workspaceId),
        eq(workspaceInsights.status, 'active'),
        or(isNull(workspaceInsights.expiresAt), gt(workspaceInsights.expiresAt, new Date())),
      ),
    );

  if (rows.length === 0) return '';

  const groups: Record<string, typeof rows> = { critical: [], warning: [], info: [] };
  for (const r of rows) {
    const bucket = groups[r.severity];
    if (bucket) bucket.push(r);
  }

  const lines: string[] = [
    '## Active financial insights',
    '',
    'The following insights have been automatically detected in this workspace. You may reference these proactively in your responses when relevant:',
  ];

  for (const [severity, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    lines.push('', `### ${severity.charAt(0).toUpperCase() + severity.slice(1)}`);
    for (const item of items) {
      lines.push(`- **${item.title}**: ${item.summary}`);
    }
  }

  return lines.join('\n');
}

export async function buildWorkspaceContext(db: DB, userId: string, workspaceId: string): Promise<string> {
  // 1. Query workspace
  const [workspace] = await db
    .select({ id: workspaces.id, name: workspaces.name, type: workspaces.type })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)));

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found for user ${userId}`);
  }

  // 2. Run all section builders in parallel
  const sections = await Promise.all([
    buildAccountsSection(db, userId, workspaceId),
    buildBudgetSection(db, userId, workspaceId),
    buildNetworthSection(db, userId, workspaceId),
    buildSubscriptionsSection(db, userId, workspaceId),
    buildInvoicesSection(db, userId, workspaceId),
    buildDebtsSection(db, userId, workspaceId),
    buildHoldingsSection(db, userId, workspaceId),
    buildCanvasItemsSection(db, userId, workspaceId),
    buildInsightsSection(db, userId, workspaceId),
  ]);

  // 3. Filter out empty sections
  const nonEmpty = sections.filter((s) => s !== '');

  // 4. Assemble
  const header = `## Workspace: "${workspace.name}"\nType: ${workspace.type}`;
  const contextBody = [header, ...nonEmpty].join('\n\n');

  return `${SYSTEM_PREAMBLE}\n\n## Current workspace context\n\n${contextBody}`;
}

const TOKEN_BUDGET_CHARS = 8000;

export async function buildDocumentContext(
  query: string,
  workspaceId: string,
  db: DB,
): Promise<{ section: string; citations: Citation[] }> {
  try {
    const { searchDocuments } = await import('./vector-search');
    const results = await searchDocuments(query, workspaceId, db, { topK: 5 });

    if (results.length === 0) {
      return { section: '', citations: [] };
    }

    const citations: Citation[] = [];
    const lines: string[] = [
      '## Relevant Documents',
      '',
      'The following excerpts from the user\'s uploaded documents are relevant to this query. Cite them using [1], [2], etc. when referencing specific information.',
      '',
      'Note: These excerpts may come from OCR (optical character recognition) of scanned documents. OCR artifacts are common in financial documents — particularly missing negative/minus signs, misread digits (e.g., 5↔S, 0↔O, 1↔l), and merged or split words. Use contextual clues to interpret ambiguous data: section headers (e.g., "Withdrawals", "Debits", "Expenses"), column labels, and surrounding values indicate whether amounts should be negative. Silently apply these corrections — do not flag OCR quality issues to the user unless they specifically ask about document accuracy.',
      '',
    ];

    let charCount = lines.join('\n').length;

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const pct = Math.round(r.score * 100);
      const entry = `[${i + 1}] ${r.fileName} (relevance: ${pct}%)\n> ${r.content}`;

      if (charCount + entry.length > TOKEN_BUDGET_CHARS && citations.length > 0) {
        break;
      }

      charCount += entry.length + 2; // +2 for \n\n
      citations.push({
        index: i + 1,
        fileId: r.fileId,
        fileName: r.fileName,
        chunkContent: r.content,
        score: r.score,
      });
      lines.push(entry);
    }

    return { section: lines.join('\n'), citations };
  } catch (err) {
    console.error('[RAG] buildDocumentContext error:', err);
    return { section: '', citations: [] };
  }
}
