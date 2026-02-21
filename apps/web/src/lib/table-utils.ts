export type TableColumnType = 'text' | 'number' | 'currency' | 'date';

export interface TableColumn {
  id: string;
  name: string;
  type: TableColumnType;
}

export interface TableRow {
  id: string;
  cells: Record<string, string>; // columnId → value (always string)
}

export interface TableCardData {
  columns: TableColumn[];
  rows: TableRow[];
}

export function createDefaultTableData(): TableCardData {
  const colA: TableColumn = { id: crypto.randomUUID(), name: 'Column A', type: 'text' };
  const colB: TableColumn = { id: crypto.randomUUID(), name: 'Column B', type: 'text' };
  const colC: TableColumn = { id: crypto.randomUUID(), name: 'Column C', type: 'text' };

  const columns = [colA, colB, colC];
  const rows: TableRow[] = Array.from({ length: 3 }, () => ({
    id: crypto.randomUUID(),
    cells: { [colA.id]: '', [colB.id]: '', [colC.id]: '' },
  }));

  return { columns, rows };
}

export function formatCellValue(value: string, type: TableColumnType): string {
  if (!value) return '';

  switch (type) {
    case 'number': {
      const n = Number(value);
      if (Number.isNaN(n)) return value;
      return n.toLocaleString();
    }
    case 'currency': {
      const n = Number(value);
      if (Number.isNaN(n)) return value;
      return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }
    case 'date': {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      return d.toLocaleDateString();
    }
    default:
      return value;
  }
}
