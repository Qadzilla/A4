import { cn } from '@a4/ui';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import {
  computePortfolio,
  createDefaultPortfolioData,
  getDriftColor,
} from '../../lib/portfolio-utils';
import type { PortfolioCardData, PortfolioHolding } from '../../lib/portfolio-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

function MetricBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      {children}
    </div>
  );
}

export const PortfolioCardView = memo(
  function PortfolioCardView({ item }: { item: CanvasItem }) {
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    const [data, setData] = useState<PortfolioCardData>(() => {
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
      setData(
        d?.currency ? { ...createDefaultPortfolioData(), ...d } : createDefaultPortfolioData(),
      );
      dirtyRef.current = false;
    }, [item.id]);

    // Auto-save (debounced 800ms)
    useEffect(() => {
      if (!dirtyRef.current) return;

      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus('saving');
        updateItemData(item.id, data as unknown as Record<string, unknown>);
        setSaveStatus('saved');
        clearTimeout(savedIndicatorRef.current);
        savedIndicatorRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }, 800);

      return () => clearTimeout(saveTimerRef.current);
    }, [data, item.id, updateItemData]);

    useEffect(() => {
      return () => {
        clearTimeout(saveTimerRef.current);
        clearTimeout(savedIndicatorRef.current);
      };
    }, []);

    const update = (patch: Partial<PortfolioCardData>) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, ...patch }));
    };

    const addHolding = () => {
      const value = Number(newHolding.value);
      const targetPct = Number(newHolding.targetPct);
      if (!newHolding.symbol.trim() || Number.isNaN(value) || value < 0) return;
      if (Number.isNaN(targetPct) || targetPct < 0 || targetPct > 100) return;

      const holding: PortfolioHolding = {
        id: crypto.randomUUID(),
        symbol: newHolding.symbol.trim().toUpperCase(),
        name: newHolding.name.trim(),
        value,
        targetPct,
      };
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, holdings: [...prev.holdings, holding] }));
      setNewHolding({ symbol: '', name: '', value: '', targetPct: '' });
    };

    const removeHolding = (id: string) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, holdings: prev.holdings.filter((h) => h.id !== id) }));
    };

    const updateHolding = (id: string, patch: Partial<PortfolioHolding>) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        holdings: prev.holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)),
      }));
    };

    const result = useMemo(() => computePortfolio(data), [data]);

    const driftColorClass = (color: 'green' | 'yellow' | 'red') => {
      if (color === 'green') return 'text-green-600 dark:text-green-400';
      if (color === 'yellow') return 'text-amber-600 dark:text-amber-400';
      return 'text-red-600 dark:text-red-400';
    };

    return (
      <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-8">
        <div className="w-full max-w-4xl space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
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
              <h2 className="text-base font-semibold text-black dark:text-zinc-100">{item.name}</h2>
              <p className="text-[11px] text-black/60 dark:text-zinc-300">Portfolio Allocation</p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-black/60 dark:text-zinc-300">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Currency
            </label>
            <select
              value={data.currency}
              onChange={(e) => update({ currency: e.target.value as SupportedCurrency })}
              className={cn(inputClass, 'w-[200px]')}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.symbol} {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Summary metrics */}
          <div className="grid grid-cols-4 gap-4 rounded-lg border border-border bg-muted/20 p-4">
            <MetricBox label="Total Value">
              <p className="text-[16px] font-bold text-foreground tabular-nums">
                {formatCurrency(result.totalValue, data.currency)}
              </p>
            </MetricBox>
            <MetricBox label="Target Total">
              <p
                className={cn(
                  'text-[16px] font-bold tabular-nums',
                  Math.abs(result.targetTotal - 100) > 0.01
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-foreground',
                )}
              >
                {result.targetTotal.toFixed(1)}%
              </p>
            </MetricBox>
            <MetricBox label="Holdings">
              <p className="text-[16px] font-bold text-foreground tabular-nums">
                {data.holdings.length}
              </p>
            </MetricBox>
            <MetricBox label="Status">
              <p
                className={cn(
                  'text-[16px] font-bold',
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
          {data.holdings.length > 0 && Math.abs(result.targetTotal - 100) > 0.01 && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5">
              <p className="text-[12px] text-amber-700 dark:text-amber-300">
                Target allocations sum to {result.targetTotal.toFixed(1)}% instead of 100%. Adjust
                your targets to ensure they total 100%.
              </p>
            </div>
          )}

          {/* Add Holding form */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
              Add Holding
            </p>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Symbol</label>
                <input
                  type="text"
                  value={newHolding.symbol}
                  onChange={(e) =>
                    setNewHolding((p) => ({ ...p, symbol: e.target.value.toUpperCase() }))
                  }
                  placeholder="AAPL"
                  className={cn(inputClass, 'w-[90px] uppercase')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addHolding();
                  }}
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-muted-foreground">Name</label>
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
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Value</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={newHolding.value}
                  onChange={(e) => setNewHolding((p) => ({ ...p, value: e.target.value }))}
                  placeholder="0.00"
                  className={cn(inputClass, 'w-[120px]')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addHolding();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Target %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={newHolding.targetPct}
                  onChange={(e) => setNewHolding((p) => ({ ...p, targetPct: e.target.value }))}
                  placeholder="25"
                  className={cn(inputClass, 'w-[90px]')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addHolding();
                  }}
                />
              </div>
              <button
                type="button"
                onClick={addHolding}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Holdings Table */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
              Holdings ({data.holdings.length})
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-[70px_1fr_100px_70px_70px_70px_90px_80px_32px] gap-2 px-3 py-2 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
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

              {data.holdings.length === 0 ? (
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
                      className="grid grid-cols-[70px_1fr_100px_70px_70px_70px_90px_80px_32px] gap-2 px-3 py-1.5 border-t border-border/40 items-center"
                    >
                      <input
                        type="text"
                        value={h.symbol}
                        onChange={(e) =>
                          updateHolding(h.id, { symbol: e.target.value.toUpperCase() })
                        }
                        className="border-0 bg-transparent text-[13px] font-medium text-black dark:text-zinc-100 uppercase focus:outline-none w-full"
                      />
                      <input
                        type="text"
                        value={h.name}
                        onChange={(e) => updateHolding(h.id, { name: e.target.value })}
                        placeholder="Name"
                        className="border-0 bg-transparent text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none w-full"
                      />
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={h.value}
                        onChange={(e) =>
                          updateHolding(h.id, { value: Number(e.target.value) || 0 })
                        }
                        className="border-0 bg-transparent text-[13px] text-right text-black dark:text-zinc-100 focus:outline-none tabular-nums w-full"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={h.targetPct}
                        onChange={(e) =>
                          updateHolding(h.id, { targetPct: Number(e.target.value) || 0 })
                        }
                        className="border-0 bg-transparent text-[13px] text-right text-black dark:text-zinc-100 focus:outline-none tabular-nums w-full"
                      />
                      <span className="text-[12px] text-right text-muted-foreground tabular-nums">
                        {h.actualPct.toFixed(1)}%
                      </span>
                      <span
                        className={cn(
                          'text-[12px] text-right tabular-nums',
                          driftColorClass(color),
                        )}
                      >
                        {h.driftPct > 0 ? '+' : ''}
                        {h.driftPct.toFixed(1)}%
                      </span>
                      <span
                        className={cn(
                          'text-[12px] text-right tabular-nums',
                          driftColorClass(color),
                        )}
                      >
                        {h.driftValue >= 0 ? '+' : ''}
                        {formatCurrency(h.driftValue, data.currency)}
                      </span>
                      <span className="text-[11px] text-center">
                        {trade ? (
                          <span
                            className={
                              trade.action === 'buy'
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            }
                          >
                            {trade.action === 'buy' ? 'Buy' : 'Sell'}{' '}
                            {formatCurrency(trade.amount, data.currency)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">&mdash;</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeHolding(h.id)}
                        className="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-3"
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
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setRebalanceOpen((p) => !p)}
                className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400 hover:text-foreground transition-colors"
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
                <div className="rounded-lg border border-border overflow-hidden">
                  {result.rebalanceTrades.map((trade) => (
                    <div
                      key={trade.symbol}
                      className="flex items-center justify-between px-3 py-2 border-b border-border/40 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded',
                            trade.action === 'buy'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
                          )}
                        >
                          {trade.action}
                        </span>
                        <span className="text-[13px] font-medium text-foreground">
                          {trade.symbol}
                        </span>
                        <span className="text-[12px] text-muted-foreground">{trade.name}</span>
                      </div>
                      <span
                        className={cn(
                          'text-[13px] font-medium tabular-nums',
                          trade.action === 'buy'
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400',
                        )}
                      >
                        {formatCurrency(trade.amount, data.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
              Notes
            </label>
            <textarea
              value={data.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Notes..."
              rows={3}
              className={cn(inputClass, 'resize-none')}
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
  (prev, next) => prev.item.id === next.item.id,
);
