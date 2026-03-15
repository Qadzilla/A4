import { describe, expect, it } from 'vitest';
import { findNextPosition, findBatchPositions } from '../services/auto-position';
import { ITEM_DEFAULTS, defaultNames, createDefaultData } from '../services/canvas-defaults';

describe('findNextPosition', () => {
  it('returns (100,100) when no existing items', () => {
    expect(findNextPosition([], 300, 200)).toEqual({ x: 100, y: 100 });
  });

  it('places below lowest existing item with 40px gap', () => {
    const items = [{ x: 100, y: 100, width: 300, height: 200 }];
    expect(findNextPosition(items, 300, 200)).toEqual({ x: 100, y: 340 });
  });

  it('handles multiple items at different Y levels', () => {
    const items = [
      { x: 100, y: 100, width: 300, height: 200 },
      { x: 500, y: 50, width: 200, height: 500 },
      { x: 200, y: 300, width: 100, height: 100 },
    ];
    // Max bottom is 50 + 500 = 550
    expect(findNextPosition(items, 300, 200)).toEqual({ x: 100, y: 590 });
  });

  it('handles items at negative coordinates', () => {
    const items = [{ x: -200, y: -100, width: 300, height: 50 }];
    // Bottom = -100 + 50 = -50
    expect(findNextPosition(items, 300, 200)).toEqual({ x: 100, y: -10 });
  });
});

describe('findBatchPositions', () => {
  it('places items in a row with 40px gaps', () => {
    const newItems = [
      { width: 200, height: 100 },
      { width: 200, height: 100 },
      { width: 200, height: 100 },
    ];
    const positions = findBatchPositions([], newItems);
    expect(positions).toEqual([
      { x: 100, y: 100 },
      { x: 340, y: 100 },
      { x: 580, y: 100 },
    ]);
  });

  it('wraps to next row when exceeding 1200px', () => {
    const newItems = [
      { width: 400, height: 200 },
      { width: 400, height: 150 },
      { width: 400, height: 180 },
    ];
    const positions = findBatchPositions([], newItems);
    // First: x=100, Second: x=540, Third would be 540+400+40=980+400=1380 > 1200 → wrap
    expect(positions).toEqual([
      { x: 100, y: 100 },
      { x: 540, y: 100 },
      { x: 100, y: 340 }, // y=100 + maxRowHeight(200) + 40
    ]);
  });

  it('starts below existing items', () => {
    const existing = [{ x: 100, y: 100, width: 300, height: 200 }];
    const newItems = [{ width: 200, height: 100 }];
    const positions = findBatchPositions(existing, newItems);
    expect(positions).toEqual([{ x: 100, y: 340 }]);
  });

  it('returns empty array for empty input', () => {
    expect(findBatchPositions([], [])).toEqual([]);
  });
});

describe('ITEM_DEFAULTS', () => {
  const expectedTypes = [
    'a4-page', 'secret-card', 'note', 'table-card', 'kpi-card', 'chart-card',
    'file-card', 'timer-card', 'invoice-card', 'budget-card', 'ledger-card',
    'receipt-card', 'subscription-card', 'account-card', 'pnl-card',
    'balance-sheet-card', 'cash-flow-card', 'tax-estimator-card',
    'loan-calculator-card', 'projection-card', 'breakeven-card',
    'depreciation-card', 'embed-card', 'networth-card', 'debt-planner-card',
    'rent-vs-buy-card', 'portfolio-card', 'header-card',
  ];

  it('has entries for all 28 item types', () => {
    expect(Object.keys(ITEM_DEFAULTS)).toHaveLength(28);
    for (const type of expectedTypes) {
      expect(ITEM_DEFAULTS[type]).toBeDefined();
    }
  });

  it('all entries have positive width and height', () => {
    for (const [type, dims] of Object.entries(ITEM_DEFAULTS)) {
      expect(dims.width, `${type} width`).toBeGreaterThan(0);
      expect(dims.height, `${type} height`).toBeGreaterThan(0);
    }
  });
});

describe('defaultNames', () => {
  it('has entries matching ITEM_DEFAULTS keys', () => {
    const defaultKeys = Object.keys(ITEM_DEFAULTS);
    const nameKeys = Object.keys(defaultNames);
    expect(nameKeys.sort()).toEqual(defaultKeys.sort());
  });
});

describe('createDefaultData', () => {
  it('returns data for budget-card with period and currency', () => {
    const data = createDefaultData('budget-card');
    expect(data).toBeDefined();
    expect(data).toHaveProperty('currency', 'USD');
    expect(data).toHaveProperty('period');
    const period = (data as Record<string, unknown>).period as Record<string, unknown>;
    expect(period.type).toBe('monthly');
    expect(period.month).toBeGreaterThanOrEqual(1);
    expect(period.year).toBeGreaterThanOrEqual(2020);
  });

  it('returns data for table-card with columns and rows', () => {
    const data = createDefaultData('table-card');
    expect(data).toBeDefined();
    const { columns, rows } = data as { columns: unknown[]; rows: unknown[] };
    expect(columns).toHaveLength(3);
    expect(rows).toHaveLength(3);
  });

  it('returns data for kpi-card', () => {
    const data = createDefaultData('kpi-card');
    expect(data).toEqual({ label: 'Metric', value: '0', format: 'number' });
  });

  it('returns undefined for header-card', () => {
    expect(createDefaultData('header-card')).toBeUndefined();
  });

  it('returns undefined for a4-page', () => {
    expect(createDefaultData('a4-page')).toBeUndefined();
  });

  it('returns undefined for unknown types', () => {
    expect(createDefaultData('nonexistent')).toBeUndefined();
  });

  it('returns data for pnl-card with sections', () => {
    const data = createDefaultData('pnl-card') as Record<string, unknown>;
    expect(data.currency).toBe('USD');
    const sections = data.sections as { id: string }[];
    expect(sections).toHaveLength(5);
    expect(sections.map((s) => s.id)).toEqual(['revenue', 'cogs', 'opex', 'other', 'tax']);
  });

  it('returns data for balance-sheet-card with sections', () => {
    const data = createDefaultData('balance-sheet-card') as Record<string, unknown>;
    expect(data.currency).toBe('USD');
    const sections = data.sections as { id: string }[];
    expect(sections).toHaveLength(5);
  });

  it('returns data for cash-flow-card with sections', () => {
    const data = createDefaultData('cash-flow-card') as Record<string, unknown>;
    expect(data.currency).toBe('USD');
    const sections = data.sections as { id: string }[];
    expect(sections).toHaveLength(3);
    expect(sections.map((s) => s.id)).toEqual(['operating', 'investing', 'financing']);
  });
});
