import { cn } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACCOUNT_GROUP_COLORS,
  ACCOUNT_TYPES,
  computeAccountTotals,
  getNetWorthHealthColor,
  isLiability,
} from '../../lib/account-utils';
import type { Account, AccountCardData, AccountType } from '../../lib/account-utils';
import { SUPPORTED_CURRENCIES, formatCurrency } from '../../lib/currency-utils';
import type { SupportedCurrency } from '../../lib/currency-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const inputClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground transition-all font-sans focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50';

const selectClass =
  'w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:16px_16px] bg-[position:right_8px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] pr-8';

const inlineSelectClass =
  'rounded-md border border-border bg-muted/20 px-1.5 py-1 pr-6 text-[12px] text-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 appearance-none bg-[length:12px_12px] bg-[position:right_4px_center] bg-no-repeat bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")] cursor-pointer';

const numberInputSpinner =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function defaultData(): AccountCardData {
  return { currency: 'USD', notes: '' };
}

export const AccountCardView = memo(
  function AccountCardView({ item, workspaceId }: { item: CanvasItem; workspaceId: string }) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const updateItemData = useCanvasStore((s) => s.updateItemData);

    // ── View config (persisted in item.data) ──
    const [viewConfig, setViewConfig] = useState<AccountCardData>(() => {
      const d = item.data as AccountCardData | undefined;
      return d?.currency ? { ...defaultData(), ...d } : defaultData();
    });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const dirtyRef = useRef(false);

    // Filter state (view-only, not persisted)
    const [typeFilter, setTypeFilter] = useState<'all' | AccountType>('all');
    const [groupFilter, setGroupFilter] = useState<string>('all');

    // New account form state
    const [newAcc, setNewAcc] = useState({
      name: '',
      institution: '',
      type: 'checking' as AccountType,
      balance: '',
      groupId: '',
    });

    // Re-load view config when switching items
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item.id only
    useEffect(() => {
      const d = item.data as AccountCardData | undefined;
      setViewConfig(d?.currency ? { ...defaultData(), ...d } : defaultData());
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

    const updateViewConfig = (patch: Partial<AccountCardData>) => {
      dirtyRef.current = true;
      setViewConfig((prev) => ({ ...prev, ...patch }));
    };

    // ── tRPC queries ──
    const { data: accounts = [], isLoading: accLoading } = useQuery(
      trpc.account.list.queryOptions({ workspaceId }),
    );
    const { data: groups = [], isLoading: grpLoading } = useQuery(
      trpc.account.listGroups.queryOptions({ workspaceId }),
    );

    const isLoading = accLoading || grpLoading;

    // ── tRPC mutations ──
    const accQueryKey = trpc.account.list.queryKey();
    const summaryQueryKey = trpc.account.getSummary.queryKey();
    const grpQueryKey = trpc.account.listGroups.queryKey();

    const invalidateAccounts = () => {
      queryClient.invalidateQueries({ queryKey: accQueryKey });
      queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    };

    const createAcc = useMutation(
      trpc.account.create.mutationOptions({ onSuccess: invalidateAccounts }),
    );
    const updateAcc = useMutation(
      trpc.account.update.mutationOptions({ onSuccess: invalidateAccounts }),
    );
    const deleteAcc = useMutation(
      trpc.account.delete.mutationOptions({ onSuccess: invalidateAccounts }),
    );
    const createGrp = useMutation(
      trpc.account.createGroup.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries({ queryKey: grpQueryKey }),
      }),
    );
    const updateGrp = useMutation(
      trpc.account.updateGroup.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries({ queryKey: grpQueryKey }),
      }),
    );
    const deleteGrp = useMutation(
      trpc.account.deleteGroup.mutationOptions({
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: grpQueryKey });
          queryClient.invalidateQueries({ queryKey: accQueryKey });
        },
      }),
    );

    // ── Account mutations ──
    const addAccount = () => {
      const balance = Number(newAcc.balance);
      if (!newAcc.name.trim() || Number.isNaN(balance) || balance < 0) return;
      createAcc.mutate({
        workspaceId,
        name: newAcc.name.trim(),
        institution: newAcc.institution.trim(),
        type: newAcc.type,
        balance,
        groupId: newAcc.groupId || undefined,
      });
      setNewAcc({ name: '', institution: '', type: 'checking', balance: '', groupId: '' });
    };

    const removeAccount = (id: string) => {
      deleteAcc.mutate({ id });
    };

    const handleAccountBlur = (id: string, field: string, value: string | number) => {
      const existing = accounts.find((a) => a.id === id);
      if (!existing) return;
      const current = existing[field as keyof typeof existing];
      if (current === value) return;
      updateAcc.mutate({ id, data: { [field]: value } });
    };

    // ── Group mutations ──
    const addGroup = () => {
      const usedColors = new Set(groups.map((g) => g.color));
      const nextColor =
        ACCOUNT_GROUP_COLORS.find((c) => !usedColors.has(c)) ??
        ACCOUNT_GROUP_COLORS[0] ??
        '#3b82f6';
      createGrp.mutate({ workspaceId, name: 'Unnamed', color: nextColor });
    };

    const removeGroup = (id: string) => {
      deleteGrp.mutate({ id });
    };

    const handleGroupColorChange = (id: string, color: string) => {
      updateGrp.mutate({ id, data: { color } });
    };

    const handleGroupNameBlur = (id: string, name: string) => {
      const existing = groups.find((g) => g.id === id);
      if (!existing || existing.name === name) return;
      updateGrp.mutate({ id, data: { name: name.trim() || 'Unnamed' } });
    };

    // ── Computed values ──
    const mappedAccounts: Account[] = useMemo(
      () =>
        accounts.map((a) => ({
          id: a.id,
          name: a.name,
          institution: a.institution,
          type: a.type as AccountType,
          balance: Number(a.balance),
          groupId: a.groupId ?? undefined,
          lastUpdated: a.lastUpdated ?? new Date().toISOString().slice(0, 10),
          notes: a.notes ?? null,
        })),
      [accounts],
    );

    const { totalAssets, totalLiabilities, netWorth } = computeAccountTotals(mappedAccounts);
    const healthColor = getNetWorthHealthColor(netWorth);

    // Unique types present in data (for filter pills)
    const presentTypes = useMemo(() => {
      const types = new Set(mappedAccounts.map((a) => a.type));
      return ACCOUNT_TYPES.filter((t) => types.has(t.value));
    }, [mappedAccounts]);

    // Display accounts: assets first (desc), then liabilities (desc), filtered
    const displayAccounts = useMemo(() => {
      let filtered = [...mappedAccounts];
      if (typeFilter !== 'all') {
        filtered = filtered.filter((a) => a.type === typeFilter);
      }
      if (groupFilter !== 'all') {
        filtered = filtered.filter((a) => (a.groupId ?? '') === groupFilter);
      }
      filtered.sort((a, b) => {
        const aIsLiab = isLiability(a.type) ? 1 : 0;
        const bIsLiab = isLiability(b.type) ? 1 : 0;
        if (aIsLiab !== bIsLiab) return aIsLiab - bIsLiab;
        return b.balance - a.balance;
      });
      return filtered;
    }, [mappedAccounts, typeFilter, groupFilter]);

    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2 text-center">
            <div className="h-6 w-32 rounded bg-muted/40 animate-pulse mx-auto" />
            <p className="text-[12px] text-muted-foreground">Loading accounts...</p>
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
                <line x1="3" y1="22" x2="21" y2="22" />
                <line x1="6" y1="18" x2="6" y2="11" />
                <line x1="10" y1="18" x2="10" y2="11" />
                <line x1="14" y1="18" x2="14" y2="11" />
                <line x1="18" y1="18" x2="18" y2="11" />
                <polygon points="12 2 20 7 4 7" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground tracking-tight">{item.name}</h2>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Accounts</p>
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
              onChange={(e) => updateViewConfig({ currency: e.target.value as SupportedCurrency })}
              className={cn(selectClass, 'w-[200px]')}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.symbol} {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Groups management */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Groups
              </p>
              <button
                type="button"
                onClick={addGroup}
                className="flex items-center gap-1 text-[12px] text-primary/80 hover:text-primary font-medium transition-colors"
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
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add
              </button>
            </div>

            {groups.length > 0 && (
              <div className="space-y-2">
                {groups.map((group) => (
                  <div key={group.id} className="group flex items-center gap-2">
                    <div className="flex gap-1">
                      {ACCOUNT_GROUP_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => handleGroupColorChange(group.id, color)}
                          className={cn(
                            'size-5 rounded-full border-2 transition-all',
                            group.color === color
                              ? 'ring-2 ring-primary/20 shadow-sm scale-110'
                              : 'border-transparent hover:border-muted-foreground/40',
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <input
                      type="text"
                      defaultValue={group.name}
                      onBlur={(e) => handleGroupNameBlur(group.id, e.target.value)}
                      placeholder="Group name"
                      className="flex-1 rounded-md border border-border bg-muted/20 px-2 py-1 text-[13px] text-foreground placeholder:text-muted-foreground transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                    />
                    <button
                      type="button"
                      onClick={() => removeGroup(group.id)}
                      className="flex items-center justify-center size-6 rounded-md text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
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
              </div>
            )}
          </div>

          {/* Add account form */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Add Account
            </p>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[120px] space-y-1">
                <label className="text-[11px] text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={newAcc.name}
                  onChange={(e) => setNewAcc((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Chase Checking"
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addAccount();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Institution</label>
                <input
                  type="text"
                  value={newAcc.institution}
                  onChange={(e) => setNewAcc((p) => ({ ...p, institution: e.target.value }))}
                  placeholder="e.g. Chase Bank"
                  className={cn(inputClass, 'w-[130px]')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addAccount();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Type</label>
                <select
                  value={newAcc.type}
                  onChange={(e) =>
                    setNewAcc((p) => ({ ...p, type: e.target.value as AccountType }))
                  }
                  className={cn(selectClass, 'w-[110px]')}
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Balance</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={newAcc.balance}
                  onChange={(e) => setNewAcc((p) => ({ ...p, balance: e.target.value }))}
                  placeholder="0.00"
                  className={cn(inputClass, 'w-[100px] font-mono', numberInputSpinner)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addAccount();
                  }}
                />
              </div>
              {groups.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Group</label>
                  <select
                    value={newAcc.groupId}
                    onChange={(e) => setNewAcc((p) => ({ ...p, groupId: e.target.value }))}
                    className={cn(selectClass, 'w-[120px]')}
                  >
                    <option value="">None</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name || 'Unnamed'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                onClick={addAccount}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm active:scale-[0.98]"
              >
                Add
              </button>
            </div>
          </div>

          {/* Filter bar */}
          {mappedAccounts.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setTypeFilter('all')}
                  className={cn(
                    'px-3 py-1 text-[12px] font-medium transition-colors',
                    typeFilter === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  All
                </button>
                {presentTypes.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTypeFilter(t.value)}
                    className={cn(
                      'px-3 py-1 text-[12px] font-medium transition-colors',
                      typeFilter === t.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/20 text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {groups.length > 0 && (
                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className={cn(selectClass, 'w-auto')}
                >
                  <option value="all">All groups</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name || 'Unnamed'}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Account list */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Accounts ({displayAccounts.length})
            </p>
            <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
              {/* Header row */}
              <div className="hidden sm:grid grid-cols-[1fr_120px_90px_100px_90px_90px_32px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Name</span>
                <span>Institution</span>
                <span>Type</span>
                <span className="text-right">Balance</span>
                <span>Group</span>
                <span>Updated</span>
                <span />
              </div>

              {displayAccounts.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No accounts
                  {typeFilter !== 'all' || groupFilter !== 'all' ? ' match filter' : ' yet'}
                </div>
              ) : (
                displayAccounts.map((acc) => {
                  const group = groups.find((g) => g.id === acc.groupId);
                  const liability = isLiability(acc.type);
                  return (
                    <div
                      key={acc.id}
                      className="group grid grid-cols-1 sm:grid-cols-[1fr_120px_90px_100px_90px_90px_32px] gap-2 px-3 py-2 border-t border-border/40 items-center transition-colors hover:bg-muted/20"
                    >
                      <input
                        type="text"
                        defaultValue={acc.name}
                        onBlur={(e) => handleAccountBlur(acc.id, 'name', e.target.value)}
                        placeholder="Name"
                        className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-foreground placeholder:text-muted-foreground transition-all w-full focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                      />
                      <input
                        type="text"
                        defaultValue={acc.institution}
                        onBlur={(e) => handleAccountBlur(acc.id, 'institution', e.target.value)}
                        placeholder="Institution"
                        className="rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[12px] text-foreground placeholder:text-muted-foreground transition-all w-full focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                      />
                      <select
                        defaultValue={acc.type}
                        onChange={(e) => handleAccountBlur(acc.id, 'type', e.target.value)}
                        className={inlineSelectClass}
                      >
                        {ACCOUNT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        defaultValue={acc.balance}
                        onBlur={(e) =>
                          handleAccountBlur(acc.id, 'balance', Number(e.target.value) || 0)
                        }
                        className={cn(
                          'rounded-md border border-border bg-muted/20 px-1.5 py-1 text-[13px] text-left sm:text-right focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 font-mono tabular-nums transition-all w-full',
                          numberInputSpinner,
                          liability
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-green-600 dark:text-green-400',
                        )}
                      />
                      <div className="flex items-center gap-1.5 min-w-0">
                        {group ? (
                          <>
                            <span
                              className="size-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: group.color }}
                            />
                            <span className="text-[11px] text-muted-foreground truncate">
                              {group.name || 'Unnamed'}
                            </span>
                          </>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/50">&mdash;</span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">{acc.lastUpdated}</span>
                      <button
                        type="button"
                        onClick={() => removeAccount(acc.id)}
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

          {/* Summary footer */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg border border-border/60 bg-background p-4">
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Total Assets
              </p>
              <p className="text-[16px] font-semibold text-green-600 dark:text-green-400 font-mono tabular-nums">
                {formatCurrency(totalAssets, viewConfig.currency)}
              </p>
            </div>
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Total Liabilities
              </p>
              <p className="text-[16px] font-semibold text-red-600 dark:text-red-400 font-mono tabular-nums">
                {formatCurrency(totalLiabilities, viewConfig.currency)}
              </p>
            </div>
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Net Worth</p>
              <p
                className={cn(
                  'text-[16px] font-semibold font-mono tabular-nums',
                  healthColor === 'green'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {formatCurrency(netWorth, viewConfig.currency)}
              </p>
            </div>
            <div className="px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Accounts</p>
              <p className="text-[16px] font-semibold text-foreground font-mono tabular-nums">
                {mappedAccounts.length}
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
              onChange={(e) => updateViewConfig({ notes: e.target.value })}
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
