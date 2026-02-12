import { describe, expect, it } from 'vitest';
import { currencySchema, financialFilterSchema, transactionTypeSchema } from '../financial';

describe('currencySchema', () => {
  it('accepts valid currencies', () => {
    for (const currency of ['USD', 'EUR', 'GBP', 'CAD', 'AUD']) {
      expect(currencySchema.safeParse(currency).success).toBe(true);
    }
  });

  it('rejects invalid currencies', () => {
    expect(currencySchema.safeParse('JPY').success).toBe(false);
  });
});

describe('transactionTypeSchema', () => {
  it('accepts valid types', () => {
    for (const type of ['income', 'expense', 'transfer']) {
      expect(transactionTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it('rejects invalid types', () => {
    expect(transactionTypeSchema.safeParse('refund').success).toBe(false);
  });
});

describe('financialFilterSchema', () => {
  it('validates empty filter', () => {
    const result = financialFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('validates filter with all fields', () => {
    const result = financialFilterSchema.safeParse({
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'income',
      category: 'Sales',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      currency: 'USD',
    });
    expect(result.success).toBe(true);
  });
});
