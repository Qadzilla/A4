import { z } from 'zod';

export const insightTypeSchema = z.enum([
  'budget_overspend',
  'low_cash',
  'debt_deadline',
  'portfolio_drift',
  'networth_change',
  'subscription_spike',
  'high_spending_category',
]);

export const insightSeveritySchema = z.enum(['info', 'warning', 'critical']);

export const insightStatusSchema = z.enum(['active', 'dismissed', 'engaged']);

// Type-specific data schemas
export const budgetOverspendDataSchema = z.object({
  categoryName: z.string(),
  budgeted: z.number(),
  actual: z.number(),
  percentOver: z.number(),
});

export const lowCashDataSchema = z.object({
  totalLiquid: z.number(),
  threshold: z.number(),
  lowestAccount: z.string(),
  lowestBalance: z.number(),
});

export const debtDeadlineDataSchema = z.object({
  debtName: z.string(),
  amountDue: z.number(),
  dueDate: z.string(),
  daysUntilDue: z.number(),
});

export const portfolioDriftDataSchema = z.object({
  holdingName: z.string(),
  targetPercent: z.number(),
  actualPercent: z.number(),
  driftPercent: z.number(),
});

export const networthChangeDataSchema = z.object({
  previousNetworth: z.number(),
  currentNetworth: z.number(),
  changePercent: z.number(),
  periodDays: z.number(),
});

export const subscriptionSpikeDataSchema = z.object({
  previousMonthly: z.number(),
  currentMonthly: z.number(),
  changePercent: z.number(),
  newSubscriptions: z.array(z.string()),
});

export const highSpendingCategoryDataSchema = z.object({
  categoryName: z.string(),
  categoryTotal: z.number(),
  totalSpending: z.number(),
  percentOfTotal: z.number(),
});

export const insightDataSchemas = {
  budget_overspend: budgetOverspendDataSchema,
  low_cash: lowCashDataSchema,
  debt_deadline: debtDeadlineDataSchema,
  portfolio_drift: portfolioDriftDataSchema,
  networth_change: networthChangeDataSchema,
  subscription_spike: subscriptionSpikeDataSchema,
  high_spending_category: highSpendingCategoryDataSchema,
} as const;

export const insightSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string(),
  type: insightTypeSchema,
  severity: insightSeveritySchema,
  title: z.string(),
  summary: z.string(),
  data: z.string().nullable(),
  status: insightStatusSchema,
  conversationId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable(),
});

export const createInsightSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string(),
  type: insightTypeSchema,
  severity: insightSeveritySchema,
  title: z.string(),
  summary: z.string(),
  data: z.string().nullable().optional(),
  status: insightStatusSchema.optional(),
  conversationId: z.string().uuid().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const listInsightsInputSchema = z.object({
  workspaceId: z.string().uuid(),
  status: insightStatusSchema.optional(),
  type: insightTypeSchema.optional(),
  severity: insightSeveritySchema.optional(),
});

export const dismissInsightInputSchema = z.object({
  id: z.string().uuid(),
});

export const engageInsightInputSchema = z.object({
  id: z.string().uuid(),
});

export type InsightType = z.infer<typeof insightTypeSchema>;
export type InsightSeverity = z.infer<typeof insightSeveritySchema>;
export type InsightStatus = z.infer<typeof insightStatusSchema>;
export type Insight = z.infer<typeof insightSchema>;
export type CreateInsight = z.infer<typeof createInsightSchema>;
export type ListInsightsInput = z.infer<typeof listInsightsInputSchema>;
export type DismissInsightInput = z.infer<typeof dismissInsightInputSchema>;
export type EngageInsightInput = z.infer<typeof engageInsightInputSchema>;
export type BudgetOverspendData = z.infer<typeof budgetOverspendDataSchema>;
export type LowCashData = z.infer<typeof lowCashDataSchema>;
export type DebtDeadlineData = z.infer<typeof debtDeadlineDataSchema>;
export type PortfolioDriftData = z.infer<typeof portfolioDriftDataSchema>;
export type NetworthChangeData = z.infer<typeof networthChangeDataSchema>;
export type SubscriptionSpikeData = z.infer<typeof subscriptionSpikeDataSchema>;
export type HighSpendingCategoryData = z.infer<typeof highSpendingCategoryDataSchema>;
