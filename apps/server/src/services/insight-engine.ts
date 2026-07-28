import type { InsightSeverity, InsightType } from '@a4/shared-schemas';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { DB } from '../db';
import { accounts, holdings, workspaceInsights } from '../db/schema';

interface InsightCandidate {
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  summary: string;
  data: Record<string, unknown> | null;
  expiresAt: Date | null;
  dedupeKey: string;
}

// ─── Relevance Scoring ──────────────────────────────────────────────────────

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 1.0,
  warning: 0.6,
  info: 0.3,
};

const CONFIDENCE_BY_TYPE: Record<string, number> = {
  low_cash: 1.0,
  debt_deadline: 1.0,
  budget_overspend: 1.0,
  portfolio_drift: 0.8,
  high_spending_category: 0.8,
  networth_change: 0.7,
  subscription_spike: 0.6,
};

export function scoreInsight(insight: { type: string; severity: string; createdAt: Date }): number {
  const severity = SEVERITY_WEIGHTS[insight.severity] ?? 0.3;
  const ageHours = (Date.now() - insight.createdAt.getTime()) / (1000 * 60 * 60);
  const recency = Math.max(0, Math.min(1, 1.0 - ageHours / 168));
  const confidence = CONFIDENCE_BY_TYPE[insight.type] ?? 0.5;
  return severity * 0.5 + recency * 0.3 + confidence * 0.2;
}

function endOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

// ─── Analyzer: Low Cash ──────────────────────────────────────────────────────

export async function analyzeLowCash(
  db: DB,
  userId: string,
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const rows = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.workspaceId, workspaceId),
        eq(accounts.userId, userId),
        or(eq(accounts.type, 'checking'), eq(accounts.type, 'savings')),
      ),
    );

  if (rows.length === 0) return [];

  let totalLiquid = 0;
  let lowestAccount = rows[0]!;
  for (const row of rows) {
    totalLiquid += row.balance;
    if (row.balance < lowestAccount.balance) lowestAccount = row;
  }

  if (totalLiquid >= 500) return [];

  let severity: InsightSeverity = 'warning';
  if (totalLiquid < 100) severity = 'critical';

  return [
    {
      type: 'low_cash',
      severity,
      title: `Cash reserves ${severity === 'critical' ? 'critically' : 'dangerously'} low`,
      summary: `Your total liquid balance across ${rows.length} account(s) is $${totalLiquid.toFixed(0)}.`,
      data: {
        dedupeKey: 'low_cash:workspace',
        totalLiquid,
        threshold: 500,
        lowestAccount: lowestAccount.name,
        lowestBalance: lowestAccount.balance,
      },
      expiresAt: null,
      dedupeKey: 'low_cash:workspace',
    },
  ];
}

// ─── Analyzer: Portfolio Drift ───────────────────────────────────────────────

export async function analyzePortfolioDrift(
  db: DB,
  userId: string,
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const rows = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.workspaceId, workspaceId), eq(holdings.userId, userId)));

  if (rows.length === 0) return [];

  const totalValue = rows.reduce((sum, r) => sum + r.value, 0);
  if (totalValue === 0) return [];

  const insights: InsightCandidate[] = [];

  for (const row of rows) {
    if (row.targetPct <= 0) continue;

    const actualPct = (row.value / totalValue) * 100;
    const drift = Math.abs(actualPct - row.targetPct);

    if (drift <= 5) continue;

    let severity: InsightSeverity = 'warning';
    if (drift > 15) severity = 'critical';

    insights.push({
      type: 'portfolio_drift',
      severity,
      title: `${row.symbol} drifted ${Math.round(drift)}% from target`,
      summary: `${row.name} is at ${actualPct.toFixed(1)}% vs target ${row.targetPct}%.`,
      data: {
        dedupeKey: `portfolio_drift:${row.id}`,
        holdingName: row.name,
        targetPercent: row.targetPct,
        actualPercent: Math.round(actualPct * 10) / 10,
        driftPercent: Math.round(drift * 10) / 10,
      },
      expiresAt: null,
      dedupeKey: `portfolio_drift:${row.id}`,
    });
  }

  return insights;
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function generateInsights(
  db: DB,
  userId: string,
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const [results, activeInsights, allInsightsForStats] = await Promise.all([
    Promise.all([
      analyzeLowCash(db, userId, workspaceId),
      analyzePortfolioDrift(db, userId, workspaceId),
    ]),
    db
      .select()
      .from(workspaceInsights)
      .where(
        and(
          eq(workspaceInsights.workspaceId, workspaceId),
          eq(workspaceInsights.userId, userId),
          eq(workspaceInsights.status, 'active'),
        ),
      ),
    db
      .select({ type: workspaceInsights.type, status: workspaceInsights.status })
      .from(workspaceInsights)
      .where(
        and(eq(workspaceInsights.workspaceId, workspaceId), eq(workspaceInsights.userId, userId)),
      ),
  ]);

  const allCandidates = results.flat();

  // Deduplicate against existing active insights
  const existingDedupeKeys = new Set<string>();
  for (const insight of activeInsights) {
    if (insight.data) {
      try {
        const parsed = JSON.parse(insight.data);
        if (parsed.dedupeKey) {
          existingDedupeKeys.add(parsed.dedupeKey);
        }
      } catch {
        // Skip malformed data
      }
    }
  }

  // Compute engagement-aware suppression
  const suppressedTypes = new Set<string>();
  const typeStats: Record<string, { dismissed: number; engaged: number }> = {};
  for (const row of allInsightsForStats) {
    if (!typeStats[row.type]) typeStats[row.type] = { dismissed: 0, engaged: 0 };
    if (row.status === 'dismissed') typeStats[row.type]!.dismissed++;
    if (row.status === 'engaged') typeStats[row.type]!.engaged++;
  }
  for (const [type, stats] of Object.entries(typeStats)) {
    const acted = stats.dismissed + stats.engaged;
    const rate = acted > 0 ? stats.engaged / acted : 0;
    if (stats.dismissed > 5 && rate < 0.1) {
      suppressedTypes.add(type);
    }
  }

  return allCandidates
    .filter((c) => !existingDedupeKeys.has(c.dedupeKey))
    .filter((c) => !suppressedTypes.has(c.type));
}
