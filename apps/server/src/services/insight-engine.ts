import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { DB } from '../db';
import {
  accounts,
  budgetCategories,
  holdings,
  networthEntries,
  subscriptions,
  workspaceInsights,
} from '../db/schema';
import type { InsightSeverity, InsightType } from '@a4/shared-schemas';

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

// ─── Analyzer 1: Budget Overspend ────────────────────────────────────────────

export async function analyzeBudgetOverspend(
  db: DB,
  userId: string,
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const rows = await db
    .select()
    .from(budgetCategories)
    .where(
      and(
        eq(budgetCategories.workspaceId, workspaceId),
        eq(budgetCategories.userId, userId),
      ),
    );

  const insights: InsightCandidate[] = [];
  const expires = endOfMonth();

  for (const row of rows) {
    if (row.budgeted <= 0 || row.actual <= row.budgeted) continue;

    const percentOver = ((row.actual - row.budgeted) / row.budgeted) * 100;
    let severity: InsightSeverity = 'info';
    if (percentOver >= 50) severity = 'critical';
    else if (percentOver >= 20) severity = 'warning';

    insights.push({
      type: 'budget_overspend',
      severity,
      title: `${row.name} budget ${Math.round(percentOver)}% over`,
      summary: `You spent $${row.actual.toFixed(0)} of your $${row.budgeted.toFixed(0)} ${row.name} budget this month.`,
      data: {
        dedupeKey: `budget_overspend:${row.id}`,
        categoryName: row.name,
        budgeted: row.budgeted,
        actual: row.actual,
        percentOver: Math.round(percentOver),
      },
      expiresAt: expires,
      dedupeKey: `budget_overspend:${row.id}`,
    });
  }

  return insights;
}

// ─── Analyzer 2: Low Cash ────────────────────────────────────────────────────

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

// ─── Analyzer 3: Debt Deadline ───────────────────────────────────────────────

export async function analyzeDebtDeadline(
  _db: DB,
  _userId: string,
  _workspaceId: string,
): Promise<InsightCandidate[]> {
  // TODO: requires dueDate column on debts table
  return [];
}

// ─── Analyzer 4: Portfolio Drift ─────────────────────────────────────────────

export async function analyzePortfolioDrift(
  db: DB,
  userId: string,
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const rows = await db
    .select()
    .from(holdings)
    .where(
      and(
        eq(holdings.workspaceId, workspaceId),
        eq(holdings.userId, userId),
      ),
    );

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

// ─── Analyzer 5: Net Worth Change ────────────────────────────────────────────

export async function analyzeNetworthChange(
  db: DB,
  userId: string,
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const rows = await db
    .select()
    .from(networthEntries)
    .where(
      and(
        eq(networthEntries.workspaceId, workspaceId),
        eq(networthEntries.userId, userId),
      ),
    )
    .orderBy(desc(networthEntries.createdAt))
    .limit(2);

  if (rows.length < 2) return [];

  const current = rows[0]!;
  const previous = rows[1]!;

  const daysBetween =
    (current.createdAt.getTime() - previous.createdAt.getTime()) /
    (1000 * 60 * 60 * 24);

  if (daysBetween < 7) return [];
  if (previous.value === 0) return [];

  const changePercent =
    ((current.value - previous.value) / Math.abs(previous.value)) * 100;

  if (Math.abs(changePercent) <= 10) return [];

  let severity: InsightSeverity = 'info';
  if (changePercent < -20) severity = 'critical';

  const direction = changePercent > 0 ? 'increased' : 'decreased';

  return [
    {
      type: 'networth_change',
      severity,
      title: `Net worth ${direction} ${Math.abs(Math.round(changePercent))}%`,
      summary: `Your net worth went from $${previous.value.toFixed(0)} to $${current.value.toFixed(0)} over ${Math.round(daysBetween)} days.`,
      data: {
        dedupeKey: 'networth_change:latest',
        previousNetworth: previous.value,
        currentNetworth: current.value,
        changePercent: Math.round(changePercent * 10) / 10,
        periodDays: Math.round(daysBetween),
      },
      expiresAt: null,
      dedupeKey: 'networth_change:latest',
    },
  ];
}

// ─── Analyzer 6: Subscription Spike ─────────────────────────────────────────

const FREQUENCY_MULTIPLIERS: Record<string, number> = {
  weekly: 4.33,
  biweekly: 2.17,
  monthly: 1,
  quarterly: 1 / 3,
  annual: 1 / 12,
};

export async function analyzeSubscriptionSpike(
  db: DB,
  userId: string,
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, 'active'),
      ),
    );

  let currentMonthly = 0;
  for (const row of rows) {
    const multiplier = FREQUENCY_MULTIPLIERS[row.frequency] ?? 1;
    currentMonthly += row.amount * multiplier;
  }

  // Get baseline from most recent active or dismissed subscription_spike insight
  const [baselineInsight] = await db
    .select()
    .from(workspaceInsights)
    .where(
      and(
        eq(workspaceInsights.workspaceId, workspaceId),
        eq(workspaceInsights.userId, userId),
        eq(workspaceInsights.type, 'subscription_spike'),
        or(
          eq(workspaceInsights.status, 'active'),
          eq(workspaceInsights.status, 'dismissed'),
        ),
      ),
    )
    .orderBy(desc(workspaceInsights.createdAt))
    .limit(1);

  if (!baselineInsight?.data) return [];

  let baseline: number;
  try {
    const parsed = JSON.parse(baselineInsight.data);
    baseline = parsed.currentMonthly;
  } catch {
    return [];
  }

  if (typeof baseline !== 'number' || baseline <= 0) return [];

  const changePercent = ((currentMonthly - baseline) / baseline) * 100;
  if (changePercent <= 15) return [];

  let severity: InsightSeverity = 'info';
  if (changePercent > 50) severity = 'warning';

  const newSubs = rows
    .filter((r) => {
      const created = r.createdAt.getTime();
      const baselineTime = baselineInsight.createdAt.getTime();
      return created > baselineTime;
    })
    .map((r) => r.name);

  return [
    {
      type: 'subscription_spike',
      severity,
      title: `Subscriptions up ${Math.round(changePercent)}%`,
      summary: `Monthly subscription cost went from $${baseline.toFixed(0)} to $${currentMonthly.toFixed(0)}.`,
      data: {
        dedupeKey: 'subscription_spike:monthly',
        previousMonthly: baseline,
        currentMonthly,
        changePercent: Math.round(changePercent * 10) / 10,
        newSubscriptions: newSubs,
      },
      expiresAt: endOfMonth(),
      dedupeKey: 'subscription_spike:monthly',
    },
  ];
}

// ─── Analyzer 7: High Spending Category ──────────────────────────────────────

export async function analyzeHighSpendingCategory(
  db: DB,
  userId: string,
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const rows = await db
    .select()
    .from(budgetCategories)
    .where(
      and(
        eq(budgetCategories.workspaceId, workspaceId),
        eq(budgetCategories.userId, userId),
      ),
    );

  const withSpending = rows.filter((r) => r.actual > 0);
  if (withSpending.length <= 1) return [];

  const totalSpending = withSpending.reduce((sum, r) => sum + r.actual, 0);
  if (totalSpending === 0) return [];

  const insights: InsightCandidate[] = [];
  const expires = endOfMonth();

  for (const row of withSpending) {
    const percentOfTotal = (row.actual / totalSpending) * 100;
    if (percentOfTotal <= 40) continue;

    let severity: InsightSeverity = 'info';
    if (percentOfTotal > 60) severity = 'warning';

    insights.push({
      type: 'high_spending_category',
      severity,
      title: `${row.name} is ${Math.round(percentOfTotal)}% of spending`,
      summary: `$${row.actual.toFixed(0)} out of $${totalSpending.toFixed(0)} total spending is in ${row.name}.`,
      data: {
        dedupeKey: `high_spending_category:${row.id}`,
        categoryName: row.name,
        categoryTotal: row.actual,
        totalSpending,
        percentOfTotal: Math.round(percentOfTotal * 10) / 10,
      },
      expiresAt: expires,
      dedupeKey: `high_spending_category:${row.id}`,
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
      analyzeBudgetOverspend(db, userId, workspaceId),
      analyzeLowCash(db, userId, workspaceId),
      analyzeDebtDeadline(db, userId, workspaceId),
      analyzePortfolioDrift(db, userId, workspaceId),
      analyzeNetworthChange(db, userId, workspaceId),
      analyzeSubscriptionSpike(db, userId, workspaceId),
      analyzeHighSpendingCategory(db, userId, workspaceId),
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
        and(
          eq(workspaceInsights.workspaceId, workspaceId),
          eq(workspaceInsights.userId, userId),
        ),
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
