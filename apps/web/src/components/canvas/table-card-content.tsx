import { memo, useMemo } from 'react';
import { type TableCardData, formatCellValue } from '../../lib/table-utils';
import type { CanvasItem } from '../../stores/canvas-store';

interface TableCardContentProps {
  item: CanvasItem;
}

const ROW_HEIGHT = 22;
const HEADER_BAR = 32;
const TABLE_HEADER = 22;

export const TableCardContent = memo(function TableCardContent({ item }: TableCardContentProps) {
  const data = item.data as TableCardData | undefined;
  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];

  const visibleCount = useMemo(() => {
    const available = item.height - HEADER_BAR - TABLE_HEADER;
    return Math.max(0, Math.floor(available / ROW_HEIGHT));
  }, [item.height]);

  const visibleRows = rows.slice(0, visibleCount);
  const overflow = rows.length - visibleCount;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card overflow-hidden shadow-md">
      {/* Header bar */}
      <div className="flex items-center gap-1.5 border-b border-border/40 bg-muted/30 px-3 py-2 shrink-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5 text-blue-500 shrink-0"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
        <span className="text-[11px] font-medium text-foreground truncate">{item.name}</span>
      </div>

      {/* Table */}
      {columns.length > 0 && (
        <div className="flex-1 overflow-hidden">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-b border-border/40">
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className="px-2 py-1 text-left font-semibold text-muted-foreground truncate"
                  >
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} className="border-b border-border/20">
                  {columns.map((col) => (
                    <td key={col.id} className="px-2 py-1 text-foreground truncate max-w-[120px]">
                      {formatCellValue(row.cells[col.id] ?? '', col.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {overflow > 0 && (
            <div className="px-2 py-1 text-[10px] text-muted-foreground">
              + {overflow} more row{overflow > 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
