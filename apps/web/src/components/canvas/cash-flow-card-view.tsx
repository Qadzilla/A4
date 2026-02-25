import { cn } from '@a4/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  CF_SECTION_META,
  CF_SECTION_ORDER,
  MONTH_OPTIONS,
  computeCFTotals,
  formatCFCurrency,
  getFiscalMonthHeaders,
  getFiscalYearLabel,
  newCFLineItem,
  sumLineItemAnnual,
} from '../../lib/cash-flow-utils';
import type { CFCardData, CFSection, CFSectionId } from '../../lib/cash-flow-utils';
import { SUPPORTED_CURRENCIES } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

export const CashFlowCardView = memo(function CashFlowCardView({ item }: { item: CanvasItem }) {
  const updateItemData = useCanvasStore((s) => s.updateItemData);

  const [data, setData] = useState<CFCardData>(() => {
    const d = item.data as CFCardData | undefined;
    return {
      fiscalYearStart: d?.fiscalYearStart ?? new Date().getFullYear(),
      fiscalMonthStart: d?.fiscalMonthStart ?? 1,
      currency: (d?.currency ?? 'USD') as SupportedCurrency,
      beginningCash: d?.beginningCash ?? 0,
      sections: d?.sections ?? CF_SECTION_ORDER.map((id) => ({ id, lineItems: [newCFLineItem()] })),
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
    const d = item.data as CFCardData | undefined;
    setData({
      fiscalYearStart: d?.fiscalYearStart ?? new Date().getFullYear(),
      fiscalMonthStart: d?.fiscalMonthStart ?? 1,
      currency: (d?.currency ?? 'USD') as SupportedCurrency,
      beginningCash: d?.beginningCash ?? 0,
      sections: d?.sections ?? CF_SECTION_ORDER.map((id) => ({ id, lineItems: [newCFLineItem()] })),
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

  const update = useCallback((patch: Partial<CFCardData>) => {
    dirtyRef.current = true;
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateSection = useCallback((sectionId: CFSectionId, fn: (s: CFSection) => CFSection) => {
    dirtyRef.current = true;
    setData((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === sectionId ? fn(s) : s)),
    }));
  }, []);

  const updateLineItemAmount = useCallback(
    (sectionId: CFSectionId, itemId: string, monthIdx: number, value: number) => {
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
    (sectionId: CFSectionId, itemId: string, name: string) => {
      updateSection(sectionId, (s) => ({
        ...s,
        lineItems: s.lineItems.map((li) => (li.id === itemId ? { ...li, name } : li)),
      }));
    },
    [updateSection],
  );

  const addLineItem = useCallback(
    (sectionId: CFSectionId) => {
      updateSection(sectionId, (s) => ({
        ...s,
        lineItems: [...s.lineItems, newCFLineItem()],
      }));
    },
    [updateSection],
  );

  const removeLineItem = useCallback(
    (sectionId: CFSectionId, itemId: string) => {
      updateSection(sectionId, (s) => ({
        ...s,
        lineItems: s.lineItems.filter((li) => li.id !== itemId),
      }));
    },
    [updateSection],
  );

  const totals = computeCFTotals(data.beginningCash, data.sections);
  const monthHeaders = getFiscalMonthHeaders(data.fiscalYearStart, data.fiscalMonthStart);

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

        {/* Save indicator */}
        <span
          className={cn(
            'ml-auto text-[10px] transition-opacity',
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
        <CFTable
          data={data}
          totals={totals}
          monthHeaders={monthHeaders}
          currency={data.currency}
          onUpdateAmount={updateLineItemAmount}
          onUpdateName={updateLineItemName}
          onAddLineItem={addLineItem}
          onRemoveLineItem={removeLineItem}
          onUpdateBeginningCash={(v) => update({ beginningCash: v })}
        />
      </div>
    </div>
  );
});

// ─── Table View ─────────────────────────────────────────────────────

interface CFTableProps {
  data: CFCardData;
  totals: ReturnType<typeof computeCFTotals>;
  monthHeaders: string[];
  currency: SupportedCurrency;
  onUpdateAmount: (sectionId: CFSectionId, itemId: string, monthIdx: number, value: number) => void;
  onUpdateName: (sectionId: CFSectionId, itemId: string, name: string) => void;
  onAddLineItem: (sectionId: CFSectionId) => void;
  onRemoveLineItem: (sectionId: CFSectionId, itemId: string) => void;
  onUpdateBeginningCash: (value: number) => void;
}

function CFTable({
  data,
  totals,
  monthHeaders,
  currency,
  onUpdateAmount,
  onUpdateName,
  onAddLineItem,
  onRemoveLineItem,
  onUpdateBeginningCash,
}: CFTableProps) {
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
            {/* Beginning Cash Balance row */}
            <BeginningCashRow
              totals={totals}
              currency={currency}
              onUpdateBeginningCash={onUpdateBeginningCash}
            />

            {/* Sections */}
            {CF_SECTION_ORDER.map((sectionId, sIdx) => {
              const section = data.sections.find((s) => s.id === sectionId);
              const meta = CF_SECTION_META[sectionId]!;

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
                />
              );
            })}

            {/* Net Change in Cash */}
            <tr className="border-t-2 border-foreground/20">
              <td className="sticky left-0 z-10 bg-background text-[12px] font-bold text-foreground py-1.5 px-3">
                Net Change in Cash
              </td>
              {totals.netCashFlow.map((v, i) => (
                <td
                  key={i}
                  className={cn(
                    'text-right font-mono text-[12px] font-bold py-1.5 px-1',
                    v >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {formatCFCurrency(v, currency)}
                </td>
              ))}
              <td
                className={cn(
                  'text-right font-mono text-[12px] font-bold py-1.5 px-2',
                  totals.annualNetCashFlow >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {formatCFCurrency(totals.annualNetCashFlow, currency)}
              </td>
              <td />
            </tr>

            {/* Ending Cash Balance */}
            <tr className="border-t-2 border-foreground/20">
              <td className="sticky left-0 z-10 bg-background text-[12px] font-bold text-foreground py-1.5 px-3">
                Ending Cash Balance
              </td>
              {totals.endingCash.map((v, i) => (
                <td
                  key={i}
                  className="text-right font-mono text-[12px] font-bold text-foreground py-1.5 px-1"
                >
                  {formatCFCurrency(v, currency)}
                </td>
              ))}
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Metrics Panel */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        <MetricBox
          label="Operating CF"
          value={formatCFCurrency(totals.annualOperatingCF, currency)}
          color={totals.annualOperatingCF >= 0 ? 'green' : 'red'}
        />
        <MetricBox
          label="Investing CF"
          value={formatCFCurrency(totals.annualInvestingCF, currency)}
        />
        <MetricBox
          label="Financing CF"
          value={formatCFCurrency(totals.annualFinancingCF, currency)}
        />
        <MetricBox
          label="Net Change"
          value={formatCFCurrency(totals.annualNetCashFlow, currency)}
          color={totals.annualNetCashFlow >= 0 ? 'green' : 'red'}
        />
        <MetricBox label="Ending Cash" value={formatCFCurrency(totals.finalEndingCash, currency)} />
        {totals.burnRate < 0 ? (
          <MetricBox
            label="Burn Rate / Runway"
            value={`${formatCFCurrency(totals.burnRate, currency)}/mo · ${totals.cashRunway > 0 ? `${totals.cashRunway.toFixed(1)} mo` : 'N/A'}`}
            color={
              totals.cashRunway > 0 && totals.cashRunway < 12
                ? 'red'
                : totals.cashRunway <= 18
                  ? 'amber'
                  : 'green'
            }
          />
        ) : (
          <MetricBox label="Burn Rate" value="N/A" />
        )}
      </div>
    </div>
  );
}

// ─── Beginning Cash Row ─────────────────────────────────────────────

function BeginningCashRow({
  totals,
  currency,
  onUpdateBeginningCash,
}: {
  totals: ReturnType<typeof computeCFTotals>;
  currency: SupportedCurrency;
  onUpdateBeginningCash: (v: number) => void;
}) {
  return (
    <tr className="border-b border-border/40 bg-muted/10">
      <td className="sticky left-0 z-10 bg-muted/10 text-[12px] font-semibold text-foreground py-1 px-3">
        Beginning Cash Balance
      </td>
      {totals.beginningCash.map((v, i) => (
        <td key={i} className="py-0.5 px-1">
          {i === 0 ? (
            <AmountInput value={v} onChange={onUpdateBeginningCash} />
          ) : (
            <span className="block w-20 text-right font-mono text-[12px] text-muted-foreground px-1 py-0.5">
              {formatCFCurrency(v, currency)}
            </span>
          )}
        </td>
      ))}
      <td />
      <td />
    </tr>
  );
}

// ─── Section Rows ───────────────────────────────────────────────────

interface SectionRowsProps {
  sectionId: CFSectionId;
  section: CFSection | undefined;
  meta: { label: string; subtotalLabel: string };
  totals: ReturnType<typeof computeCFTotals>;
  currency: SupportedCurrency;
  isFirst: boolean;
  onUpdateAmount: (sectionId: CFSectionId, itemId: string, monthIdx: number, value: number) => void;
  onUpdateName: (sectionId: CFSectionId, itemId: string, name: string) => void;
  onAddLineItem: (sectionId: CFSectionId) => void;
  onRemoveLineItem: (sectionId: CFSectionId, itemId: string) => void;
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
}: SectionRowsProps) {
  const lineItems = section?.lineItems ?? [];

  const subtotalArr =
    sectionId === 'operating'
      ? totals.operatingCF
      : sectionId === 'investing'
        ? totals.investingCF
        : totals.financingCF;
  const subtotalAnnual = subtotalArr.reduce((a, b) => a + b, 0);

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
            <input
              type="text"
              value={li.name}
              onChange={(e) => onUpdateName(sectionId, li.id, e.target.value)}
              placeholder="Line item name"
              className="w-full bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
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
            {formatCFCurrency(sumLineItemAnnual(li), currency)}
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
            {formatCFCurrency(v, currency)}
          </td>
        ))}
        <td className="text-right font-mono text-[12px] font-bold text-foreground py-1 px-2">
          {formatCFCurrency(subtotalAnnual, currency)}
        </td>
        <td />
      </tr>
    </>
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
      className="w-20 text-right font-mono text-[12px] text-foreground bg-transparent border border-transparent rounded px-1 py-0.5 outline-none hover:border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
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
    <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p
        className={cn(
          'text-[16px] font-bold mt-0.5',
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
