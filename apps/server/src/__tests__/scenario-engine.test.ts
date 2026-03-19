import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import * as schema from '../db/schema';
import { executeScenarioComparison, type ScenarioInput } from '../services/scenario-engine';

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

function createTestDb(): TestDb {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      thumbnail TEXT,
      type TEXT NOT NULL DEFAULT 'workspace',
      parent_id TEXT,
      deleted_at INTEGER
    );
    CREATE TABLE canvas_items (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      z_index INTEGER NOT NULL,
      data TEXT
    );
  `);
  const db = drizzle(sqlite, { schema });
  // Insert a workspace
  sqlite.exec(`INSERT INTO workspaces (id, name, user_id, created_at, updated_at, type) VALUES ('ws-1', 'Test Workspace', 'user-1', 0, 0, 'workspace')`);
  return db;
}

function ctx() {
  return { userId: 'user-1', workspaceId: 'ws-1' };
}

describe('scenario-engine', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  it('creates 2 scenario cards + 1 comparison page', async () => {
    const scenarios: ScenarioInput[] = [
      { label: 'Conservative', type: 'projection-card', params: { annualGrowthRate: 5 } },
      { label: 'Aggressive', type: 'projection-card', params: { annualGrowthRate: 10 } },
    ];

    const result = await executeScenarioComparison(db as any, ctx(), 'Growth Comparison', scenarios);

    expect(result.pageId).toBeTruthy();
    expect(result.cardIds).toHaveLength(2);
    expect(result.createdItems).toHaveLength(3); // 1 page + 2 cards
    expect(result.createdItems[0]!.type).toBe('a4-page');
    expect(result.createdItems[1]!.type).toBe('projection-card');
    expect(result.createdItems[2]!.type).toBe('projection-card');

    // Verify DB rows
    const rows = db.select().from(schema.canvasItems).all();
    expect(rows).toHaveLength(3);
  });

  it('creates 4 scenario cards + 1 comparison page', async () => {
    const scenarios: ScenarioInput[] = [
      { label: 'A', type: 'projection-card', params: { annualGrowthRate: 4 } },
      { label: 'B', type: 'projection-card', params: { annualGrowthRate: 6 } },
      { label: 'C', type: 'projection-card', params: { annualGrowthRate: 8 } },
      { label: 'D', type: 'projection-card', params: { annualGrowthRate: 10 } },
    ];

    const result = await executeScenarioComparison(db as any, ctx(), '4-Way Comparison', scenarios);
    expect(result.createdItems).toHaveLength(5);

    const rows = db.select().from(schema.canvasItems).all();
    expect(rows).toHaveLength(5);
  });

  it('positions items using batch layout with consistent gaps', async () => {
    const scenarios: ScenarioInput[] = [
      { label: 'Loan A', type: 'loan-calculator-card', params: { homePrice: 300000 } },
      { label: 'Loan B', type: 'loan-calculator-card', params: { homePrice: 400000 } },
    ];

    const result = await executeScenarioComparison(db as any, ctx(), 'Loan Comparison', scenarios);

    // Page + 2 cards = 3 items, all positioned
    expect(result.createdItems).toHaveLength(3);
    const page = result.createdItems[0]!;
    const card1 = result.createdItems[1]!;

    // Card1 starts after page with 40px gap
    expect(card1.x).toBe(page.x + page.width + 40);
  });

  it('positions comparison page above or beside scenario cards via batch layout', async () => {
    const scenarios: ScenarioInput[] = [
      { label: 'Low', type: 'breakeven-card', params: { fixedCosts: 3000 } },
      { label: 'High', type: 'breakeven-card', params: { fixedCosts: 10000 } },
    ];

    const result = await executeScenarioComparison(db as any, ctx(), 'Breakeven Compare', scenarios);

    const page = result.createdItems[0]!;
    const card1 = result.createdItems[1]!;

    // Page is positioned before cards in the batch layout (same row or above)
    expect(page.y).toBeLessThanOrEqual(card1.y);
  });

  it('populates card data with scenario parameters', async () => {
    const scenarios: ScenarioInput[] = [
      { label: '15-Year', type: 'loan-calculator-card', params: { homePrice: 500000, annualInterestRate: 5.5, loanTermYears: 15 } },
      { label: '30-Year', type: 'loan-calculator-card', params: { homePrice: 500000, annualInterestRate: 6.5, loanTermYears: 30 } },
    ];

    const result = await executeScenarioComparison(db as any, ctx(), 'Mortgage Comparison', scenarios);

    const card1Data = result.createdItems[1]!.data as Record<string, unknown>;
    expect(card1Data.homePrice).toBe(500000);
    expect(card1Data.annualInterestRate).toBe(5.5);
    expect(card1Data.loanTermYears).toBe(15);

    const card2Data = result.createdItems[2]!.data as Record<string, unknown>;
    expect(card2Data.loanTermYears).toBe(30);
    expect(card2Data.annualInterestRate).toBe(6.5);
  });

  it('generates text summaries with numbers', async () => {
    const scenarios: ScenarioInput[] = [
      { label: 'Plan A', type: 'projection-card', params: { startingAmount: 50000, monthlyContribution: 1000 } },
      { label: 'Plan B', type: 'projection-card', params: { startingAmount: 10000, monthlyContribution: 2000 } },
    ];

    const result = await executeScenarioComparison(db as any, ctx(), 'Savings Plans', scenarios);

    expect(result.summaries).toHaveLength(2);
    expect(result.summaries[0]).toMatch(/\$[\d,]+/); // Contains dollar amounts
    expect(result.summaries[1]).toMatch(/\$[\d,]+/);
  });

  it('creates comparison page with markdown table for same-type scenarios', async () => {
    const scenarios: ScenarioInput[] = [
      { label: '15-Year', type: 'loan-calculator-card', params: { homePrice: 400000, loanTermYears: 15, annualInterestRate: 5.5 } },
      { label: '30-Year', type: 'loan-calculator-card', params: { homePrice: 400000, loanTermYears: 30, annualInterestRate: 6.5 } },
    ];

    const result = await executeScenarioComparison(db as any, ctx(), 'Mortgage Compare', scenarios);

    const pageData = result.createdItems[0]!.data as { text: string };
    expect(pageData.text).toContain('15-Year');
    expect(pageData.text).toContain('30-Year');
    expect(pageData.text).toContain('Monthly Payment');
    expect(pageData.text).toContain('| Metric |');
  });

  it('rejects fewer than 2 scenarios', async () => {
    const scenarios: ScenarioInput[] = [
      { label: 'Only One', type: 'projection-card', params: {} },
    ];

    await expect(
      executeScenarioComparison(db as any, ctx(), 'Solo', scenarios),
    ).rejects.toThrow('at least 2');
  });

  it('rejects more than 4 scenarios', async () => {
    const scenarios: ScenarioInput[] = Array.from({ length: 5 }, (_, i) => ({
      label: `Scenario ${i}`,
      type: 'projection-card' as const,
      params: {},
    }));

    await expect(
      executeScenarioComparison(db as any, ctx(), 'Too Many', scenarios),
    ).rejects.toThrow('Maximum 4');
  });

  it('rejects unsupported card type', async () => {
    const scenarios = [
      { label: 'Note', type: 'note' as any, params: {} },
      { label: 'Another', type: 'note' as any, params: {} },
    ];

    await expect(
      executeScenarioComparison(db as any, ctx(), 'Bad Types', scenarios),
    ).rejects.toThrow('Unsupported card type');
  });

  it('handles mixed card types with section format', async () => {
    const scenarios: ScenarioInput[] = [
      { label: 'Mortgage', type: 'loan-calculator-card', params: { homePrice: 400000, annualInterestRate: 6.5 } },
      { label: 'Investment', type: 'projection-card', params: { startingAmount: 80000, monthlyContribution: 1000 } },
    ];

    const result = await executeScenarioComparison(db as any, ctx(), 'Mixed Compare', scenarios);

    expect(result.createdItems).toHaveLength(3);
    expect(result.createdItems[1]!.type).toBe('loan-calculator-card');
    expect(result.createdItems[2]!.type).toBe('projection-card');

    // Mixed types use section format, not table
    const pageData = result.createdItems[0]!.data as { text: string };
    expect(pageData.text).toContain('## Mortgage');
    expect(pageData.text).toContain('## Investment');
  });
});
