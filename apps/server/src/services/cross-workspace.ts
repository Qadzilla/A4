import { and, eq } from 'drizzle-orm';
import type { DB } from '../db';
import { workspaces } from '../db/schema';
import { executeTool } from './ai-tools';
import type { ToolContext } from './ai-tools';
import { buildWorkspaceDataSummary } from './ai-context';

export async function verifyWorkspaceAccess(
  db: DB,
  userId: string,
  targetWorkspaceId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, targetWorkspaceId), eq(workspaces.userId, userId)));
  return !!row;
}

const KEYWORD_DISPATCH: [string[], string][] = [
  [['account', 'balance', 'cash'], 'get_accounts'],
  [['budget', 'spending', 'expense'], 'get_budget'],
  [['networth', 'net worth', 'assets'], 'get_networth'],
  [['subscription', 'recurring'], 'get_subscriptions'],
  [['debt', 'loan', 'owe'], 'get_debts'],
  [['holding', 'investment', 'portfolio', 'stock'], 'get_holdings'],
  [['invoice'], 'get_invoices'],
];

export async function dispatchWorkspaceQuery(
  db: DB,
  userId: string,
  targetWorkspaceId: string,
  question: string,
): Promise<string> {
  // Fetch workspace name for the header
  const [workspace] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(and(eq(workspaces.id, targetWorkspaceId), eq(workspaces.userId, userId)));

  const workspaceName = workspace?.name ?? 'Unknown';
  const lowerQuestion = question.toLowerCase();

  // Find matching tools based on keywords
  const matchedTools = new Set<string>();
  for (const [keywords, toolName] of KEYWORD_DISPATCH) {
    for (const kw of keywords) {
      if (lowerQuestion.includes(kw)) {
        matchedTools.add(toolName);
        break;
      }
    }
  }

  const tempCtx: ToolContext = { db, userId, workspaceId: targetWorkspaceId };

  let resultText: string;

  if (matchedTools.size > 0) {
    // Run matched tools and concatenate results
    const results = await Promise.all(
      [...matchedTools].map(async (toolName) => {
        const result = await executeTool(toolName, {}, tempCtx);
        return JSON.stringify(result, null, 2);
      }),
    );
    resultText = results.join('\n\n');
  } else {
    // Fallback: build a full workspace data summary
    resultText = await buildWorkspaceDataSummary(db, userId, targetWorkspaceId);
  }

  return `Data from workspace '${workspaceName}':\n\n${resultText}`;
}
