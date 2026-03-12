import { cn } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import { formatCurrency } from '../../lib/currency-utils';
import type { LedgerCardData, LedgerEntry } from '../../lib/ledger-utils';
import { computeLedgerTotals, getLedgerHealthColor } from '../../lib/ledger-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

function formatShortDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const LedgerCardContent = memo(function LedgerCardContent({ item }: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const data = item.data as LedgerCardData | undefined;
  const currency = data?.currency ?? 'USD';
  const startingBalance = data?.startingBalance ?? 0;

  const { data: transactions, isLoading } = useQuery({
    ...trpc.financial.listTransactions.queryOptions({ workspaceId: workspaceId ?? '' }),
    staleTime: 60_000,
    enabled: !!workspaceId,
  });

  const entries = (transactions ?? []) as LedgerEntry[];
  const count = entries.length;
  const topEntries = entries.slice(0, 4);
  const totals = computeLedgerTotals(entries);
  const netBalance = startingBalance + totals.net;
  const healthColor = getLedgerHealthColor(netBalance);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/20 px-3 py-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Ledger
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {isLoading ? '...' : `${count} entr${count === 1 ? 'y' : 'ies'}`}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col px-3 py-2 gap-1">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
          </div>
        ) : count === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-2">No entries added</p>
        ) : (
          <>
            {/* Last 4 entries */}
            <div className="flex flex-col gap-0.5">
              {topEntries.map((entry) => (
                <div key={entry.id} className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[9px] text-muted-foreground shrink-0 w-[34px]">
                    {formatShortDate(entry.date)}
                  </span>
                  <span className="text-[10px] text-foreground truncate flex-1 min-w-0">
                    {entry.description || 'Untitled'}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-mono tabular-nums shrink-0',
                      entry.type === 'income'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400',
                    )}
                  >
                    {entry.type === 'income' ? '+' : '\u2212'}
                    {formatCurrency(entry.amount, currency)}
                  </span>
                </div>
              ))}
            </div>

            {/* Bottom section */}
            <div className="mt-auto pt-1 flex items-center justify-between">
              <span className="text-[10px] text-foreground">
                <span className="text-green-600 dark:text-green-400">
                  +{formatCurrency(totals.totalIncome, currency)}
                </span>
                {' / '}
                <span className="text-red-600 dark:text-red-400">
                  &minus;{formatCurrency(totals.totalExpenses, currency)}
                </span>
              </span>
              <span
                className={cn(
                  'text-[11px] font-semibold font-mono tabular-nums',
                  healthColor === 'green'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {formatCurrency(netBalance, currency)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
