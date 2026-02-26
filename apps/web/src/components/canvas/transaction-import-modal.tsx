import { Dialog, DialogContent, DialogDescription, DialogTitle, cn } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  type CategorizationRule,
  type ColumnMapping,
  type ParsedTransaction,
  detectColumnMapping,
  mapRowToTransaction,
  suggestCategoriesForBatch,
} from '../../lib/categorization-utils';
import { parseFullCsv, parseFullExcel } from '../../lib/file-utils';
import { useTRPC } from '../../lib/trpc';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

interface ImportRow {
  parsed: ParsedTransaction | null;
  error: string | null;
  skip: boolean;
}

export const TransactionImportModal = memo(function TransactionImportModal({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    date: null,
    description: null,
    amount: null,
    debit: null,
    credit: null,
    category: null,
    type: null,
  });
  const [useDebitCredit, setUseDebitCredit] = useState(false);
  const [defaultType, setDefaultType] = useState<'income' | 'expense'>('expense');
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importResult, setImportResult] = useState<{
    count: number;
    income: number;
    expense: number;
    totalAmount: number;
  } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Queries
  const { data: categories = [] } = useQuery(
    trpc.category.list.queryOptions({ workspaceId, context: 'ledger' }),
  );
  const { data: rules = [] } = useQuery(trpc.categorizationRule.list.queryOptions({ workspaceId }));
  const { data: transactions = [] } = useQuery(
    trpc.financial.listTransactions.queryOptions({ workspaceId }),
  );

  const bulkCreate = useMutation(
    trpc.financial.bulkCreateTransactions.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.financial.listTransactions.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.financial.getSummary.queryKey() });
      },
    }),
  );

  // Reset when modal closes
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setStep(1);
        setFile(null);
        setHeaders([]);
        setRawRows([]);
        setMapping({
          date: null,
          description: null,
          amount: null,
          debit: null,
          credit: null,
          category: null,
          type: null,
        });
        setUseDebitCredit(false);
        setDefaultType('expense');
        setImportRows([]);
        setImportResult(null);
        setParseError(null);
      }
      onOpenChange(open);
    },
    [onOpenChange],
  );

  // ── Step 1: File selection ──
  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);
    try {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      let result: { headers: string[]; rows: string[][] };
      if (ext === 'csv' || selectedFile.type === 'text/csv') {
        result = await parseFullCsv(selectedFile);
      } else {
        result = await parseFullExcel(selectedFile);
      }
      if (result.headers.length === 0) {
        setParseError('No columns found in file');
        return;
      }
      setHeaders(result.headers);
      setRawRows(result.rows);
      const detected = detectColumnMapping(result.headers);
      setMapping(detected);
      setUseDebitCredit(detected.debit !== null || detected.credit !== null);
    } catch {
      setParseError('Failed to parse file');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelect(f);
    },
    [handleFileSelect],
  );

  // ── Step 2 → Step 3 transition: map all rows ──
  const buildImportRows = useCallback(() => {
    const rulesList: CategorizationRule[] = rules.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      categoryId: r.categoryId,
    }));
    const history = transactions.map((t) => ({
      description: t.description,
      categoryId: t.categoryId ?? null,
    }));

    const mapped = rawRows.map((row): ImportRow => {
      const result = mapRowToTransaction(row, mapping, defaultType);
      if ('error' in result) {
        return { parsed: null, error: result.error, skip: true };
      }
      return { parsed: result, error: null, skip: false };
    });

    // Auto-categorize valid rows
    const validDescriptions = mapped.map((r) => r.parsed?.description ?? '');
    const suggestions = suggestCategoriesForBatch(validDescriptions, rulesList, history);
    for (let i = 0; i < mapped.length; i++) {
      const suggestion = suggestions[i];
      const entry = mapped[i];
      if (entry?.parsed && suggestion) {
        entry.parsed.categoryId = suggestion;
      }
    }

    setImportRows(mapped);
  }, [rawRows, mapping, defaultType, rules, transactions]);

  // ── Step 3: Import ──
  const validRows = useMemo(() => importRows.filter((r) => r.parsed && !r.skip), [importRows]);
  const errorCount = useMemo(() => importRows.filter((r) => r.error).length, [importRows]);
  const categorizedCount = useMemo(
    () => validRows.filter((r) => r.parsed?.categoryId).length,
    [validRows],
  );

  const handleImport = useCallback(async () => {
    const txns = validRows
      .filter((r): r is ImportRow & { parsed: ParsedTransaction } => r.parsed !== null)
      .map((r) => ({
        date: r.parsed.date,
        description: r.parsed.description,
        amount: r.parsed.amount,
        type: r.parsed.type,
        categoryId: r.parsed.categoryId,
      }));

    const result = await bulkCreate.mutateAsync({
      workspaceId,
      transactions: txns,
    });

    const income = txns.filter((t) => t.type === 'income');
    const expense = txns.filter((t) => t.type === 'expense');

    setImportResult({
      count: result.count,
      income: income.length,
      expense: expense.length,
      totalAmount: txns.reduce((s, t) => s + t.amount, 0),
    });
    setStep(4);
  }, [validRows, workspaceId, bulkCreate]);

  // ── Mapping validity check ──
  const mappingValid =
    mapping.date !== null &&
    mapping.description !== null &&
    (mapping.amount !== null || mapping.debit !== null || mapping.credit !== null);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogTitle className="text-[15px] font-semibold">Import Transactions</DialogTitle>
        <DialogDescription className="text-[12px] text-muted-foreground">
          {step === 1 && 'Select a CSV or Excel file to import'}
          {step === 2 && 'Map columns from your file to transaction fields'}
          {step === 3 && 'Review and import transactions'}
          {step === 4 && 'Import complete'}
        </DialogDescription>

        {/* Step indicators */}
        <div className="flex items-center gap-2 py-2">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  'size-6 rounded-full flex items-center justify-center text-[11px] font-medium',
                  step >= s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {s}
              </div>
              {s < 4 && <div className={cn('w-8 h-px', step > s ? 'bg-primary' : 'bg-border')} />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-auto min-h-0">
          {step === 1 && (
            <div className="space-y-4 py-2">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.csv,.xlsx,.xls';
                  input.onchange = () => {
                    if (input.files?.[0]) handleFileSelect(input.files[0]);
                  };
                  input.click();
                }}
                onKeyDown={() => {}}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-8 mx-auto mb-3 text-muted-foreground"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className="text-[13px] text-muted-foreground">
                  Drop CSV or Excel file here, or click to browse
                </p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">.csv, .xlsx, .xls</p>
              </div>

              {parseError && <p className="text-[12px] text-red-500">{parseError}</p>}

              {file && !parseError && (
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-[13px] font-medium text-foreground">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {rawRows.length} rows, {headers.length} columns
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!file || !!parseError || headers.length === 0}
                  onClick={() => setStep(2)}
                  className="rounded-lg bg-primary px-4 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 py-2">
              {/* Column mapping dropdowns */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-[12px] font-medium text-foreground w-24">Date *</label>
                  <select
                    value={mapping.date ?? ''}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        date: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className={cn(inputClass, 'flex-1')}
                  >
                    <option value="">Select column...</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-[12px] font-medium text-foreground w-24">
                    Description *
                  </label>
                  <select
                    value={mapping.description ?? ''}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        description: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className={cn(inputClass, 'flex-1')}
                  >
                    <option value="">Select column...</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Toggle: single amount vs debit/credit */}
                <div className="flex items-center gap-3">
                  <label className="text-[12px] font-medium text-foreground w-24">
                    Amount mode
                  </label>
                  <div className="flex rounded-md border border-border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setUseDebitCredit(false);
                        setMapping((m) => ({ ...m, debit: null, credit: null }));
                      }}
                      className={cn(
                        'px-3 py-1.5 text-[12px] font-medium transition-colors',
                        !useDebitCredit
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                      )}
                    >
                      Single column
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUseDebitCredit(true);
                        setMapping((m) => ({ ...m, amount: null }));
                      }}
                      className={cn(
                        'px-3 py-1.5 text-[12px] font-medium transition-colors',
                        useDebitCredit
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                      )}
                    >
                      Debit / Credit
                    </button>
                  </div>
                </div>

                {!useDebitCredit ? (
                  <div className="flex items-center gap-3">
                    <label className="text-[12px] font-medium text-foreground w-24">Amount *</label>
                    <select
                      value={mapping.amount ?? ''}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          amount: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                      className={cn(inputClass, 'flex-1')}
                    >
                      <option value="">Select column...</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <label className="text-[12px] font-medium text-foreground w-24">Debit</label>
                      <select
                        value={mapping.debit ?? ''}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            debit: e.target.value ? Number(e.target.value) : null,
                          }))
                        }
                        className={cn(inputClass, 'flex-1')}
                      >
                        <option value="">Select column...</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-[12px] font-medium text-foreground w-24">Credit</label>
                      <select
                        value={mapping.credit ?? ''}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            credit: e.target.value ? Number(e.target.value) : null,
                          }))
                        }
                        className={cn(inputClass, 'flex-1')}
                      >
                        <option value="">Select column...</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* Default type for ambiguous amounts */}
                {!useDebitCredit && (
                  <div className="flex items-center gap-3">
                    <label className="text-[12px] font-medium text-foreground w-24">
                      Default type
                    </label>
                    <div className="flex rounded-md border border-border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setDefaultType('expense')}
                        className={cn(
                          'px-3 py-1.5 text-[12px] font-medium transition-colors',
                          defaultType === 'expense'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                            : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                        )}
                      >
                        Expense
                      </button>
                      <button
                        type="button"
                        onClick={() => setDefaultType('income')}
                        className={cn(
                          'px-3 py-1.5 text-[12px] font-medium transition-colors',
                          defaultType === 'income'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                        )}
                      >
                        Income
                      </button>
                    </div>
                  </div>
                )}

                {/* Category column (optional) */}
                <div className="flex items-center gap-3">
                  <label className="text-[12px] font-medium text-foreground w-24">Category</label>
                  <select
                    value={mapping.category ?? ''}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        category: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className={cn(inputClass, 'flex-1')}
                  >
                    <option value="">None (auto-detect)</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Preview first 3 rows */}
              {mappingValid && rawRows.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Preview
                  </p>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="grid grid-cols-[90px_1fr_80px_70px] gap-2 px-3 py-1.5 bg-muted/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <span>Date</span>
                      <span>Description</span>
                      <span className="text-right">Amount</span>
                      <span>Type</span>
                    </div>
                    {rawRows.slice(0, 3).map((row, i) => {
                      const result = mapRowToTransaction(row, mapping, defaultType);
                      const isError = 'error' in result;
                      return (
                        <div
                          key={i}
                          className={cn(
                            'grid grid-cols-[90px_1fr_80px_70px] gap-2 px-3 py-1.5 border-t border-border/40 text-[12px]',
                            isError && 'bg-red-50 dark:bg-red-950/20',
                          )}
                        >
                          {isError ? (
                            <span className="col-span-4 text-red-500 text-[11px]">
                              {result.error}
                            </span>
                          ) : (
                            <>
                              <span className="text-muted-foreground">{result.date}</span>
                              <span className="truncate">{result.description}</span>
                              <span className="text-right tabular-nums">
                                {result.amount.toFixed(2)}
                              </span>
                              <span
                                className={cn(
                                  'text-[11px] font-medium',
                                  result.type === 'income'
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-red-600 dark:text-red-400',
                                )}
                              >
                                {result.type}
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-lg border border-border px-4 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!mappingValid}
                  onClick={() => {
                    buildImportRows();
                    setStep(3);
                  }}
                  className="rounded-lg bg-primary px-4 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 py-2">
              {/* Summary bar */}
              <div className="flex items-center gap-4 text-[12px]">
                <span className="text-green-600 dark:text-green-400 font-medium">
                  {validRows.length} valid
                </span>
                {errorCount > 0 && (
                  <span className="text-red-500 font-medium">{errorCount} errors</span>
                )}
                {categorizedCount > 0 && (
                  <span className="text-primary font-medium">
                    {categorizedCount} auto-categorized
                  </span>
                )}
              </div>

              {/* Scrollable table */}
              <div className="rounded-lg border border-border overflow-hidden max-h-[40vh] overflow-auto">
                <div className="grid grid-cols-[32px_80px_1fr_80px_70px_120px] gap-2 px-3 py-1.5 bg-muted/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 z-10">
                  <span />
                  <span>Date</span>
                  <span>Description</span>
                  <span className="text-right">Amount</span>
                  <span>Type</span>
                  <span>Category</span>
                </div>
                {importRows.map((row, i) => (
                  <div
                    key={i}
                    className={cn(
                      'grid grid-cols-[32px_80px_1fr_80px_70px_120px] gap-2 px-3 py-1 border-t border-border/40 items-center text-[12px]',
                      row.error && 'bg-red-50 dark:bg-red-950/20',
                      row.skip && !row.error && 'opacity-40',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={!row.skip}
                      disabled={!!row.error}
                      onChange={() => {
                        setImportRows((prev) =>
                          prev.map((r, idx) => (idx === i ? { ...r, skip: !r.skip } : r)),
                        );
                      }}
                      className="size-3.5"
                    />
                    {row.error ? (
                      <span className="col-span-5 text-red-500 text-[11px]">{row.error}</span>
                    ) : row.parsed ? (
                      <>
                        <span className="text-muted-foreground">{row.parsed.date}</span>
                        <span className="truncate">{row.parsed.description}</span>
                        <span className="text-right tabular-nums">
                          {row.parsed.amount.toFixed(2)}
                        </span>
                        <span
                          className={cn(
                            'text-[11px] font-medium',
                            row.parsed.type === 'income'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400',
                          )}
                        >
                          {row.parsed.type}
                        </span>
                        <select
                          value={row.parsed.categoryId ?? ''}
                          onChange={(e) => {
                            const catId = e.target.value || null;
                            setImportRows((prev) =>
                              prev.map((r, idx) =>
                                idx === i && r.parsed
                                  ? { ...r, parsed: { ...r.parsed, categoryId: catId } }
                                  : r,
                              ),
                            );
                          }}
                          className="rounded border border-border bg-transparent px-1.5 py-0.5 text-[11px] focus:outline-none"
                        >
                          <option value="">None</option>
                          {categories.map((c: { id: string; name: string }) => (
                            <option key={c.id} value={c.id}>
                              {c.name || 'Unnamed'}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-lg border border-border px-4 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={validRows.length === 0 || bulkCreate.isPending}
                  onClick={handleImport}
                  className="rounded-lg bg-primary px-4 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {bulkCreate.isPending
                    ? 'Importing...'
                    : `Import ${validRows.length} transactions`}
                </button>
              </div>
            </div>
          )}

          {step === 4 && importResult && (
            <div className="space-y-4 py-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mx-auto">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-6 text-green-600 dark:text-green-400"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-foreground">
                  Successfully imported {importResult.count} transactions
                </p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  {importResult.income} income, {importResult.expense} expense
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="rounded-lg bg-primary px-6 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});
