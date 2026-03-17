import { describe, expect, it } from 'vitest';
import {
  budgetOverspendDataSchema,
  createInsightSchema,
  debtDeadlineDataSchema,
  dismissInsightInputSchema,
  engageInsightInputSchema,
  highSpendingCategoryDataSchema,
  insightSchema,
  insightSeveritySchema,
  insightStatusSchema,
  insightTypeSchema,
  listInsightsInputSchema,
  lowCashDataSchema,
  networthChangeDataSchema,
  portfolioDriftDataSchema,
  subscriptionSpikeDataSchema,
} from '../insights';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

describe('insightTypeSchema', () => {
  it('validates all 7 insight types', () => {
    const types = [
      'budget_overspend',
      'low_cash',
      'debt_deadline',
      'portfolio_drift',
      'networth_change',
      'subscription_spike',
      'high_spending_category',
    ];
    for (const t of types) {
      expect(insightTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it('rejects invalid insight type', () => {
    expect(insightTypeSchema.safeParse('invalid_type').success).toBe(false);
  });
});

describe('insightSeveritySchema', () => {
  it('validates info, warning, critical', () => {
    expect(insightSeveritySchema.safeParse('info').success).toBe(true);
    expect(insightSeveritySchema.safeParse('warning').success).toBe(true);
    expect(insightSeveritySchema.safeParse('critical').success).toBe(true);
  });

  it('rejects unknown severity', () => {
    expect(insightSeveritySchema.safeParse('urgent').success).toBe(false);
  });
});

describe('insightStatusSchema', () => {
  it('validates active, dismissed, engaged', () => {
    expect(insightStatusSchema.safeParse('active').success).toBe(true);
    expect(insightStatusSchema.safeParse('dismissed').success).toBe(true);
    expect(insightStatusSchema.safeParse('engaged').success).toBe(true);
  });

  it('rejects unknown status', () => {
    expect(insightStatusSchema.safeParse('archived').success).toBe(false);
  });
});

describe('insightSchema', () => {
  it('validates a complete insight object', () => {
    const result = insightSchema.safeParse({
      id: UUID,
      workspaceId: UUID,
      userId: 'user-1',
      type: 'budget_overspend',
      severity: 'warning',
      title: 'Dining budget 40% over',
      summary: 'You spent $700 of your $500 dining budget.',
      data: JSON.stringify({ categoryName: 'Dining', budgeted: 500, actual: 700, percentOver: 40 }),
      status: 'active',
      conversationId: UUID,
      createdAt: NOW,
      expiresAt: NOW,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('budget_overspend');
      expect(result.data.severity).toBe('warning');
      expect(result.data.status).toBe('active');
    }
  });

  it('coerces date strings to Date objects', () => {
    const result = insightSchema.safeParse({
      id: UUID,
      workspaceId: UUID,
      userId: 'user-1',
      type: 'low_cash',
      severity: 'critical',
      title: 'Low cash',
      summary: 'Cash is low.',
      data: null,
      status: 'active',
      conversationId: null,
      createdAt: '2026-03-15T10:00:00Z',
      expiresAt: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });

  it('allows null data and expiresAt', () => {
    const result = insightSchema.safeParse({
      id: UUID,
      workspaceId: UUID,
      userId: 'user-1',
      type: 'networth_change',
      severity: 'info',
      title: 'Net worth up',
      summary: 'Net worth increased.',
      data: null,
      status: 'active',
      conversationId: null,
      createdAt: NOW,
      expiresAt: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data).toBeNull();
      expect(result.data.expiresAt).toBeNull();
    }
  });

  it('rejects missing required fields', () => {
    const result = insightSchema.safeParse({
      id: UUID,
      type: 'low_cash',
    });
    expect(result.success).toBe(false);
  });
});

describe('insightDataSchemas', () => {
  it('validates budget_overspend data', () => {
    const result = budgetOverspendDataSchema.safeParse({
      categoryName: 'Dining',
      budgeted: 500,
      actual: 700,
      percentOver: 40,
    });
    expect(result.success).toBe(true);
  });

  it('validates low_cash data', () => {
    const result = lowCashDataSchema.safeParse({
      totalLiquid: 250,
      threshold: 500,
      lowestAccount: 'Checking',
      lowestBalance: 120,
    });
    expect(result.success).toBe(true);
  });

  it('validates debt_deadline data', () => {
    const result = debtDeadlineDataSchema.safeParse({
      debtName: 'Credit Card',
      amountDue: 1500,
      dueDate: '2026-03-20',
      daysUntilDue: 4,
    });
    expect(result.success).toBe(true);
  });

  it('validates portfolio_drift data', () => {
    const result = portfolioDriftDataSchema.safeParse({
      holdingName: 'AAPL',
      targetPercent: 20,
      actualPercent: 28,
      driftPercent: 8,
    });
    expect(result.success).toBe(true);
  });

  it('validates networth_change data', () => {
    const result = networthChangeDataSchema.safeParse({
      previousNetworth: 100000,
      currentNetworth: 110000,
      changePercent: 10,
      periodDays: 30,
    });
    expect(result.success).toBe(true);
  });

  it('validates subscription_spike data', () => {
    const result = subscriptionSpikeDataSchema.safeParse({
      previousMonthly: 50,
      currentMonthly: 80,
      changePercent: 60,
      newSubscriptions: ['Netflix', 'Spotify'],
    });
    expect(result.success).toBe(true);
  });

  it('validates high_spending_category data', () => {
    const result = highSpendingCategoryDataSchema.safeParse({
      categoryName: 'Rent',
      categoryTotal: 2000,
      totalSpending: 4500,
      percentOfTotal: 44.4,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid budget_overspend data', () => {
    const result = budgetOverspendDataSchema.safeParse({
      categoryName: 'Dining',
      budgeted: 'not-a-number',
    });
    expect(result.success).toBe(false);
  });
});

describe('createInsightSchema', () => {
  it('validates with required fields only', () => {
    const result = createInsightSchema.safeParse({
      workspaceId: UUID,
      userId: 'user-1',
      type: 'low_cash',
      severity: 'critical',
      title: 'Low cash',
      summary: 'Cash is critically low.',
    });
    expect(result.success).toBe(true);
  });

  it('validates with all optional fields', () => {
    const result = createInsightSchema.safeParse({
      workspaceId: UUID,
      userId: 'user-1',
      type: 'budget_overspend',
      severity: 'warning',
      title: 'Over budget',
      summary: 'Dining is over budget.',
      data: JSON.stringify({ categoryName: 'Dining', budgeted: 500, actual: 700, percentOver: 40 }),
      status: 'active',
      conversationId: null,
      expiresAt: '2026-04-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing workspaceId', () => {
    const result = createInsightSchema.safeParse({
      userId: 'user-1',
      type: 'low_cash',
      severity: 'critical',
      title: 'Low cash',
      summary: 'Cash is low.',
    });
    expect(result.success).toBe(false);
  });
});

describe('listInsightsInputSchema', () => {
  it('validates with workspaceId only', () => {
    const result = listInsightsInputSchema.safeParse({ workspaceId: UUID });
    expect(result.success).toBe(true);
  });

  it('validates with all filters', () => {
    const result = listInsightsInputSchema.safeParse({
      workspaceId: UUID,
      status: 'active',
      type: 'budget_overspend',
      severity: 'warning',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status filter', () => {
    const result = listInsightsInputSchema.safeParse({
      workspaceId: UUID,
      status: 'archived',
    });
    expect(result.success).toBe(false);
  });
});

describe('dismissInsightInputSchema', () => {
  it('validates with a UUID id', () => {
    const result = dismissInsightInputSchema.safeParse({ id: UUID });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID id', () => {
    const result = dismissInsightInputSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('engageInsightInputSchema', () => {
  it('validates with a UUID id', () => {
    const result = engageInsightInputSchema.safeParse({ id: UUID });
    expect(result.success).toBe(true);
  });

  it('rejects missing id', () => {
    const result = engageInsightInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
