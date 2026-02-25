import { cn } from '@a4/ui';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import { simulateDebtPaydown } from '../../lib/debt-planner-utils';
import type { Debt, DebtPlannerCardData, DebtStrategy } from '../../lib/debt-planner-utils';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

function defaultData(): DebtPlannerCardData {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return {
    currency: 'USD',
    strategy: 'avalanche',
    extraMonthlyBudget: 0,
    startDate: `${now.getFullYear()}-${month}`,
    debts: [],
    notes: '',
  };
}

export const DebtPlannerCardView = memo(
  function DebtPlannerCardView({ item }: { item: CanvasItem }) {
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    const [data, setData] = useState<DebtPlannerCardData>(() => {
      const d = item.data as DebtPlannerCardData | undefined;
      return d?.currency ? { ...defaultData(), ...d } : defaultData();
    });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    // New debt form
    const [newDebt, setNewDebt] = useState({ name: '', balance: '', rate: '', minPayment: '' });

    // Schedule toggle
    const [showSchedule, setShowSchedule] = useState(false);

    // Re-load when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as DebtPlannerCardData | undefined;
      setData(d?.currency ? { ...defaultData(), ...d } : defaultData());
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

    const update = (patch: Partial<DebtPlannerCardData>) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, ...patch }));
    };

    // Debt mutations
    const addDebt = () => {
      const balance = Number(newDebt.balance);
      const rate = Number(newDebt.rate);
      const minPayment = Number(newDebt.minPayment);
      if (
        !newDebt.name.trim() ||
        Number.isNaN(balance) ||
        balance <= 0 ||
        Number.isNaN(rate) ||
        rate < 0 ||
        Number.isNaN(minPayment) ||
        minPayment <= 0
      )
        return;
      const debt: Debt = {
        id: crypto.randomUUID(),
        name: newDebt.name.trim(),
        balance,
        annualInterestRate: rate,
        minimumPayment: minPayment,
      };
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, debts: [...prev.debts, debt] }));
      setNewDebt({ name: '', balance: '', rate: '', minPayment: '' });
    };

    const removeDebt = (id: string) => {
      dirtyRef.current = true;
      setData((prev) => ({ ...prev, debts: prev.debts.filter((d) => d.id !== id) }));
    };

    const updateDebt = (id: string, patch: Partial<Debt>) => {
      dirtyRef.current = true;
      setData((prev) => ({
        ...prev,
        debts: prev.debts.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      }));
    };

    // Computed
    const result = useMemo(() => simulateDebtPaydown(data), [data]);

    const totalDebt = data.debts.reduce((s, d) => s + d.balance, 0);

    return (
      <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-8">
        <div className="w-full max-w-3xl space-y-6">
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
                <path d="M12 2v20" />
                <path d="m7 7 5-5 5 5" />
                <path d="m7 17 5 5 5-5" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-black dark:text-zinc-100">{item.name}</h2>
              <p className="text-[11px] text-black/60 dark:text-zinc-300">Debt Paydown Planner</p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-black/60 dark:text-zinc-300">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Settings 2×2 grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Currency */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Currency
              </label>
              <select
                value={data.currency}
                onChange={(e) => update({ currency: e.target.value as SupportedCurrency })}
                className={inputClass}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.symbol} {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Start date */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Start Date
              </label>
              <input
                type="month"
                value={data.startDate}
                onChange={(e) => update({ startDate: e.target.value })}
                className={inputClass}
              />
            </div>

            {/* Strategy toggle */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Strategy
              </label>
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => update({ strategy: 'avalanche' })}
                  className={cn(
                    'flex-1 px-3 py-1.5 text-[12px] font-medium transition-colors',
                    data.strategy === 'avalanche'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  Avalanche
                </button>
                <button
                  type="button"
                  onClick={() => update({ strategy: 'snowball' })}
                  className={cn(
                    'flex-1 px-3 py-1.5 text-[12px] font-medium transition-colors',
                    data.strategy === 'snowball'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  Snowball
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {data.strategy === 'avalanche'
                  ? 'Highest interest rate first — minimizes total interest'
                  : 'Smallest balance first — quicker wins for motivation'}
              </p>
            </div>

            {/* Extra monthly budget */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-black/70 dark:text-zinc-200">
                Extra Monthly Budget
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={data.extraMonthlyBudget}
                onChange={(e) =>
                  update({ extraMonthlyBudget: Math.max(0, Number(e.target.value) || 0) })
                }
                className={inputClass}
              />
              <p className="text-[10px] text-muted-foreground">On top of minimum payments</p>
            </div>
          </div>

          {/* Add debt form */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
              Add Debt
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={newDebt.name}
                  onChange={(e) => setNewDebt((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Chase Visa"
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addDebt();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Balance</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={newDebt.balance}
                  onChange={(e) => setNewDebt((p) => ({ ...p, balance: e.target.value }))}
                  placeholder="0.00"
                  className={cn(inputClass, 'w-[110px]')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addDebt();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Rate %</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={newDebt.rate}
                  onChange={(e) => setNewDebt((p) => ({ ...p, rate: e.target.value }))}
                  placeholder="0.0"
                  className={cn(inputClass, 'w-[80px]')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addDebt();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Min Payment</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={newDebt.minPayment}
                  onChange={(e) => setNewDebt((p) => ({ ...p, minPayment: e.target.value }))}
                  placeholder="0"
                  className={cn(inputClass, 'w-[100px]')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addDebt();
                  }}
                />
              </div>
              <button
                type="button"
                onClick={addDebt}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Debt list table */}
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400">
              Debts ({data.debts.length})
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              {data.debts.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No debts yet
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_100px_70px_90px_80px_80px_32px] gap-2 px-3 py-1.5 bg-muted/30 border-b border-border/40">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                      Name
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">
                      Balance
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">
                      Rate
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">
                      Min Pay
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">
                      Payoff
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">
                      Interest
                    </span>
                    <span />
                  </div>
                  {data.debts.map((debt) => {
                    const dr = result.debtResults.find((r) => r.debtId === debt.id);
                    return (
                      <div
                        key={debt.id}
                        className="grid grid-cols-[1fr_100px_70px_90px_80px_80px_32px] gap-2 px-3 py-1 items-center border-b border-border/20 last:border-b-0"
                      >
                        <input
                          type="text"
                          value={debt.name}
                          onChange={(e) => updateDebt(debt.id, { name: e.target.value })}
                          className="border-0 bg-transparent text-[13px] text-black dark:text-zinc-100 focus:outline-none"
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={debt.balance}
                          onChange={(e) =>
                            updateDebt(debt.id, { balance: Number(e.target.value) || 0 })
                          }
                          className="border-0 bg-transparent text-[13px] text-right text-red-600 dark:text-red-400 focus:outline-none tabular-nums w-full"
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={debt.annualInterestRate}
                          onChange={(e) =>
                            updateDebt(debt.id, {
                              annualInterestRate: Number(e.target.value) || 0,
                            })
                          }
                          className="border-0 bg-transparent text-[13px] text-right text-black dark:text-zinc-100 focus:outline-none tabular-nums w-full"
                        />
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={debt.minimumPayment}
                          onChange={(e) =>
                            updateDebt(debt.id, {
                              minimumPayment: Number(e.target.value) || 0,
                            })
                          }
                          className="border-0 bg-transparent text-[13px] text-right text-black dark:text-zinc-100 focus:outline-none tabular-nums w-full"
                        />
                        <span className="text-[12px] text-right text-muted-foreground tabular-nums">
                          {dr && dr.payoffMonth > 0 ? `Mo ${dr.payoffMonth}` : '—'}
                        </span>
                        <span className="text-[12px] text-right text-red-600 dark:text-red-400 tabular-nums">
                          {dr ? formatCurrency(dr.totalInterest, data.currency) : '—'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDebt(debt.id)}
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
                  })}
                </>
              )}
            </div>
          </div>

          {/* Payoff Schedule (collapsible) */}
          {data.debts.length > 0 && result.schedule.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowSchedule((p) => !p)}
                className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-black/50 dark:text-zinc-400 hover:text-foreground transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn('size-3.5 transition-transform', showSchedule && 'rotate-90')}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Payoff Schedule ({result.totalMonths} months)
              </button>

              {showSchedule && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="max-h-[400px] overflow-auto">
                    <table className="w-full text-[12px]">
                      <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm">
                        <tr className="border-b border-border/40">
                          <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase">
                            Month
                          </th>
                          <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-muted-foreground uppercase">
                            Payment
                          </th>
                          <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-muted-foreground uppercase">
                            Interest
                          </th>
                          <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-muted-foreground uppercase">
                            Principal
                          </th>
                          <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-muted-foreground uppercase">
                            Balance
                          </th>
                          <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-muted-foreground uppercase">
                            Left
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.schedule.map((row) => (
                          <tr key={row.month} className="border-b border-border/10 last:border-b-0">
                            <td className="px-3 py-1 text-muted-foreground">{row.date}</td>
                            <td className="px-3 py-1 text-right tabular-nums">
                              {formatCurrency(row.totalPayment, data.currency)}
                            </td>
                            <td className="px-3 py-1 text-right tabular-nums text-red-600 dark:text-red-400">
                              {formatCurrency(row.totalInterest, data.currency)}
                            </td>
                            <td className="px-3 py-1 text-right tabular-nums text-green-600 dark:text-green-400">
                              {formatCurrency(row.totalPrincipal, data.currency)}
                            </td>
                            <td className="px-3 py-1 text-right tabular-nums">
                              {formatCurrency(row.totalBalance, data.currency)}
                            </td>
                            <td className="px-3 py-1 text-right tabular-nums text-muted-foreground">
                              {row.debtsRemaining}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Summary footer */}
          <div className="grid grid-cols-4 gap-4 rounded-lg border border-border bg-muted/20 p-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Total Debt
              </p>
              <p className="text-[16px] font-bold text-red-600 dark:text-red-400 tabular-nums">
                {formatCurrency(totalDebt, data.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Debt-Free Date
              </p>
              <p className="text-[16px] font-bold text-foreground tabular-nums">
                {data.debts.length > 0 ? result.debtFreeDate : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Total Interest
              </p>
              <p className="text-[16px] font-bold text-red-600 dark:text-red-400 tabular-nums">
                {formatCurrency(result.totalInterest, data.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Interest Saved
              </p>
              <p className="text-[16px] font-bold text-green-600 dark:text-green-400 tabular-nums">
                {formatCurrency(result.interestSaved, data.currency)}
              </p>
            </div>
          </div>

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
        </div>
      </div>
    );
  },
  (prev, next) => prev.item.id === next.item.id,
);
