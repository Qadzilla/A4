import { cn } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import {
  type Account,
  type AccountType,
  computeAccountTotals,
  getNetWorthHealthColor,
  isLiability,
} from '../../lib/account-utils';
import type { AccountCardData } from '../../lib/account-utils';
import { formatCurrency } from '../../lib/currency-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

const TYPE_LABELS: Record<AccountType, string> = {
  checking: 'CHK',
  savings: 'SAV',
  'credit-card': 'CC',
  brokerage: 'BRK',
  retirement: 'RET',
  loan: 'LOAN',
  mortgage: 'MTG',
  crypto: 'CRY',
  other: 'OTH',
};

export const AccountCardContent = memo(function AccountCardContent({ item }: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const data = item.data as AccountCardData | undefined;
  const currency = data?.currency ?? 'USD';

  const { data: accounts, isLoading } = useQuery({
    ...trpc.account.list.queryOptions({ workspaceId: workspaceId ?? '' }),
    staleTime: 60_000,
    enabled: !!workspaceId,
  });

  const accountList = (accounts ?? []) as Account[];
  const count = accountList.length;
  const sorted = [...accountList].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  const topAccounts = sorted.slice(0, 3);
  const totals = computeAccountTotals(accountList);
  const total = totals.totalAssets + totals.totalLiabilities;
  const assetPct = total > 0 ? (totals.totalAssets / total) * 100 : 50;
  const healthColor = getNetWorthHealthColor(totals.netWorth);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/20 px-3 py-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Accounts
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {isLoading ? '...' : `${count} account${count === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col px-3 py-2 gap-1.5">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-muted/40 animate-pulse" />
            <div className="h-2 w-full rounded bg-muted/40 animate-pulse mt-1" />
          </div>
        ) : count === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-2">No accounts added</p>
        ) : (
          <>
            {/* Top 3 accounts */}
            <div className="flex flex-col gap-1">
              {topAccounts.map((acc) => {
                const liability = isLiability(acc.type as AccountType);
                return (
                  <div key={acc.id} className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] text-foreground truncate flex-1 min-w-0">
                      {acc.name}
                    </span>
                    <span className="text-[8px] uppercase px-1 py-0.5 rounded bg-muted/40 text-muted-foreground shrink-0">
                      {TYPE_LABELS[acc.type as AccountType] ?? 'OTH'}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-mono tabular-nums shrink-0',
                        liability
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-green-600 dark:text-green-400',
                      )}
                    >
                      {formatCurrency(acc.balance, currency)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Asset/liability bar + net worth */}
            <div className="mt-auto pt-1">
              <div className="h-2 w-full rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-green-500 dark:bg-green-400 transition-all"
                  style={{ width: `${assetPct}%` }}
                />
                <div
                  className="h-full bg-red-500 dark:bg-red-400 transition-all"
                  style={{ width: `${100 - assetPct}%` }}
                />
              </div>
              <p
                className={cn(
                  'text-[11px] font-semibold font-mono tabular-nums mt-1',
                  healthColor === 'green'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                Net: {formatCurrency(totals.netWorth, currency)}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
