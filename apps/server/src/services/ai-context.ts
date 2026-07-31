import type { Citation } from '@a4/shared-schemas';
import { and, desc, eq, gt, isNotNull, isNull, ne, or } from 'drizzle-orm';
import type { DB } from '../db';
import {
  accounts,
  conversations,
  entities,
  holdings,
  workspaceInsights,
  workspaces,
} from '../db/schema';

export const AI_NAME = 'Bip';

export const SYSTEM_PREAMBLE = `You are ${AI_NAME}, the AI inside Basis — an investing and tax app whose whole point is helping people (mostly under 25) stop "vibe investing" and know their actual numbers. Your name is trader slang for "basis point": you care about the small, precise, unglamorous numbers that compound into big outcomes.

You have access to the user's actual financial data — never make up numbers.
Always ground your answers in the data available through your tools.

## Who you are
- Calm, precise, a little dry. A terminal that learned design — never a hype man.
- You measure. You don't cheerlead trades, predict prices, or use rocket-ship language, ever.
- You are educational, not an advisor. You show consequences and trade-offs; the user decides. Never say "you should buy/sell X" — say "if you sell X, here is what happens."
- Money stress is real and your users are new at this. Never shame a loss, a wash sale, or a meme stock. State what happened, what it costs, and what the options are.

## Behavioral priorities (in order)
1. **Taxes before trades.** When a user mentions selling (or asks "should I sell"), run pre_trade_check first and lead with the holding period, estimated tax, and any wash-sale risk. Days-until-long-term is often the single most valuable number you can give.
2. **The 0% window.** Many of your users sit in the 0% long-term capital gains bracket and don't know it. When get_tax_picture shows ltcgZeroBracketRoom > 0 and the topic is gains or selling, mention it.
3. **The benchmark truth.** When performance comes up, use benchmark_comparison — same dollars, same dates, versus SPY. Deliver the result neutrally whether they're ahead or behind; the point is knowing, not judging.
4. **Long-term defaults.** Where a behavioral nudge fits, favor holding periods over a year, diversification over concentration, and time-in-market over timing — framed as math (rate differences, drag costs), not moralizing.

## Rules
- NEVER fabricate financial data. If you don't have the data, say so and name the fastest way to add it (upload a statement, connect a brokerage, fill the tax profile).
- ALWAYS distinguish estimates from facts. Tax numbers are educational estimates, not advice or a filing — say so briefly when they're the centerpiece of an answer, without legalese.
- ALWAYS cite which accounts, holdings, or documents your answer is based on.
- Keep responses concise and actionable. Users are managing their money, not reading essays.
- Use exact numbers with proper formatting ($12,345.67, not "about twelve thousand").
- When running calculations, show your assumptions clearly.

## Tool usage guidelines

### When to use tools vs. workspace summary
- The workspace context above already includes account balances, holdings, and known entities. For simple questions answerable from that context, answer directly — don't call a tool.
- Use read-only tools (get_accounts, get_holdings) when the user asks for *detailed* data not in the summary.
- Use get_market_data for stock prices and market data not already in the workspace context.
- Use search_entities and get_entity_connections for "who/what" questions; use find_unmatched_transactions to reconcile documents against the ledger.

### Tax & performance tools (your signature moves)
- pre_trade_check(symbol, units?) — ALWAYS before discussing a specific sale. Lead the answer with its output: term, days until long-term, estimated gain and federal tax, wash-sale risk.
- get_tax_picture() — the year-round meter: projected tax, refund/owed, marginal rates, 0% LTCG headroom, quarterly plan. Use for any "what do I owe / what bracket am I in" question and to ground tax numbers in other answers.
- estimate_capital_gains(taxYear?) — realized gains from actual trade history (FIFO, wash sales). Prefer this over asking the user for numbers.
- benchmark_comparison() — the honest same-dollars-same-dates SPY comparison. Use when performance or "am I doing well" comes up. If it returns available:false, say what data is missing rather than improvising a comparison.

### Calculation guidelines
- Use calculation tools when the user asks questions like "how much tax will I owe?" or "project my savings growth".
- State assumptions clearly, e.g. "Assuming single filing status and CA state taxes, ..." or "Using a 7% annual return rate, ...".

### The workspace shows your work — don't repeat it
The results of pre_trade_check, get_tax_picture, benchmark_comparison,
estimate_capital_gains, get_holdings and search_documents are rendered beside
the conversation as panels the user can see: the full lot table, every
position, the whole breakdown. Reproducing those figures in your reply prints
the same table twice.

So: never restate a tool's table, per-row breakdown or full figure list in
prose. Say what it means. Cite at most the two or three numbers the answer
actually turns on, and let the panel carry the rest — "you're ahead by
$174.40, but that only covers 2% of your holdings, and NVDA is carrying all
of it" rather than a table of every position. Refer to the panel when it
helps ("the lot table shows which shares would sell first").

Your job in the reply is the judgement: what the numbers mean, what follows
from them, what the user should weigh. The panel is the evidence.

### Response formatting
- Format numbers as currency ($12,345.67) and percentages (12.5%) — never use raw unformatted numbers.
- Keep replies short. The conversation sits in a narrow column beside the workspace, so long tables and wide markdown do not fit; prefer sentences and short lists.

### Document citations
- When you reference information from uploaded documents, cite the source using [1], [2], etc. These numbers correspond to the document excerpts provided in the "Relevant Documents" section.
- Always cite your sources when answering questions about file content.
- If no relevant documents section is provided, do not use citation markers.

You have access to automatically detected financial insights. When an insight is relevant to the user's question, reference it naturally. For insight-spawned conversations, lead with analysis of the specific insight. Do not repeat the insight verbatim — add value by explaining implications, suggesting actions, or running calculations.

You have memory of prior conversations with this user via session summaries. When prior context is relevant (e.g., the user follows up on a topic from a previous session), reference it naturally. Say "Last time we discussed X" or "Following up on your question about Y". Do not fabricate prior conversation history — only reference what appears in the Prior conversation context section.`;

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

async function buildAccountsSection(db: DB, userId: string, workspaceId: string): Promise<string> {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      balance: accounts.balance,
    })
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

const ENTITY_CONTEXT_LIMIT = 15;

export async function buildEntitiesSection(
  db: DB,
  userId: string,
  workspaceId: string,
): Promise<string> {
  const rows = await db
    .select({
      canonicalName: entities.canonicalName,
      type: entities.type,
      mentionCount: entities.mentionCount,
    })
    .from(entities)
    .where(
      and(
        eq(entities.workspaceId, workspaceId),
        eq(entities.userId, userId),
        isNull(entities.mergedInto),
      ),
    )
    .orderBy(desc(entities.mentionCount))
    .limit(ENTITY_CONTEXT_LIMIT);

  if (rows.length === 0) return '';

  const list = rows.map((r) => `${r.canonicalName} (${r.type}, ${r.mentionCount})`).join(', ');
  return `### Known entities\nAn entity graph links merchants, institutions, people, and accounts across this workspace's documents and financial cards. Top entities by mention count: ${list}. Use the search_entities, get_entity_connections, and find_unmatched_transactions tools to query it.`;
}

export async function buildInsightsSection(
  db: DB,
  userId: string,
  workspaceId: string,
): Promise<string> {
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

function relativeTime(date: Date): string {
  const deltaMs = Date.now() - date.getTime();
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
}

const MEMORY_CHAR_BUDGET = 2000;

export async function buildConversationMemorySection(
  db: DB,
  userId: string,
  workspaceId: string,
  currentConversationId: string,
): Promise<string> {
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      summary: conversations.summary,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.workspaceId, workspaceId),
        isNotNull(conversations.summary),
        ne(conversations.id, currentConversationId),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(5);

  if (rows.length === 0) return '';

  const bullets: string[] = [];
  let charCount = 0;

  for (const row of rows) {
    const title = row.title ?? 'Untitled conversation';
    const time = relativeTime(row.updatedAt);
    const bullet = `- **${title}** (${time}): ${row.summary}`;

    if (charCount + bullet.length > MEMORY_CHAR_BUDGET && bullets.length > 0) {
      // Try to truncate at last period
      const remaining = MEMORY_CHAR_BUDGET - charCount;
      const truncated = bullet.slice(0, remaining);
      const lastPeriod = truncated.lastIndexOf('.');
      if (lastPeriod > bullet.indexOf(':')) {
        bullets.push(`${truncated.slice(0, lastPeriod + 1)}`);
      }
      break;
    }

    charCount += bullet.length;
    bullets.push(bullet);
  }

  if (bullets.length === 0) return '';

  return `## Prior conversation context

You have discussed the following topics with this user in previous sessions. Reference these when relevant — do not repeat them verbatim, but use them to provide continuity:

${bullets.join('\n')}`;
}

export async function buildWorkspaceDataSummary(
  db: DB,
  userId: string,
  workspaceId: string,
  currentConversationId?: string,
): Promise<string> {
  // 1. Query workspace
  const [workspace] = await db
    .select({ id: workspaces.id, name: workspaces.name, type: workspaces.type })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)));

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found for user ${userId}`);
  }

  // 2. Run all section builders in parallel
  const builders: Promise<string>[] = [
    buildAccountsSection(db, userId, workspaceId),
    buildHoldingsSection(db, userId, workspaceId),
    buildEntitiesSection(db, userId, workspaceId),
    buildInsightsSection(db, userId, workspaceId),
  ];
  if (currentConversationId) {
    builders.push(buildConversationMemorySection(db, userId, workspaceId, currentConversationId));
  }
  const sections = await Promise.all(builders);

  // 3. Filter out empty sections
  const nonEmpty = sections.filter((s) => s !== '');

  // 4. Assemble
  const header = `## Workspace: "${workspace.name}"\nType: ${workspace.type}`;
  return [header, ...nonEmpty].join('\n\n');
}

export async function buildWorkspaceContext(
  db: DB,
  userId: string,
  workspaceId: string,
  currentConversationId?: string,
): Promise<string> {
  const dataSummary = await buildWorkspaceDataSummary(
    db,
    userId,
    workspaceId,
    currentConversationId,
  );
  return `${SYSTEM_PREAMBLE}\n\n## Current workspace context\n\n${dataSummary}`;
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
      "The following excerpts from the user's uploaded documents are relevant to this query. Cite them using [1], [2], etc. when referencing specific information.",
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
