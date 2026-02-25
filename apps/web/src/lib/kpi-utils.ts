import type { CanvasItem } from '../stores/canvas-store';
import type { TableCardData } from './table-utils';

export type KpiFormat = 'currency' | 'number' | 'percentage' | 'text';
export type KpiColor = 'green' | 'red' | 'blue' | 'amber' | 'default';
export type KpiAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'latest';

export interface KpiTrend {
  value: string;
  period: string;
  direction: 'up' | 'down' | 'neutral';
}

export interface KpiSource {
  tableItemId: string;
  columnId: string;
  aggregation: KpiAggregation;
}

export interface KpiCardData {
  label: string;
  value: string;
  format: KpiFormat;
  trend?: KpiTrend;
  color?: KpiColor;
  source?: KpiSource;
}

export function createDefaultKpiData(): KpiCardData {
  return { label: 'Metric', value: '0', format: 'number' };
}

export function resolveKpiValue(data: KpiCardData, items: CanvasItem[]): string {
  if (!data.source) return data.value;

  const tableItem = items.find((i) => i.id === data.source?.tableItemId);
  if (!tableItem || tableItem.type !== 'table-card') return data.value;

  const tableData = tableItem.data as TableCardData | undefined;
  if (!tableData?.columns || !tableData.rows) return data.value;

  const column = tableData.columns.find((c) => c.id === data.source?.columnId);
  if (!column) return data.value;

  const values = tableData.rows
    .map((row) => Number(row.cells[column.id]))
    .filter((n) => !Number.isNaN(n));

  if (values.length === 0 && data.source.aggregation !== 'count') return data.value;

  switch (data.source.aggregation) {
    case 'sum':
      return String(values.reduce((a, b) => a + b, 0));
    case 'avg':
      return String(values.reduce((a, b) => a + b, 0) / values.length);
    case 'min':
      return String(Math.min(...values));
    case 'max':
      return String(Math.max(...values));
    case 'count':
      return String(tableData.rows.length);
    case 'latest': {
      const lastRow = tableData.rows[tableData.rows.length - 1];
      return lastRow?.cells[column.id] ?? data.value;
    }
    default:
      return data.value;
  }
}

export function formatKpiValue(value: string, format: KpiFormat): string {
  switch (format) {
    case 'currency': {
      const num = Number(value);
      if (Number.isNaN(num)) return value;
      return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }
    case 'number': {
      const num = Number(value);
      if (Number.isNaN(num)) return value;
      return num.toLocaleString();
    }
    case 'percentage': {
      const num = Number(value);
      if (Number.isNaN(num)) return value;
      return `${num.toFixed(2)}%`;
    }
    case 'text':
      return value;
    default:
      return value;
  }
}
