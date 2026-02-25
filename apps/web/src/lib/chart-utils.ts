import type { CanvasItem } from '../stores/canvas-store';
import type { TableCardData } from './table-utils';

export type ChartType = 'line' | 'bar' | 'area' | 'pie';

export interface ChartSource {
  tableItemId: string;
  xColumnId: string;
  yColumnIds: string[];
}

export interface ChartCardData {
  chartType: ChartType;
  title: string;
  source?: ChartSource;
  showLegend: boolean;
  showGrid: boolean;
}

export interface ChartDataPoint {
  label: string;
  [seriesName: string]: string | number;
}

export const CHART_COLORS = [
  'var(--color-primary)',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
];

export function createDefaultChartData(): ChartCardData {
  return {
    chartType: 'bar',
    title: '',
    showLegend: true,
    showGrid: true,
  };
}

export function resolveChartData(
  data: ChartCardData,
  items: CanvasItem[],
): { points: ChartDataPoint[]; seriesNames: string[] } {
  const empty = { points: [], seriesNames: [] };
  if (!data.source) return empty;

  const tableItem = items.find((i) => i.id === data.source?.tableItemId);
  if (!tableItem || tableItem.type !== 'table-card') return empty;

  const tableData = tableItem.data as TableCardData | undefined;
  if (!tableData?.columns || !tableData.rows) return empty;

  const xColumn = tableData.columns.find((c) => c.id === data.source?.xColumnId);
  if (!xColumn) return empty;

  const yColumns = data.source.yColumnIds
    .map((id) => tableData.columns.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c != null);

  if (yColumns.length === 0) return empty;

  const seriesNames = yColumns.map((c) => c.name);

  const points: ChartDataPoint[] = tableData.rows.map((row) => {
    const point: ChartDataPoint = {
      label: row.cells[xColumn.id] ?? '',
    };
    for (const col of yColumns) {
      const raw = row.cells[col.id] ?? '';
      const num = Number(raw);
      point[col.name] = Number.isNaN(num) ? 0 : num;
    }
    return point;
  });

  return { points, seriesNames };
}
