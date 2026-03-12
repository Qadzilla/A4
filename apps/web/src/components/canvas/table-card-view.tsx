import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from '@a4/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  type TableCardData,
  type TableColumn,
  type TableColumnType,
  type TableRow,
  formatCellValue,
} from '../../lib/table-utils';
import { type CanvasItem, useCanvasStore } from '../../stores/canvas-store';

interface TableCardViewProps {
  item: CanvasItem;
}

const columnTypes: { value: TableColumnType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
];

export const TableCardView = memo(
  function TableCardView({ item }: TableCardViewProps) {
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    const [columns, setColumns] = useState<TableColumn[]>([]);
    const [rows, setRows] = useState<TableRow[]>([]);
    const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
    const [editValue, setEditValue] = useState('');
    const [editingHeader, setEditingHeader] = useState<string | null>(null);
    const [headerValue, setHeaderValue] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    const dirtyRef = useRef(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const editInputRef = useRef<HTMLInputElement>(null);
    const headerInputRef = useRef<HTMLInputElement>(null);

    // Load from item.data keyed on item.id
    // biome-ignore lint/correctness/useExhaustiveDependencies: load once per item
    useEffect(() => {
      dirtyRef.current = false;
      const data = item.data as TableCardData | undefined;
      setColumns(data?.columns ?? []);
      setRows(data?.rows ?? []);
      setEditingCell(null);
      setEditingHeader(null);
    }, [item.id]);

    // Debounced auto-save (800ms)
    useEffect(() => {
      if (!dirtyRef.current) return;

      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus('saving');
        updateItemData(item.id, { columns, rows });
        setSaveStatus('saved');
        clearTimeout(savedIndicatorRef.current);
        savedIndicatorRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }, 800);

      return () => clearTimeout(saveTimerRef.current);
    }, [columns, rows, item.id, updateItemData]);

    // Cleanup timers
    useEffect(() => {
      return () => {
        clearTimeout(saveTimerRef.current);
        clearTimeout(savedIndicatorRef.current);
      };
    }, []);

    // Focus edit input when cell editing starts
    useEffect(() => {
      if (editingCell && editInputRef.current) {
        editInputRef.current.focus();
      }
    }, [editingCell]);

    // Focus header input when header editing starts
    useEffect(() => {
      if (editingHeader && headerInputRef.current) {
        headerInputRef.current.focus();
        headerInputRef.current.select();
      }
    }, [editingHeader]);

    const addColumn = useCallback(() => {
      dirtyRef.current = true;
      const id = crypto.randomUUID();
      const name = `Column ${String.fromCharCode(65 + columns.length)}`;
      setColumns((prev) => [...prev, { id, name, type: 'text' }]);
      setRows((prev) => prev.map((r) => ({ ...r, cells: { ...r.cells, [id]: '' } })));
    }, [columns.length]);

    const removeColumn = useCallback((colId: string) => {
      dirtyRef.current = true;
      setColumns((prev) => prev.filter((c) => c.id !== colId));
      setRows((prev) =>
        prev.map((r) => {
          const cells = { ...r.cells };
          delete cells[colId];
          return { ...r, cells };
        }),
      );
    }, []);

    const changeColumnType = useCallback((colId: string, type: TableColumnType) => {
      dirtyRef.current = true;
      setColumns((prev) => prev.map((c) => (c.id === colId ? { ...c, type } : c)));
    }, []);

    const commitHeaderRename = useCallback(() => {
      if (!editingHeader) return;
      const trimmed = headerValue.trim();
      if (trimmed) {
        dirtyRef.current = true;
        setColumns((prev) =>
          prev.map((c) => (c.id === editingHeader ? { ...c, name: trimmed } : c)),
        );
      }
      setEditingHeader(null);
    }, [editingHeader, headerValue]);

    const addRow = useCallback(() => {
      dirtyRef.current = true;
      const cells: Record<string, string> = {};
      for (const col of columns) {
        cells[col.id] = '';
      }
      setRows((prev) => [...prev, { id: crypto.randomUUID(), cells }]);
    }, [columns]);

    const removeRow = useCallback((rowId: string) => {
      dirtyRef.current = true;
      setRows((prev) => prev.filter((r) => r.id !== rowId));
    }, []);

    const startEdit = useCallback((rowId: string, colId: string, currentValue: string) => {
      setEditingCell({ rowId, colId });
      setEditValue(currentValue);
    }, []);

    const commitEdit = useCallback(() => {
      if (!editingCell) return;
      dirtyRef.current = true;
      const { rowId, colId } = editingCell;
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: editValue } } : r)),
      );
      setEditingCell(null);
    }, [editingCell, editValue]);

    const cancelEdit = useCallback(() => {
      setEditingCell(null);
    }, []);

    const navigateCell = useCallback(
      (direction: 'right' | 'left' | 'down') => {
        if (!editingCell) return;
        commitEdit();

        const colIdx = columns.findIndex((c) => c.id === editingCell.colId);
        const rowIdx = rows.findIndex((r) => r.id === editingCell.rowId);
        if (colIdx === -1 || rowIdx === -1) return;

        let nextCol = colIdx;
        let nextRow = rowIdx;

        if (direction === 'right') {
          nextCol++;
          if (nextCol >= columns.length) {
            nextCol = 0;
            nextRow++;
          }
        } else if (direction === 'left') {
          nextCol--;
          if (nextCol < 0) {
            nextCol = columns.length - 1;
            nextRow--;
          }
        } else if (direction === 'down') {
          nextRow++;
        }

        if (nextRow >= 0 && nextRow < rows.length && nextCol >= 0 && nextCol < columns.length) {
          const r = rows[nextRow]!;
          const c = columns[nextCol]!;
          // Use setTimeout so state settles after commitEdit
          setTimeout(() => startEdit(r.id, c.id, r.cells[c.id] ?? ''), 0);
        }
      },
      [editingCell, columns, rows, commitEdit, startEdit],
    );

    const handleCellKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          navigateCell(e.shiftKey ? 'left' : 'right');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          navigateCell('down');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit();
        }
      },
      [navigateCell, cancelEdit],
    );

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-muted/30">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2 bg-card shrink-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 text-blue-500 shrink-0"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <span className="text-[13px] font-semibold text-foreground truncate">
              {item.name}
            </span>
          </div>

          <button
            type="button"
            onClick={addColumn}
            className="flex items-center gap-1 text-[12px] text-primary hover:underline shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Column
          </button>

          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 text-[12px] text-primary hover:underline shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Row
          </button>

          <span
            className={cn(
              'text-[11px] text-muted-foreground shrink-0 transition-opacity duration-300',
              saveStatus === 'idle' ? 'opacity-0' : 'opacity-100',
            )}
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {columns.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-[13px] text-muted-foreground">
                No columns. Add a column to start.
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/40 border-b border-border/60">
                  {columns.map((col) => (
                    <th
                      key={col.id}
                      className="relative px-3 py-2 text-left font-medium text-foreground border-r border-border/30 min-w-[120px]"
                    >
                      <div className="flex items-center gap-1.5">
                        {editingHeader === col.id ? (
                          <input
                            ref={headerInputRef}
                            type="text"
                            value={headerValue}
                            onChange={(e) => setHeaderValue(e.target.value)}
                            onBlur={commitHeaderRename}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitHeaderRename();
                              if (e.key === 'Escape') setEditingHeader(null);
                            }}
                            className="w-full bg-transparent text-[13px] font-medium outline-none border-b border-primary"
                          />
                        ) : (
                          <span
                            className="truncate cursor-default"
                            onDoubleClick={() => {
                              setEditingHeader(col.id);
                              setHeaderValue(col.name);
                            }}
                          >
                            {col.name}
                          </span>
                        )}

                        {/* Column type picker */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="ml-auto p-0.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="size-3"
                              >
                                <path d="M12 16l-6-6h12z" />
                              </svg>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-32">
                            {columnTypes.map((ct) => (
                              <DropdownMenuItem
                                key={ct.value}
                                className={cn(
                                  'text-[12px]',
                                  col.type === ct.value && 'font-semibold',
                                )}
                                onSelect={() => changeColumnType(col.id, ct.value)}
                              >
                                {ct.label}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuItem
                              className="text-[12px] text-destructive focus:text-destructive"
                              onSelect={() => removeColumn(col.id)}
                            >
                              Remove column
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </th>
                  ))}
                  {/* Action column header */}
                  <th className="w-8 bg-muted/40 border-b border-border/60" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    {columns.map((col) => {
                      const isEditing =
                        editingCell?.rowId === row.id && editingCell?.colId === col.id;
                      const raw = row.cells[col.id] ?? '';

                      return (
                        <td
                          key={col.id}
                          className="px-0 py-0 border-r border-border/30"
                          onClick={() => {
                            if (!isEditing) startEdit(row.id, col.id, raw);
                          }}
                        >
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={handleCellKeyDown}
                              className="w-full h-full px-3 py-2 text-[13px] text-foreground bg-primary/5 outline-none ring-2 ring-inset ring-primary/40"
                            />
                          ) : (
                            <div className="px-3 py-2 text-[13px] text-foreground truncate min-h-[36px] cursor-text">
                              {formatCellValue(raw, col.type) || '\u00A0'}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    {/* Remove row */}
                    <td className="w-8 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Remove row"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-3"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  },
  (prev, next) => prev.item.id === next.item.id,
);
