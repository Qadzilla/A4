import { cn } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import { formatCurrency } from '../../lib/currency-utils';
import { getLedgerHealthColor } from '../../lib/ledger-utils';
import type { LedgerCardData } from '../../lib/ledger-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

export const LedgerCardContent = memo(function LedgerCardContent({ item }: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const data = item.data as LedgerCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const startingBalance = data?.startingBalance ?? 0;

  const { data: summary, isLoading } = useQuery({
    ...trpc.financial.getSummary.queryOptions({ workspaceId: workspaceId! }),
    staleTime: 60_000,
  });

  const totalIncome = summary?.totalIncome ?? 0;
  const totalExpenses = summary?.totalExpenses ?? 0;
  const count = summary?.count ?? 0;
  const netBalance = startingBalance + (summary?.net ?? 0);
  const health = getLedgerHealthColor(netBalance);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Ledger
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {isLoading ? '...' : `${count} entr${count === 1 ? 'y' : 'ies'}`}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-2">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-muted/40 animate-pulse" />
            <div className="h-6 w-28 rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-24 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : (
          <>
            <div>
              <p className="text-[10px] text-muted-foreground">Net Balance</p>
              <p
                className={cn(
                  'text-[20px] font-bold leading-tight',
                  health === 'green'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
              >
                {formatCurrency(netBalance, currency)}
              </p>
            </div>

            {/* Income / Expense row */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-green-600 dark:text-green-400">
                +{formatCurrency(totalIncome, currency)}
              </span>
              <span className="text-[11px] text-red-600 dark:text-red-400">
                -{formatCurrency(totalExpenses, currency)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          {isLoading ? '...' : `${count} entr${count === 1 ? 'y' : 'ies'}`}
        </span>
        <span className="text-[10px] text-muted-foreground">
          Starting: {formatCurrency(startingBalance, currency)}
        </span>
      </div>
    </div>
  );
});
