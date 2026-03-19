// Scenario comparison engine — creates multiple calculator cards + comparison summary page
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { DB } from '../db';
import { canvasItems } from '../db/schema';
import { ITEM_DEFAULTS, createDefaultData } from './canvas-defaults';
import { findBatchPositions } from './auto-position';
import {
  computeProjection,
  computeLoan,
  computeTaxEstimate,
  computeBreakeven,
  computeDepreciation,
  computeRentVsBuy,
} from '../lib/calc';
import type {
  ProjectionCardData,
  ProjectionResult,
  LoanCalculatorData,
  LoanCalculatorResult,
  TaxEstimatorData,
  TaxEstimateResult,
  BreakevenCardData,
  BreakevenResult,
  DepreciationCardData,
  DepreciationResult,
  RentVsBuyCardData,
  RentVsBuyResult,
} from '../lib/calc';

// ─── Types ──────────────────────────────────────────────────────────

export const SUPPORTED_SCENARIO_TYPES = [
  'projection-card',
  'loan-calculator-card',
  'tax-estimator-card',
  'breakeven-card',
  'depreciation-card',
  'rent-vs-buy-card',
] as const;

export type ScenarioCardType = (typeof SUPPORTED_SCENARIO_TYPES)[number];

export interface ScenarioInput {
  label: string;
  type: ScenarioCardType;
  params: Record<string, unknown>;
}

interface CanvasItemRow {
  id: string;
  workspaceId: string;
  userId: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  data: string | undefined;
}

export interface ScenarioComparisonResult {
  pageId: string;
  cardIds: string[];
  summaries: string[];
  createdItems: Array<{
    id: string;
    type: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
    data: Record<string, unknown> | null;
  }>;
  _canvasUpdate: true;
}

// ─── Formatting helpers ─────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ─── Compute + Summarize ────────────────────────────────────────────

interface ComputeResult {
  cardData: Record<string, unknown>;
  summary: string;
  metrics: Record<string, string>;
}

function computeAndSummarize(type: ScenarioCardType, label: string, params: Record<string, unknown>): ComputeResult {
  const defaultData = createDefaultData(type) ?? {};
  const merged = { ...defaultData, ...params };

  switch (type) {
    case 'projection-card': {
      const data = merged as unknown as ProjectionCardData;
      const result: ProjectionResult = computeProjection(data);
      return {
        cardData: merged,
        summary: `Starting with $${fmt(data.startingAmount)}, contributing $${fmt(data.monthlyContribution)}/mo at ${fmtPct(data.annualGrowthRate)}, reaches $${fmt(result.finalBalance)} after ${data.projectionYears} years.`,
        metrics: {
          'Final Balance': `$${fmt(result.finalBalance)}`,
          'Total Contributions': `$${fmt(result.totalContributions)}`,
          'Total Growth': `$${fmt(result.totalGrowth)}`,
        },
      };
    }
    case 'loan-calculator-card': {
      const data = merged as unknown as LoanCalculatorData;
      const result: LoanCalculatorResult = computeLoan(data);
      return {
        cardData: merged,
        summary: `Monthly payment of $${fmt(result.monthlyPI)} with $${fmt(result.totalInterest)} total interest over ${data.loanTermYears} years.`,
        metrics: {
          'Monthly Payment': `$${fmt(result.monthlyPI)}`,
          'Total Interest': `$${fmt(result.totalInterest)}`,
          'Total Cost': `$${fmt(result.totalCost)}`,
        },
      };
    }
    case 'tax-estimator-card': {
      const data = merged as unknown as TaxEstimatorData;
      const result: TaxEstimateResult = computeTaxEstimate(data);
      const refundLabel = result.refundOrOwed >= 0 ? `$${fmt(result.refundOrOwed)} refund` : `$${fmt(Math.abs(result.refundOrOwed))} owed`;
      return {
        cardData: merged,
        summary: `Total tax of $${fmt(result.totalTax)} (${fmtPct(result.effectiveRate)} effective rate), ${refundLabel}.`,
        metrics: {
          'Total Tax': `$${fmt(result.totalTax)}`,
          'Effective Rate': fmtPct(result.effectiveRate),
          'Refund/Owed': refundLabel,
        },
      };
    }
    case 'breakeven-card': {
      const data = merged as unknown as BreakevenCardData;
      const result: BreakevenResult = computeBreakeven(data);
      return {
        cardData: merged,
        summary: `Break-even at ${fmt(result.breakEvenUnits)} units ($${fmt(result.breakEvenRevenue)} revenue), margin $${fmt(result.contributionMargin)}/unit.`,
        metrics: {
          'Break-Even Units': fmt(result.breakEvenUnits),
          'Break-Even Revenue': `$${fmt(result.breakEvenRevenue)}`,
          'Contribution Margin': `$${fmt(result.contributionMargin)}`,
        },
      };
    }
    case 'depreciation-card': {
      const data = merged as unknown as DepreciationCardData;
      const result: DepreciationResult = computeDepreciation(data);
      return {
        cardData: merged,
        summary: `$${fmt(result.annualDepreciation)} annual depreciation over ${data.usefulLifeYears} years (${data.method}).`,
        metrics: {
          'Annual Depreciation': `$${fmt(result.annualDepreciation)}`,
          'Total Depreciation': `$${fmt(result.totalDepreciation)}`,
          Method: data.method,
        },
      };
    }
    case 'rent-vs-buy-card': {
      const data = merged as unknown as RentVsBuyCardData;
      const result: RentVsBuyResult = computeRentVsBuy(data);
      return {
        cardData: merged,
        summary: `Recommendation: ${result.recommendation}. Net difference of $${fmt(Math.abs(result.netDifference))} over ${data.analysisYears} years.`,
        metrics: {
          Recommendation: result.recommendation,
          'Net Difference': `$${fmt(Math.abs(result.netDifference))}`,
          'Monthly Mortgage': `$${fmt(result.monthlyMortgagePI)}`,
        },
      };
    }
  }
}

// ─── Comparison Markdown ────────────────────────────────────────────

function buildComparisonMarkdown(
  comparisonName: string,
  scenarios: ScenarioInput[],
  summaries: string[],
  allMetrics: Record<string, string>[],
): string {
  const lines: string[] = [`# ${comparisonName}`, ''];

  const allSameType = scenarios.every((s) => s.type === scenarios[0]!.type);

  if (allSameType && scenarios.length >= 2) {
    // Table format for same-type comparisons
    const metricKeys = Object.keys(allMetrics[0]!);
    const header = `| Metric | ${scenarios.map((s) => s.label).join(' | ')} |`;
    const separator = `| --- | ${scenarios.map(() => '---').join(' | ')} |`;
    lines.push(header, separator);
    for (const key of metricKeys) {
      const row = `| ${key} | ${allMetrics.map((m) => m[key] ?? '—').join(' | ')} |`;
      lines.push(row);
    }
  } else {
    // Section format for mixed types
    for (let i = 0; i < scenarios.length; i++) {
      const s = scenarios[i]!;
      const metrics = allMetrics[i]!;
      lines.push(`## ${s.label}`, '');
      for (const [key, value] of Object.entries(metrics)) {
        lines.push(`- **${key}:** ${value}`);
      }
      lines.push('');
    }
  }

  lines.push('', '## Summary', '');
  for (let i = 0; i < scenarios.length; i++) {
    lines.push(`- **${scenarios[i]!.label}:** ${summaries[i]}`);
  }

  return lines.join('\n');
}

// ─── Main Orchestrator ──────────────────────────────────────────────

export async function executeScenarioComparison(
  db: DB,
  ctx: { userId: string; workspaceId: string },
  comparisonName: string,
  scenarios: ScenarioInput[],
): Promise<ScenarioComparisonResult> {
  // Validate scenario count
  if (!scenarios || scenarios.length < 2) {
    throw new Error('Scenario comparison requires at least 2 scenarios.');
  }
  if (scenarios.length > 4) {
    throw new Error('Maximum 4 scenarios allowed per comparison.');
  }

  // Validate types
  const supportedSet = new Set<string>(SUPPORTED_SCENARIO_TYPES);
  for (const s of scenarios) {
    if (!supportedSet.has(s.type)) {
      throw new Error(`Unsupported card type "${s.type}". Supported: ${SUPPORTED_SCENARIO_TYPES.join(', ')}`);
    }
  }

  // Compute results for each scenario
  const computeResults: ComputeResult[] = [];
  for (const s of scenarios) {
    computeResults.push(computeAndSummarize(s.type, s.label, s.params));
  }

  const summaries = computeResults.map((r) => r.summary);
  const allMetrics = computeResults.map((r) => r.metrics);

  // Build comparison page markdown
  const pageMarkdown = buildComparisonMarkdown(comparisonName, scenarios, summaries, allMetrics);

  // Get existing items for positioning
  const existingItems = await db
    .select({ x: canvasItems.x, y: canvasItems.y, width: canvasItems.width, height: canvasItems.height })
    .from(canvasItems)
    .where(and(eq(canvasItems.workspaceId, ctx.workspaceId), eq(canvasItems.userId, ctx.userId)));

  // Get max zIndex
  const [maxZ] = await db
    .select({ maxZIndex: sql<number>`COALESCE(MAX(${canvasItems.zIndex}), 0)` })
    .from(canvasItems)
    .where(and(eq(canvasItems.workspaceId, ctx.workspaceId), eq(canvasItems.userId, ctx.userId)));
  let zIndex = (maxZ?.maxZIndex ?? 0) + 1;

  // Build dimensions for page + cards
  const pageDefaults = ITEM_DEFAULTS['a4-page']!;
  const cardDimensions = scenarios.map((s) => ITEM_DEFAULTS[s.type] ?? { width: 340, height: 300 });
  const allDimensions = [{ width: pageDefaults.width, height: pageDefaults.height }, ...cardDimensions];

  // Position all items (page first, then cards)
  const positions = findBatchPositions(existingItems, allDimensions);
  const pagePosition = positions[0]!;
  const cardPositions = positions.slice(1);

  // Build DB rows
  const pageId = randomUUID();
  const pageData = { text: pageMarkdown };
  const dbRows: CanvasItemRow[] = [];

  dbRows.push({
    id: pageId,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    type: 'a4-page',
    name: comparisonName,
    x: pagePosition.x,
    y: pagePosition.y,
    width: pageDefaults.width,
    height: pageDefaults.height,
    zIndex: zIndex++,
    data: JSON.stringify(pageData),
  });

  const cardIds: string[] = [];
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i]!;
    const pos = cardPositions[i]!;
    const dims = cardDimensions[i]!;
    const id = randomUUID();
    cardIds.push(id);

    dbRows.push({
      id,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      type: s.type,
      name: s.label,
      x: pos.x,
      y: pos.y,
      width: dims.width,
      height: dims.height,
      zIndex: zIndex++,
      data: JSON.stringify(computeResults[i]!.cardData),
    });
  }

  // Batch insert
  await db.insert(canvasItems).values(dbRows);

  // Build createdItems for canvas_update SSE events
  const createdItems = dbRows.map((row) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    zIndex: row.zIndex,
    data: row.data ? JSON.parse(row.data) : null,
  }));

  return {
    pageId,
    cardIds,
    summaries,
    createdItems,
    _canvasUpdate: true,
  };
}
