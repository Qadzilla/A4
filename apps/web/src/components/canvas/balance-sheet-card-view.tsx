import { cn } from '@a4/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  BS_SECTION_META,
  BS_SECTION_ORDER,
  computeBSTotals,
  formatBSCurrency,
  formatPercent,
  formatRatio,
  newBSLineItem,
} from '../../lib/balance-sheet-utils';
import type { BSCardData, BSSection, BSSectionId } from '../../lib/balance-sheet-utils';
import { SUPPORTED_CURRENCIES } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const selectClass =
  'rounded-md border border-border bg-muted/20 px-2 py-1 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:14px_14px] bg-[position:right_6px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] pr-7 cursor-pointer';

export const BalanceSheetCardView = memo(function BalanceSheetCardView({
  item,
}: { item: CanvasItem }) {
  const updateItemData = useCanvasStore((s) => s.updateItemData);

  const [data, setData] = useState<BSCardData>(() => {
    const d = item.data as BSCardData | undefined;
    return {
      asOfDate: d?.asOfDate ?? new Date().toISOString().slice(0, 10),
      currency: (d?.currency ?? 'USD') as SupportedCurrency,
      sections: d?.sections ?? BS_SECTION_ORDER.map((id) => ({ id, lineItems: [newBSLineItem()] })),
      notes: d?.notes ?? '',
    };
  });

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirtyRef = useRef(false);

  // Re-load when switching items
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
  useEffect(() => {
    const d = item.data as BSCardData | undefined;
    setData({
      asOfDate: d?.asOfDate ?? new Date().toISOString().slice(0, 10),
      currency: (d?.currency ?? 'USD') as SupportedCurrency,
      sections: d?.sections ?? BS_SECTION_ORDER.map((id) => ({ id, lineItems: [newBSLineItem()] })),
      notes: d?.notes ?? '',
    });
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

  const update = useCallback((patch: Partial<BSCardData>) => {
    dirtyRef.current = true;
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateSection = useCallback((sectionId: BSSectionId, fn: (s: BSSection) => BSSection) => {
    dirtyRef.current = true;
    setData((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === sectionId ? fn(s) : s)),
    }));
  }, []);

  const updateLineItemValue = useCallback(
    (sectionId: BSSectionId, itemId: string, value: number) => {
      updateSection(sectionId, (s) => ({
        ...s,
        lineItems: s.lineItems.map((li) => (li.id === itemId ? { ...li, value } : li)),
      }));
    },
    [updateSection],
  );

  const updateLineItemName = useCallback(
    (sectionId: BSSectionId, itemId: string, name: string) => {
      updateSection(sectionId, (s) => ({
        ...s,
        lineItems: s.lineItems.map((li) => (li.id === itemId ? { ...li, name } : li)),
      }));
    },
    [updateSection],
  );

  const addLineItem = useCallback(
    (sectionId: BSSectionId) => {
      updateSection(sectionId, (s) => ({
        ...s,
        lineItems: [...s.lineItems, newBSLineItem()],
      }));
    },
    [updateSection],
  );

  const removeLineItem = useCallback(
    (sectionId: BSSectionId, itemId: string) => {
      updateSection(sectionId, (s) => ({
        ...s,
        lineItems: s.lineItems.filter((li) => li.id !== itemId),
      }));
    },
    [updateSection],
  );

  const totals = computeBSTotals(data.sections);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-muted/30">
      {/* Settings row */}
      <div className="flex items-center gap-3 border-b border-border/60 bg-card px-4 py-2.5 flex-wrap">
        <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          As of
          <input
            type="date"
            value={data.asOfDate}
            onChange={(e) => update({ asOfDate: e.target.value })}
            className="rounded-md border border-border bg-muted/20 px-2 py-1 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
          />
        </label>

        <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Currency
          <select
            value={data.currency}
            onChange={(e) => update({ currency: e.target.value as SupportedCurrency })}
            className={selectClass}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.symbol} {c.value}
              </option>
            ))}
          </select>
        </label>

        {saveStatus !== 'idle' && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <BSTable
          data={data}
          totals={totals}
          currency={data.currency}
          onUpdateValue={updateLineItemValue}
          onUpdateName={updateLineItemName}
          onAddLineItem={addLineItem}
          onRemoveLineItem={removeLineItem}
        />
      </div>
    </div>
  );
});

// ─── Table View ─────────────────────────────────────────────────────

interface BSTableProps {
  data: BSCardData;
  totals: ReturnType<typeof computeBSTotals>;
  currency: SupportedCurrency;
  onUpdateValue: (sectionId: BSSectionId, itemId: string, value: number) => void;
  onUpdateName: (sectionId: BSSectionId, itemId: string, name: string) => void;
  onAddLineItem: (sectionId: BSSectionId) => void;
  onRemoveLineItem: (sectionId: BSSectionId, itemId: string) => void;
}

function BSTable({
  data,
  totals,
  currency,
  onUpdateValue,
  onUpdateName,
  onAddLineItem,
  onRemoveLineItem,
}: BSTableProps) {
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-1">
      {BS_SECTION_ORDER.map((sectionId, sIdx) => {
        const section = data.sections.find((s) => s.id === sectionId);
        const meta = BS_SECTION_META[sectionId]!;
        const lineItems = section?.lineItems ?? [];

        // Compute section subtotal
        const sectionTotal = lineItems.reduce((sum, li) => sum + li.value, 0);

        // Determine group totals to show after sections
        const showAssetTotal = sectionId === 'non-current-assets';
        const showLiabilityTotal = sectionId === 'non-current-liabilities';
        const showEquityTotal = sectionId === 'equity';

        return (
          <div key={sectionId}>
            {/* Section header */}
            <div className={cn('flex items-center gap-2 py-1.5 px-3', sIdx > 0 && 'pt-3')}>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {meta.label}
              </span>
              <button
                type="button"
                onClick={() => onAddLineItem(sectionId)}
                className="text-[11px] text-primary/80 hover:text-primary font-medium transition-colors"
              >
                + Add
              </button>
            </div>

            {/* Line items */}
            {lineItems.map((li) => (
              <div key={li.id} className="group flex items-center transition-colors hover:bg-muted/20 py-0.5 px-3">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={li.name}
                    onChange={(e) => onUpdateName(sectionId, li.id, e.target.value)}
                    placeholder="Line item name"
                    className="w-full border border-border bg-muted/20 rounded-md px-1.5 py-0.5 text-[12px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/30 transition-all"
                  />
                </div>
                <AmountInput
                  value={li.value}
                  onChange={(v) => onUpdateValue(sectionId, li.id, v)}
                />
                <button
                  type="button"
                  onClick={() => onRemoveLineItem(sectionId, li.id)}
                  className="ml-1 opacity-0 group-hover:opacity-100 flex items-center justify-center size-5 rounded-md text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-all"
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
            ))}

            {/* Section subtotal */}
            <div className="flex items-center border-t border-border/40 py-1 px-3">
              <span className="flex-1 text-[12px] font-semibold text-foreground">
                Total {meta.label}
              </span>
              <span className="w-40 text-right font-mono tabular-nums text-[12px] font-semibold text-foreground">
                {formatBSCurrency(sectionTotal, currency)}
              </span>
              <span className="w-5" />
            </div>

            {/* Group total: TOTAL ASSETS */}
            {showAssetTotal && (
              <div className="flex items-center border-t-2 border-foreground/20 py-1.5 px-3 mt-1">
                <span className="flex-1 text-[12px] font-bold text-foreground uppercase tracking-wide">
                  Total Assets
                </span>
                <span className="w-40 text-right font-mono tabular-nums text-[12px] font-bold text-foreground">
                  {formatBSCurrency(totals.totalAssets, currency)}
                </span>
                <span className="w-5" />
              </div>
            )}

            {/* Group total: TOTAL LIABILITIES */}
            {showLiabilityTotal && (
              <div className="flex items-center border-t-2 border-foreground/20 py-1.5 px-3 mt-1">
                <span className="flex-1 text-[12px] font-bold text-foreground uppercase tracking-wide">
                  Total Liabilities
                </span>
                <span className="w-40 text-right font-mono tabular-nums text-[12px] font-bold text-foreground">
                  {formatBSCurrency(totals.totalLiabilities, currency)}
                </span>
                <span className="w-5" />
              </div>
            )}

            {/* Group total: TOTAL EQUITY + L+E + balance indicator */}
            {showEquityTotal && (
              <>
                <div className="flex items-center border-t-2 border-foreground/20 py-1.5 px-3 mt-1">
                  <span className="flex-1 text-[12px] font-bold text-foreground uppercase tracking-wide">
                    Liabilities + Equity
                  </span>
                  <span className="w-40 text-right font-mono tabular-nums text-[12px] font-bold text-foreground">
                    {formatBSCurrency(totals.liabilitiesPlusEquity, currency)}
                  </span>
                  <span className="w-5" />
                </div>

                {/* Balance indicator */}
                <div className="flex items-center gap-2 px-3 py-2 mt-1">
                  {totals.isBalanced ? (
                    <>
                      <span className="size-2 rounded-full bg-green-500" />
                      <span className="text-[11px] font-medium text-green-600 dark:text-green-400">
                        Balanced
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="size-2 rounded-full bg-amber-500" />
                      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        Unbalanced — Off by{' '}
                        {formatBSCurrency(
                          Math.abs(totals.totalAssets - totals.liabilitiesPlusEquity),
                          currency,
                        )}
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Ratios panel */}
      <div className="pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <MetricBox
            label="Current Ratio"
            value={formatRatio(totals.currentRatio)}
            color={
              totals.currentRatio === 0
                ? undefined
                : totals.currentRatio >= 1.5
                  ? 'green'
                  : totals.currentRatio >= 1.0
                    ? 'amber'
                    : 'red'
            }
          />
          <MetricBox
            label="Working Capital"
            value={formatBSCurrency(totals.workingCapital, currency)}
            color={totals.workingCapital >= 0 ? 'green' : 'red'}
          />
          <MetricBox
            label="Debt-to-Equity"
            value={formatRatio(totals.debtToEquity)}
            color={
              totals.debtToEquity === 0
                ? undefined
                : totals.debtToEquity < 1.0
                  ? 'green'
                  : totals.debtToEquity <= 2.0
                    ? 'amber'
                    : 'red'
            }
          />
          <MetricBox label="Debt-to-Assets" value={formatPercent(totals.debtToAssets)} />
          <MetricBox label="Equity Ratio" value={formatPercent(totals.equityRatio)} />
        </div>
      </div>
    </div>
  );
}

// ─── Amount Input ───────────────────────────────────────────────────

function AmountInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(value === 0 ? '' : String(value));

  // Sync from parent when not focused
  useEffect(() => {
    if (!focused) {
      setText(value === 0 ? '' : String(value));
    }
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? text : value === 0 ? '' : value.toLocaleString('en-US')}
      onChange={(e) => {
        setText(e.target.value);
        const num = Number(e.target.value.replace(/,/g, ''));
        if (!Number.isNaN(num)) onChange(num);
      }}
      onFocus={(e) => {
        setFocused(true);
        setText(value === 0 ? '' : String(value));
        e.target.select();
      }}
      onBlur={() => {
        setFocused(false);
        const num = Number(text.replace(/,/g, ''));
        if (!Number.isNaN(num)) onChange(num);
      }}
      className="w-40 text-right font-mono tabular-nums text-[13px] text-foreground border border-border bg-muted/20 rounded-md px-1 py-0.5 outline-none focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/30 transition-all"
    />
  );
}

// ─── Metric Box ─────────────────────────────────────────────────────

function MetricBox({
  label,
  value,
  color,
}: { label: string; value: string; color?: 'green' | 'red' | 'amber' }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm px-4 py-3">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p
        className={cn(
          'text-[16px] font-semibold font-mono tabular-nums mt-1',
          color === 'green' && 'text-green-600 dark:text-green-400',
          color === 'red' && 'text-red-600 dark:text-red-400',
          color === 'amber' && 'text-amber-600 dark:text-amber-400',
          !color && 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  );
}
