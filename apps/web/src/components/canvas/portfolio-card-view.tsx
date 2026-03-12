import { cn } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import {
  computePortfolio,
  createDefaultPortfolioData,
  getDriftColor,
} from '../../lib/portfolio-utils';
import type { PortfolioCardData, PortfolioHolding } from '../../lib/portfolio-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground transition-all font-sans focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

const selectClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:16px_16px] bg-[position:right_8px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] pr-8';

const numberInputSpinner =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function MetricBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      {children}
    </div>
  );
}

export const PortfolioCardView = memo(
  function PortfolioCardView({ item, workspaceId }: { item: CanvasItem; workspaceId: string }) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    // ── View config (persisted in item.data) ──
    const [viewConfig, setViewConfig] = useState<PortfolioCardData>(() => {
      const d = item.data as PortfolioCardData | undefined;
      return d?.currency ? { ...createDefaultPortfolioData(), ...d } : createDefaultPortfolioData();
    });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    const [rebalanceOpen, setRebalanceOpen] = useState(false);

    // New holding form
    const [newHolding, setNewHolding] = useState({
      symbol: '',
      name: '',
      value: '',
      targetPct: '',
    });

    // Re-load when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as PortfolioCardData | undefined;
      setViewConfig(
        d?.currency ? { ...createDefaultPortfolioData(), ...d } : createDefaultPortfolioData(),
      );
      dirtyRef.current = false;
    }, [item.id]);

    // Auto-save view config (debounced 800ms)
    useEffect(() => {
      if (!dirtyRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus('saving');
        updateItemData(item.id, viewConfig as unknown as Record<string, unknown>);
        setSaveStatus('saved');
        clearTimeout(savedIndicatorRef.current);
        savedIndicatorRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }, 800);
      return () => clearTimeout(saveTimerRef.current);
    }, [viewConfig, item.id, updateItemData]);

    useEffect(() => {
      return () => {
        clearTimeout(saveTimerRef.current);
        clearTimeout(savedIndicatorRef.current);
      };
    }, []);

    const updateConfig = (patch: Partial<PortfolioCardData>) => {
      dirtyRef.current = true;
      setViewConfig((prev) => ({ ...prev, ...patch }));
    };

    // ── tRPC queries ──
    const { data: dbHoldings = [], isLoading } = useQuery(
      trpc.holding.list.queryOptions({ workspaceId }),
    );

    // ── tRPC mutations ──
    const holdingQueryKey = trpc.holding.list.queryKey();
    const summaryQueryKey = trpc.holding.getSummary.queryKey();

    const invalidateHoldings = () => {
      queryClient.invalidateQueries({ queryKey: holdingQueryKey });
      queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    };

    const createHolding = useMutation(
      trpc.holding.create.mutationOptions({ onSuccess: invalidateHoldings }),
    );
    const updateHolding = useMutation(
      trpc.holding.update.mutationOptions({ onSuccess: invalidateHoldings }),
    );
    const deleteHolding = useMutation(
      trpc.holding.delete.mutationOptions({ onSuccess: invalidateHoldings }),
    );

    // ── Holding mutations ──
    const addHolding = () => {
      const value = Number(newHolding.value);
      const targetPct = Number(newHolding.targetPct);
      if (!newHolding.symbol.trim() || Number.isNaN(value) || value < 0) return;
      if (Number.isNaN(targetPct) || targetPct < 0 || targetPct > 100) return;

      createHolding.mutate({
        workspaceId,
        symbol: newHolding.symbol.trim().toUpperCase(),
        name: newHolding.name.trim(),
        value,
        targetPct,
      });
      setNewHolding({ symbol: '', name: '', value: '', targetPct: '' });
    };

    const removeHolding = (id: string) => {
      deleteHolding.mutate({ id });
    };

    const handleHoldingBlur = (id: string, field: string, value: string | number) => {
      const existing = dbHoldings.find((h) => h.id === id);
      if (!existing) return;
      const current = existing[field as keyof typeof existing];
      if (current === value) return;
      updateHolding.mutate({ id, data: { [field]: value } });
    };

    // ── Computed ──
    const holdings: PortfolioHolding[] = useMemo(
      () =>
        dbHoldings.map((h) => ({
          id: h.id,
          symbol: h.symbol,
          name: h.name,
          value: h.value,
          targetPct: h.targetPct,
        })),
      [dbHoldings],
    );

    const result = useMemo(() => computePortfolio(holdings), [holdings]);

    const driftColorClass = (color: 'green' | 'yellow' | 'red') => {
      if (color === 'green') return 'text-green-600 dark:text-green-400';
      if (color === 'yellow') return 'text-amber-600 dark:text-amber-400';
      return 'text-red-600 dark:text-red-400';
    };

    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2 text-center">
            <div className="h-6 w-32 rounded bg-muted/40 animate-pulse mx-auto" />
            <p className="text-[12px] text-muted-foreground">Loading portfolio...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-4 sm:px-8">
        <div className="w-full max-w-4xl space-y-8 bg-card border border-border/60 shadow-sm rounded-xl p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/5 border border-primary/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5 text-primary"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a10 10 0 0 1 0 20" />
                <path d="M12 2v20" />
                <path d="M2 12h10" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground tracking-tight">{item.name}</h2>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Portfolio Allocation</p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-muted-foreground">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Currency
            </label>
            <select
              value={viewConfig.currency}
              onChange={(e) => updateConfig({ currency: e.target.value as SupportedCurrency })}
              className={cn(selectClass, 'w-full sm:w-[200px]')}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.symbol} {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Summary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg border border-border/60 bg-muted/20 p-4">
            <MetricBox label="Total Value">
              <p className="text-[16px] font-semibold text-foreground font-mono tabular-nums mt-1">
                {formatCurrency(result.totalValue, viewConfig.currency)}
              </p>
            </MetricBox>
            <MetricBox label="Target Total">
              <p
                className={cn(
                  'text-[16px] font-semibold font-mono tabular-nums mt-1',
                  Math.abs(result.targetTotal - 100) > 0.01
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-foreground',
                )}
              >
                {result.targetTotal.toFixed(1)}%
              </p>
            </MetricBox>
            <MetricBox label="Holdings">
              <p className="text-[16px] font-semibold text-foreground font-mono tabular-nums mt-1">
                {holdings.length}
              </p>
            </MetricBox>
            <MetricBox label="Status">
              <p
                className={cn(
                  'text-[16px] font-semibold mt-1',
                  result.isBalanced
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-amber-600 dark:text-amber-400',
                )}
              >
                {result.isBalanced
                  ? 'Balanced'
                  : `${result.rebalanceTrades.length} trade${result.rebalanceTrades.length === 1 ? '' : 's'}`}
              </p>
            </MetricBox>
          </div>

          {/* Target total warning */}
          {holdings.length > 0 && Math.abs(result.targetTotal - 100) > 0.01 && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5">
              <p className="text-[12px] text-amber-700 dark:text-amber-300">
                Target allocations sum to {result.targetTotal.toFixed(1)}% instead of 100%. Adjust
                your targets to ensure they total 100%.
              </p>
            </div>
          )}

          {/* Add Holding form */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Add Holding
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Symbol</label>
                <input
                  type="text"
                  value={newHolding.symbol}
                  onChange={(e) =>
                    setNewHolding((p) => ({ ...p, symbol: e.target.value.toUpperCase() }))
                  }
                  placeholder="AAPL"
                  className={cn(inputClass, 'sm:w-[90px] uppercase font-mono')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addHolding();
                  }}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  value={newHolding.name}
                  onChange={(e) => setNewHolding((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Apple Inc."
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addHolding();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Value</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={newHolding.value}
                  onChange={(e) => setNewHolding((p) => ({ ...p, value: e.target.value }))}
                  placeholder="0.00"
                  className={cn(inputClass, 'sm:w-[120px] font-mono tabular-nums', numberInputSpinner)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addHolding();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Target %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={newHolding.targetPct}
                  onChange={(e) => setNewHolding((p) => ({ ...p, targetPct: e.target.value }))}
                  placeholder="25"
                  className={cn(inputClass, 'sm:w-[90px] font-mono tabular-nums', numberInputSpinner)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addHolding();
                  }}
                />
              </div>
              <button
                type="button"
                onClick={addHolding}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Holdings Table */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Holdings ({holdings.length})
            </p>
            <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
              {/* Header row */}
              <div className="hidden sm:grid grid-cols-[70px_1fr_100px_70px_70px_70px_90px_80px_32px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Symbol</span>
                <span>Name</span>
                <span className="text-right">Value</span>
                <span className="text-right">Target %</span>
                <span className="text-right">Actual %</span>
                <span className="text-right">Drift</span>
                <span className="text-right">$ Drift</span>
                <span className="text-center">Rebalance</span>
                <span />
              </div>

              {holdings.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No holdings yet
                </div>
              ) : (
                result.holdings.map((h) => {
                  const color = getDriftColor(h.driftPct);
                  const trade = result.rebalanceTrades.find((t) => t.symbol === h.symbol);
                  return (
                    <div
                      key={h.id}
                      className="group grid grid-cols-1 sm:grid-cols-[70px_1fr_100px_70px_70px_70px_90px_80px_32px] gap-2 px-3 py-2 border-t border-border/40 items-center transition-colors hover:bg-muted/20"
                    >
                      <input
                        type="text"
                        defaultValue={h.symbol}
                        onBlur={(e) =>
                          handleHoldingBlur(h.id, 'symbol', e.target.value.toUpperCase())
                        }
                        className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] font-medium text-foreground uppercase font-mono transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <input
                        type="text"
                        defaultValue={h.name}
                        onBlur={(e) => handleHoldingBlur(h.id, 'name', e.target.value)}
                        placeholder="Name"
                        className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-foreground placeholder:text-muted-foreground transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        defaultValue={h.value}
                        onBlur={(e) =>
                          handleHoldingBlur(h.id, 'value', Number(e.target.value) || 0)
                        }
                        className={cn(
                          'rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-left sm:text-right text-foreground font-mono tabular-nums transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50',
                          numberInputSpinner,
                        )}
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        defaultValue={h.targetPct}
                        onBlur={(e) =>
                          handleHoldingBlur(h.id, 'targetPct', Number(e.target.value) || 0)
                        }
                        className={cn(
                          'rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-left sm:text-right text-foreground font-mono tabular-nums transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50',
                          numberInputSpinner,
                        )}
                      />
                      <span className="text-[13px] text-left sm:text-right text-muted-foreground font-mono tabular-nums py-1 pr-1">
                        {h.actualPct.toFixed(1)}%
                      </span>
                      <span
                        className={cn(
                          'text-[13px] text-left sm:text-right font-mono tabular-nums py-1 pr-1',
                          driftColorClass(color),
                        )}
                      >
                        {h.driftPct > 0 ? '+' : ''}
                        {h.driftPct.toFixed(1)}%
                      </span>
                      <span
                        className={cn(
                          'text-[13px] text-left sm:text-right font-mono tabular-nums py-1 pr-1',
                          driftColorClass(color),
                        )}
                      >
                        {h.driftValue >= 0 ? '+' : ''}
                        {formatCurrency(h.driftValue, viewConfig.currency)}
                      </span>
                      <span className="text-[11px] text-left sm:text-center">
                        {trade ? (
                          <span
                            className={
                              trade.action === 'buy'
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            }
                          >
                            {trade.action === 'buy' ? 'Buy' : 'Sell'}{' '}
                            {formatCurrency(trade.amount, viewConfig.currency)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">&mdash;</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeHolding(h.id)}
                        className="hidden sm:flex items-center justify-center size-6 rounded-md text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-3.5"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Rebalance Summary (collapsible) */}
          {result.rebalanceTrades.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-border/40">
              <button
                type="button"
                onClick={() => setRebalanceOpen((p) => !p)}
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn('size-3 transition-transform', rebalanceOpen && 'rotate-90')}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Rebalance Summary ({result.rebalanceTrades.length} trade
                {result.rebalanceTrades.length === 1 ? '' : 's'})
              </button>

              {rebalanceOpen && (
                <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
                  {result.rebalanceTrades.map((trade) => (
                    <div
                      key={trade.symbol}
                      className="flex items-center justify-between px-3 py-2 border-b border-border/40 last:border-b-0 transition-colors hover:bg-muted/20"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded',
                            trade.action === 'buy'
                              ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                              : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
                          )}
                        >
                          {trade.action}
                        </span>
                        <span className="text-[13px] font-medium text-foreground font-mono">
                          {trade.symbol}
                        </span>
                        <span className="text-[12px] text-muted-foreground">{trade.name}</span>
                      </div>
                      <span
                        className={cn(
                          'text-[13px] font-medium font-mono tabular-nums',
                          trade.action === 'buy'
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400',
                        )}
                      >
                        {formatCurrency(trade.amount, viewConfig.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5 pt-4 border-t border-border/40">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Notes
            </label>
            <textarea
              value={viewConfig.notes}
              onChange={(e) => updateConfig({ notes: e.target.value })}
              placeholder="Notes..."
              rows={3}
              className={cn(inputClass, 'resize-none py-2')}
            />
          </div>

          {/* Disclaimer */}
          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
            Portfolio allocation data is for informational purposes only. Rebalance suggestions are
            estimates and do not constitute financial advice. Consult a financial advisor before
            making investment decisions.
          </p>
        </div>
      </div>
    );
  },
  (prev, next) => prev.item.id === next.item.id && prev.workspaceId === next.workspaceId,
);
