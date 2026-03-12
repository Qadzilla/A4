import { cn } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import { createDefaultDebtPlannerData, simulateDebtPaydown } from '../../lib/debt-planner-utils';
import type { Debt, DebtPlannerCardData, DebtStrategy } from '../../lib/debt-planner-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground transition-all font-sans focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

const selectClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:16px_16px] bg-[position:right_8px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] pr-8';

const numberInputSpinner =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

export const DebtPlannerCardView = memo(
  function DebtPlannerCardView({ item, workspaceId }: { item: CanvasItem; workspaceId: string }) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    // ── View config (persisted in item.data) ──
    const [viewConfig, setViewConfig] = useState<DebtPlannerCardData>(() => {
      const d = item.data as DebtPlannerCardData | undefined;
      return d?.currency
        ? { ...createDefaultDebtPlannerData(), ...d }
        : createDefaultDebtPlannerData();
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
      setViewConfig(
        d?.currency ? { ...createDefaultDebtPlannerData(), ...d } : createDefaultDebtPlannerData(),
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

    const updateConfig = (patch: Partial<DebtPlannerCardData>) => {
      dirtyRef.current = true;
      setViewConfig((prev) => ({ ...prev, ...patch }));
    };

    // ── tRPC queries ──
    const { data: dbDebts = [], isLoading } = useQuery(
      trpc.debt.list.queryOptions({ workspaceId }),
    );

    // ── tRPC mutations ──
    const debtQueryKey = trpc.debt.list.queryKey();
    const summaryQueryKey = trpc.debt.getSummary.queryKey();

    const invalidateDebts = () => {
      queryClient.invalidateQueries({ queryKey: debtQueryKey });
      queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    };

    const createDebt = useMutation(
      trpc.debt.create.mutationOptions({ onSuccess: invalidateDebts }),
    );
    const updateDebt = useMutation(
      trpc.debt.update.mutationOptions({ onSuccess: invalidateDebts }),
    );
    const deleteDebt = useMutation(
      trpc.debt.delete.mutationOptions({ onSuccess: invalidateDebts }),
    );

    // ── Debt mutations ──
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

      createDebt.mutate({
        workspaceId,
        name: newDebt.name.trim(),
        balance,
        annualInterestRate: rate,
        minimumPayment: minPayment,
      });
      setNewDebt({ name: '', balance: '', rate: '', minPayment: '' });
    };

    const removeDebt = (id: string) => {
      deleteDebt.mutate({ id });
    };

    const handleDebtBlur = (id: string, field: string, value: string | number) => {
      const existing = dbDebts.find((d) => d.id === id);
      if (!existing) return;
      const current = existing[field as keyof typeof existing];
      if (current === value) return;
      updateDebt.mutate({ id, data: { [field]: value } });
    };

    // ── Computed ──
    const debts: Debt[] = useMemo(
      () =>
        dbDebts.map((d) => ({
          id: d.id,
          name: d.name,
          balance: d.balance,
          annualInterestRate: d.annualInterestRate,
          minimumPayment: d.minimumPayment,
        })),
      [dbDebts],
    );

    const result = useMemo(() => simulateDebtPaydown(viewConfig, debts), [viewConfig, debts]);

    const totalDebt = debts.reduce((s, d) => s + d.balance, 0);

    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2 text-center">
            <div className="h-6 w-32 rounded bg-muted/40 animate-pulse mx-auto" />
            <p className="text-[12px] text-muted-foreground">Loading debts...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-4 sm:px-8">
        <div className="w-full max-w-3xl space-y-8 bg-card border border-border/60 shadow-sm rounded-xl p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                <path d="M12 2v20" />
                <path d="m7 7 5-5 5 5" />
                <path d="m7 17 5 5 5-5" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground tracking-tight">{item.name}</h2>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Debt Paydown Planner</p>
            </div>
            {saveStatus !== 'idle' && (
              <span className="text-[11px] text-muted-foreground">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>

          {/* Settings 2x2 grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            {/* Start date */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Start Date
              </label>
              <input
                type="month"
                value={viewConfig.startDate}
                onChange={(e) => updateConfig({ startDate: e.target.value })}
                className={inputClass}
              />
            </div>

            {/* Strategy toggle */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Strategy
              </label>
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => updateConfig({ strategy: 'avalanche' })}
                  className={cn(
                    'flex-1 px-3 py-1.5 text-[12px] font-medium transition-colors',
                    viewConfig.strategy === 'avalanche'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  Avalanche
                </button>
                <button
                  type="button"
                  onClick={() => updateConfig({ strategy: 'snowball' })}
                  className={cn(
                    'flex-1 px-3 py-1.5 text-[12px] font-medium transition-colors',
                    viewConfig.strategy === 'snowball'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  Snowball
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {viewConfig.strategy === 'avalanche'
                  ? 'Highest interest rate first — minimizes total interest'
                  : 'Smallest balance first — quicker wins for motivation'}
              </p>
            </div>

            {/* Extra monthly budget */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Extra Monthly Budget
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={viewConfig.extraMonthlyBudget}
                onChange={(e) =>
                  updateConfig({ extraMonthlyBudget: Math.max(0, Number(e.target.value) || 0) })
                }
                className={cn(inputClass, 'font-mono tabular-nums', numberInputSpinner)}
              />
              <p className="text-[10px] text-muted-foreground">On top of minimum payments</p>
            </div>
          </div>

          {/* Add debt form */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Add Debt
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Name</label>
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
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Balance</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={newDebt.balance}
                  onChange={(e) => setNewDebt((p) => ({ ...p, balance: e.target.value }))}
                  placeholder="0.00"
                  className={cn(inputClass, 'sm:w-[110px] font-mono tabular-nums', numberInputSpinner)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addDebt();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Rate %</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={newDebt.rate}
                  onChange={(e) => setNewDebt((p) => ({ ...p, rate: e.target.value }))}
                  placeholder="0.0"
                  className={cn(inputClass, 'sm:w-[80px] font-mono tabular-nums', numberInputSpinner)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addDebt();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Min Payment</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={newDebt.minPayment}
                  onChange={(e) => setNewDebt((p) => ({ ...p, minPayment: e.target.value }))}
                  placeholder="0"
                  className={cn(inputClass, 'sm:w-[100px] font-mono tabular-nums', numberInputSpinner)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addDebt();
                  }}
                />
              </div>
              <button
                type="button"
                onClick={addDebt}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Debt list table */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Debts ({debts.length})
            </p>
            <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
              {debts.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No debts yet
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="hidden sm:grid grid-cols-[1fr_100px_70px_90px_80px_80px_32px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    <span>Name</span>
                    <span className="text-right">Balance</span>
                    <span className="text-right">Rate</span>
                    <span className="text-right">Min Pay</span>
                    <span className="text-right">Payoff</span>
                    <span className="text-right">Interest</span>
                    <span />
                  </div>
                  {debts.map((debt) => {
                    const dr = result.debtResults.find((r) => r.debtId === debt.id);
                    return (
                      <div
                        key={debt.id}
                        className="group grid grid-cols-1 sm:grid-cols-[1fr_100px_70px_90px_80px_80px_32px] gap-2 px-3 py-2 items-center border-t border-border/40 transition-colors hover:bg-muted/20"
                      >
                        <input
                          type="text"
                          defaultValue={debt.name}
                          onBlur={(e) => handleDebtBlur(debt.id, 'name', e.target.value)}
                          placeholder="Name"
                          className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-foreground placeholder:text-muted-foreground transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          defaultValue={debt.balance}
                          onBlur={(e) =>
                            handleDebtBlur(debt.id, 'balance', Number(e.target.value) || 0)
                          }
                          className={cn(
                            'rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-left sm:text-right text-red-600 dark:text-red-400 font-mono tabular-nums transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50',
                            numberInputSpinner,
                          )}
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          defaultValue={debt.annualInterestRate}
                          onBlur={(e) =>
                            handleDebtBlur(
                              debt.id,
                              'annualInterestRate',
                              Number(e.target.value) || 0,
                            )
                          }
                          className={cn(
                            'rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-left sm:text-right text-foreground font-mono tabular-nums transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50',
                            numberInputSpinner,
                          )}
                        />
                        <input
                          type="number"
                          min={0}
                          step={1}
                          defaultValue={debt.minimumPayment}
                          onBlur={(e) =>
                            handleDebtBlur(debt.id, 'minimumPayment', Number(e.target.value) || 0)
                          }
                          className={cn(
                            'rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-left sm:text-right text-foreground font-mono tabular-nums transition-all w-full focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/50',
                            numberInputSpinner,
                          )}
                        />
                        <span className="text-[12px] text-left sm:text-right text-muted-foreground font-mono tabular-nums py-1">
                          {dr && dr.payoffMonth > 0 ? `Mo ${dr.payoffMonth}` : '—'}
                        </span>
                        <span className="text-[12px] text-left sm:text-right text-red-600 dark:text-red-400 font-mono tabular-nums py-1">
                          {dr ? formatCurrency(dr.totalInterest, viewConfig.currency) : '—'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDebt(debt.id)}
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
                  })}
                </>
              )}
            </div>
          </div>

          {/* Payoff Schedule (collapsible) */}
          {debts.length > 0 && result.schedule.length > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowSchedule((p) => !p)}
                className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
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
                <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
                  <div className="max-h-[400px] overflow-auto">
                    <table className="w-full text-[12px]">
                      <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm">
                        <tr>
                          <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Month
                          </th>
                          <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Payment
                          </th>
                          <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Interest
                          </th>
                          <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Principal
                          </th>
                          <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Balance
                          </th>
                          <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Left
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.schedule.map((row) => (
                          <tr key={row.month} className="border-t border-border/40 transition-colors hover:bg-muted/20">
                            <td className="px-3 py-1.5 text-muted-foreground">{row.date}</td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums text-foreground">
                              {formatCurrency(row.totalPayment, viewConfig.currency)}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                              {formatCurrency(row.totalInterest, viewConfig.currency)}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums text-green-600 dark:text-green-400">
                              {formatCurrency(row.totalPrincipal, viewConfig.currency)}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums text-foreground">
                              {formatCurrency(row.totalBalance, viewConfig.currency)}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg border border-border/60 bg-muted/20 p-4">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Total Debt
              </p>
              <p className="text-[16px] font-semibold text-red-600 dark:text-red-400 font-mono tabular-nums mt-1">
                {formatCurrency(totalDebt, viewConfig.currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Debt-Free Date
              </p>
              <p className="text-[16px] font-semibold text-foreground font-mono tabular-nums mt-1">
                {debts.length > 0 ? result.debtFreeDate : '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Total Interest
              </p>
              <p className="text-[16px] font-semibold text-red-600 dark:text-red-400 font-mono tabular-nums mt-1">
                {formatCurrency(result.totalInterest, viewConfig.currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Interest Saved
              </p>
              <p className="text-[16px] font-semibold text-green-600 dark:text-green-400 font-mono tabular-nums mt-1">
                {formatCurrency(result.interestSaved, viewConfig.currency)}
              </p>
            </div>
          </div>

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
        </div>
      </div>
    );
  },
  (prev, next) => prev.item.id === next.item.id && prev.workspaceId === next.workspaceId,
);
