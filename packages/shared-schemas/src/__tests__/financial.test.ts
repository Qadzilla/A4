import { describe, expect, it } from 'vitest';
import {
  createTransactionSchema,
  currencySchema,
  transactionFilterSchema,
  transactionTypeSchema,
  updateTransactionSchema,
} from '../financial';

describe('currencySchema', () => {
  it('accepts valid currencies', () => {
    for (const currency of ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'BRL']) {
      expect(currencySchema.safeParse(currency).success).toBe(true);
    }
  });

  it('rejects invalid currencies', () => {
    expect(currencySchema.safeParse('XYZ').success).toBe(false);
  });
});

describe('transactionTypeSchema', () => {
  it('accepts valid types', () => {
    for (const type of ['income', 'expense']) {
      expect(transactionTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it('rejects invalid types', () => {
    expect(transactionTypeSchema.safeParse('transfer').success).toBe(false);
  });
});

describe('createTransactionSchema', () => {
  it('validates a valid transaction', () => {
    const result = createTransactionSchema.safeParse({
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
      date: '2024-06-15',
      description: 'Client payment',
      amount: 1500,
      type: 'income',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional categoryId and notes', () => {
    const result = createTransactionSchema.safeParse({
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
      date: '2024-06-15',
      description: 'Office supplies',
      amount: 42.5,
      type: 'expense',
      categoryId: '550e8400-e29b-41d4-a716-446655440001',
      notes: 'Printer paper and ink',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative amount', () => {
    const result = createTransactionSchema.safeParse({
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
      date: '2024-06-15',
      description: 'Bad',
      amount: -100,
      type: 'expense',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateTransactionSchema', () => {
  it('validates partial update', () => {
    const result = updateTransactionSchema.safeParse({ amount: 200 });
    expect(result.success).toBe(true);
  });

  it('validates empty update', () => {
    const result = updateTransactionSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('transactionFilterSchema', () => {
  it('validates filter with workspaceId only', () => {
    const result = transactionFilterSchema.safeParse({
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('validates filter with all fields', () => {
    const result = transactionFilterSchema.safeParse({
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'income',
      categoryId: '550e8400-e29b-41d4-a716-446655440001',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing workspaceId', () => {
    const result = transactionFilterSchema.safeParse({ type: 'income' });
    expect(result.success).toBe(false);
  });
});
