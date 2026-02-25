import { cn } from '@a4/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SUPPORTED_CURRENCIES } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import {
  MONTH_OPTIONS,
  PL_SECTION_META,
  PL_SECTION_ORDER,
  buildWaterfallData,
  computePLTotals,
  formatMarginPct,
  formatPLCurrency,
  getFiscalMonthHeaders,
  getFiscalYearLabel,
  newLineItem,
  sumLineItemAnnual,
} from '../../lib/pnl-utils';
import type { PLCardData, PLSection, PLSectionId } from '../../lib/pnl-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

export const PnlCardView = memo(function PnlCardView({ item }: { item: CanvasItem }) {
  const updateItemData = useCanvasStore((s) => s.updateItemData);

  const [data, setData] = useState<PLCardData>(() => {
    const d = item.data as PLCardData | undefined;
    return {
      fiscalYearStart: d?.fiscalYearStart ?? new Date().getFullYear(),
      fiscalMonthStart: d?.fiscalMonthStart ?? 1,
      currency: (d?.currency ?? 'USD') as SupportedCurrency,
      sections: d?.sections ?? PL_SECTION_ORDER.map((id) => ({ id, lineItems: [newLineItem()] })),
      viewMode: d?.viewMode ?? 'table',
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
    const d = item.data as PLCardData | undefined;
    setData({
      fiscalYearStart: d?.fiscalYearStart ?? new Date().getFullYear(),
      fiscalMonthStart: d?.fiscalMonthStart ?? 1,
      currency: (d?.currency ?? 'USD') as SupportedCurrency,
      sections: d?.sections ?? PL_SECTION_ORDER.map((id) => ({ id, lineItems: [newLineItem()] })),
      viewMode: d?.viewMode ?? 'table',
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

  const update = useCallback((patch: Partial<PLCardData>) => {
    dirtyRef.current = true;
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateSection = useCallback((sectionId: PLSectionId, fn: (s: PLSection) => PLSection) => {
    dirtyRef.current = true;
    setData((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === sectionId ? fn(s) : s)),
    }));
  }, []);

  const updateLineItemAmount = useCallback(
    (sectionId: PLSectionId, itemId: string, monthIdx: number, value: number) => {
      updateSection(sectionId, (s) => ({
        ...s,
        lineItems: s.lineItems.map((li) =>
          li.id === itemId
            ? { ...li, amounts: li.amounts.map((a, i) => (i === monthIdx ? value : a)) }
            : li,
        ),
      }));
    },
    [updateSection],
  );

  const updateLineItemName = useCallback(
    (sectionId: PLSectionId, itemId: string, name: string) => {
      updateSection(sectionId, (s) => ({
        ...s,
        lineItems: s.lineItems.map((li) => (li.id === itemId ? { ...li, name } : li)),
      }));
    },
    [updateSection],
  );

  const addLineItem = useCallback(
    (sectionId: PLSectionId) => {
      updateSection(sectionId, (s) => ({
        ...s,
        lineItems: [...s.lineItems, newLineItem()],
      }));
    },
    [updateSection],
  );

  const removeLineItem = useCallback(
    (sectionId: PLSectionId, itemId: string) => {
      updateSection(sectionId, (s) => ({
        ...s,
        lineItems: s.lineItems.filter((li) => li.id !== itemId),
      }));
    },
    [updateSection],
  );

  const toggleLineItemIncome = useCallback(
    (sectionId: PLSectionId, itemId: string) => {
      updateSection(sectionId, (s) => ({
        ...s,
        lineItems: s.lineItems.map((li) =>
          li.id === itemId ? { ...li, isIncome: !li.isIncome } : li,
        ),
      }));
    },
    [updateSection],
  );

  const totals = computePLTotals(data.sections);
  const monthHeaders = getFiscalMonthHeaders(data.fiscalYearStart, data.fiscalMonthStart);
  const fyLabel = getFiscalYearLabel(data.fiscalYearStart, data.fiscalMonthStart);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Settings row */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          Year
          <input
            type="number"
            value={data.fiscalYearStart}
            onChange={(e) =>
              update({ fiscalYearStart: Number(e.target.value) || new Date().getFullYear() })
            }
            className="w-20 rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground"
          />
        </label>

        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          Start
          <select
            value={data.fiscalMonthStart}
            onChange={(e) => update({ fiscalMonthStart: Number(e.target.value) })}
            className="rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground"
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          Currency
          <select
            value={data.currency}
            onChange={(e) => update({ currency: e.target.value as SupportedCurrency })}
            className="rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.symbol} {c.value}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex items-center rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => update({ viewMode: 'table' })}
            className={cn(
              'px-3 py-1 text-[11px] font-medium transition-colors',
              data.viewMode === 'table'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            Table
          </button>
          <button
            type="button"
            onClick={() => update({ viewMode: 'waterfall' })}
            className={cn(
              'px-3 py-1 text-[11px] font-medium transition-colors',
              data.viewMode === 'waterfall'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            Waterfall
          </button>
        </div>

        {/* Save indicator */}
        <span
          className={cn(
            'text-[10px] transition-opacity',
            saveStatus === 'idle' ? 'opacity-0' : 'opacity-100',
            saveStatus === 'saving'
              ? 'text-muted-foreground'
              : 'text-green-600 dark:text-green-400',
          )}
        >
          {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {data.viewMode === 'table' ? (
          <PLTable
            data={data}
            totals={totals}
            monthHeaders={monthHeaders}
            currency={data.currency}
            onUpdateAmount={updateLineItemAmount}
            onUpdateName={updateLineItemName}
            onAddLineItem={addLineItem}
            onRemoveLineItem={removeLineItem}
            onToggleIncome={toggleLineItemIncome}
          />
        ) : (
          <PLWaterfall totals={totals} currency={data.currency} />
        )}
      </div>
    </div>
  );
});

// ─── Table View ─────────────────────────────────────────────────────

interface PLTableProps {
  data: PLCardData;
  totals: ReturnType<typeof computePLTotals>;
  monthHeaders: string[];
  currency: SupportedCurrency;
  onUpdateAmount: (sectionId: PLSectionId, itemId: string, monthIdx: number, value: number) => void;
  onUpdateName: (sectionId: PLSectionId, itemId: string, name: string) => void;
  onAddLineItem: (sectionId: PLSectionId) => void;
  onRemoveLineItem: (sectionId: PLSectionId, itemId: string) => void;
  onToggleIncome: (sectionId: PLSectionId, itemId: string) => void;
}

function PLTable({
  data,
  totals,
  monthHeaders,
  currency,
  onUpdateAmount,
  onUpdateName,
  onAddLineItem,
  onRemoveLineItem,
  onToggleIncome,
}: PLTableProps) {
  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border/60">
              <th className="sticky left-0 z-10 bg-background text-left font-medium text-muted-foreground py-2 px-3 min-w-[180px]" />
              {monthHeaders.map((h) => (
                <th
                  key={h}
                  className="text-right font-medium text-muted-foreground py-2 px-1 min-w-[80px]"
                >
                  {h}
                </th>
              ))}
              <th className="text-right font-semibold text-foreground py-2 px-2 min-w-[100px]">
                Total
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {PL_SECTION_ORDER.map((sectionId, sIdx) => {
              const section = data.sections.find((s) => s.id === sectionId);
              const meta = PL_SECTION_META[sectionId]!;

              return (
                <SectionRows
                  key={sectionId}
                  sectionId={sectionId}
                  section={section}
                  meta={meta}
                  totals={totals}
                  currency={currency}
                  isFirst={sIdx === 0}
                  onUpdateAmount={onUpdateAmount}
                  onUpdateName={onUpdateName}
                  onAddLineItem={onAddLineItem}
                  onRemoveLineItem={onRemoveLineItem}
                  onToggleIncome={onToggleIncome}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface SectionRowsProps {
  sectionId: PLSectionId;
  section: PLSection | undefined;
  meta: { label: string; subtotalLabel: string; sign: 1 | -1 };
  totals: ReturnType<typeof computePLTotals>;
  currency: SupportedCurrency;
  isFirst: boolean;
  onUpdateAmount: (sectionId: PLSectionId, itemId: string, monthIdx: number, value: number) => void;
  onUpdateName: (sectionId: PLSectionId, itemId: string, name: string) => void;
  onAddLineItem: (sectionId: PLSectionId) => void;
  onRemoveLineItem: (sectionId: PLSectionId, itemId: string) => void;
  onToggleIncome: (sectionId: PLSectionId, itemId: string) => void;
}

function SectionRows({
  sectionId,
  section,
  meta,
  totals,
  currency,
  isFirst,
  onUpdateAmount,
  onUpdateName,
  onAddLineItem,
  onRemoveLineItem,
  onToggleIncome,
}: SectionRowsProps) {
  const lineItems = section?.lineItems ?? [];

  // Pick the right subtotal/key-total arrays
  const subtotalArr = getSubtotalArr(sectionId, totals);
  const subtotalAnnual = subtotalArr.reduce((a, b) => a + b, 0);

  // Key totals after specific sections
  const keyTotals = getKeyTotals(sectionId, totals, currency);

  return (
    <>
      {/* Section header */}
      <tr>
        <td colSpan={15} className={cn('sticky left-0 z-10 bg-background', !isFirst && 'pt-4')}>
          <div className="flex items-center gap-2 py-1.5 px-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {meta.label}
            </span>
            <button
              type="button"
              onClick={() => onAddLineItem(sectionId)}
              className="text-[10px] text-primary hover:text-primary/80 font-medium"
            >
              + Add
            </button>
          </div>
        </td>
      </tr>

      {/* Line items */}
      {lineItems.map((li) => (
        <tr key={li.id} className="group hover:bg-muted/20">
          <td className="sticky left-0 z-10 bg-background group-hover:bg-muted/20 py-0.5 px-3">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={li.name}
                onChange={(e) => onUpdateName(sectionId, li.id, e.target.value)}
                placeholder="Line item name"
                className="w-full bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/50 outline-none"
              />
              {sectionId === 'other' && (
                <button
                  type="button"
                  onClick={() => onToggleIncome(sectionId, li.id)}
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                    li.isIncome
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400',
                  )}
                >
                  {li.isIncome ? 'Income' : 'Expense'}
                </button>
              )}
            </div>
          </td>
          {li.amounts.map((amt, mIdx) => (
            <td key={mIdx} className="py-0.5 px-1">
              <AmountInput
                value={amt}
                onChange={(v) => onUpdateAmount(sectionId, li.id, mIdx, v)}
              />
            </td>
          ))}
          <td className="text-right font-mono text-[12px] text-foreground py-0.5 px-2">
            {formatPLCurrency(sumLineItemAnnual(li), currency)}
          </td>
          <td className="py-0.5 px-1">
            <button
              type="button"
              onClick={() => onRemoveLineItem(sectionId, li.id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
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
          </td>
        </tr>
      ))}

      {/* Section subtotal */}
      <tr className="border-t border-border/40">
        <td className="sticky left-0 z-10 bg-background text-[12px] font-semibold text-foreground py-1 px-3">
          {meta.subtotalLabel}
        </td>
        {subtotalArr.map((v, i) => (
          <td
            key={i}
            className="text-right font-mono text-[12px] font-semibold text-foreground py-1 px-1"
          >
            {formatPLCurrency(v, currency)}
          </td>
        ))}
        <td className="text-right font-mono text-[12px] font-bold text-foreground py-1 px-2">
          {formatPLCurrency(subtotalAnnual, currency)}
        </td>
        <td />
      </tr>

      {/* Key totals (Gross Profit, EBIT, Pre-Tax, Net Income) */}
      {keyTotals.map((kt) => (
        <tr key={kt.label} className="border-t-2 border-foreground/20">
          <td className="sticky left-0 z-10 bg-background text-[12px] font-bold text-foreground py-1.5 px-3">
            {kt.label}
            {kt.margin && (
              <span
                className={cn(
                  'ml-2 text-[10px] font-medium',
                  kt.marginValue! >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {kt.margin}
              </span>
            )}
          </td>
          {kt.values.map((v, i) => (
            <td
              key={i}
              className="text-right font-mono text-[12px] font-bold text-foreground py-1.5 px-1"
            >
              {formatPLCurrency(v, currency)}
            </td>
          ))}
          <td className="text-right font-mono text-[12px] font-bold text-foreground py-1.5 px-2">
            {formatPLCurrency(kt.annual, currency)}
          </td>
          <td />
        </tr>
      ))}
    </>
  );
}

function getSubtotalArr(
  sectionId: PLSectionId,
  totals: ReturnType<typeof computePLTotals>,
): number[] {
  switch (sectionId) {
    case 'revenue':
      return totals.netRevenue;
    case 'cogs':
      return totals.totalCogs;
    case 'opex':
      return totals.totalOpex;
    case 'other':
      return totals.netOther;
    case 'tax':
      return totals.totalTax;
  }
}

interface KeyTotal {
  label: string;
  values: number[];
  annual: number;
  margin?: string;
  marginValue?: number;
}

function getKeyTotals(
  sectionId: PLSectionId,
  totals: ReturnType<typeof computePLTotals>,
  currency: SupportedCurrency,
): KeyTotal[] {
  switch (sectionId) {
    case 'cogs':
      return [
        {
          label: 'Gross Profit',
          values: totals.grossProfit,
          annual: totals.annualGrossProfit,
          margin: `Gross Margin: ${formatMarginPct(totals.grossMarginPct)}`,
          marginValue: totals.grossMarginPct,
        },
      ];
    case 'opex':
      return [
        {
          label: 'Operating Income (EBIT)',
          values: totals.operatingIncome,
          annual: totals.annualOperatingIncome,
          margin: `Operating Margin: ${formatMarginPct(totals.operatingMarginPct)}`,
          marginValue: totals.operatingMarginPct,
        },
      ];
    case 'other':
      return [
        {
          label: 'Pre-Tax Income',
          values: totals.preTaxIncome,
          annual: totals.preTaxIncome.reduce((a, b) => a + b, 0),
        },
      ];
    case 'tax':
      return [
        {
          label: 'Net Income',
          values: totals.netIncome,
          annual: totals.annualNetIncome,
          margin: `Net Margin: ${formatMarginPct(totals.netMarginPct)}`,
          marginValue: totals.netMarginPct,
        },
      ];
    default:
      return [];
  }
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
      className="w-20 text-right font-mono text-[12px] text-foreground bg-transparent border border-transparent rounded px-1 py-0.5 outline-none hover:border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
    />
  );
}

// ─── Waterfall Chart View ───────────────────────────────────────────

function PLWaterfall({
  totals,
  currency,
}: { totals: ReturnType<typeof computePLTotals>; currency: SupportedCurrency }) {
  const waterfallData = buildWaterfallData(totals);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Chart */}
      <div className="rounded-lg border border-border/60 bg-card p-4">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={waterfallData}
            layout="vertical"
            margin={{ top: 10, right: 40, left: 10, bottom: 10 }}
          >
            <XAxis
              type="number"
              tickFormatter={(v: number) => formatPLCurrency(v, currency)}
              tick={{ fontSize: 10 }}
            />
            <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === 'start') return [null, null];
                return [formatPLCurrency(value, currency), 'Amount'];
              }}
              labelFormatter={(label: string) => label}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
            />
            {/* Invisible base bar */}
            <Bar dataKey="start" stackId="a" fill="transparent" />
            {/* Visible value bar */}
            <Bar dataKey="value" stackId="a" radius={[0, 2, 2, 0]}>
              {waterfallData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-4">
        <MetricBox
          label="Net Revenue"
          value={formatPLCurrency(totals.annualNetRevenue, currency)}
        />
        <MetricBox
          label="Gross Margin"
          value={formatMarginPct(totals.grossMarginPct)}
          color={totals.grossMarginPct >= 0 ? 'green' : 'red'}
        />
        <MetricBox label="EBIT" value={formatPLCurrency(totals.annualOperatingIncome, currency)} />
        <MetricBox
          label="Operating Margin"
          value={formatMarginPct(totals.operatingMarginPct)}
          color={totals.operatingMarginPct >= 0 ? 'green' : 'red'}
        />
        <MetricBox
          label="Net Income"
          value={formatPLCurrency(totals.annualNetIncome, currency)}
          color={totals.annualNetIncome >= 0 ? 'green' : 'red'}
        />
        <MetricBox
          label="Net Margin"
          value={formatMarginPct(totals.netMarginPct)}
          color={totals.netMarginPct >= 0 ? 'green' : 'red'}
        />
      </div>
    </div>
  );
}

function MetricBox({
  label,
  value,
  color,
}: { label: string; value: string; color?: 'green' | 'red' }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p
        className={cn(
          'text-[16px] font-bold mt-0.5',
          color === 'green' && 'text-green-600 dark:text-green-400',
          color === 'red' && 'text-red-600 dark:text-red-400',
          !color && 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  );
}
