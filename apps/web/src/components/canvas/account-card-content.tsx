import { cn } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import { getNetWorthHealthColor } from '../../lib/account-utils';
import type { AccountCardData } from '../../lib/account-utils';
import { formatCurrency } from '../../lib/currency-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const AccountCardContent = memo(function AccountCardContent({ item }: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const data = item.data as AccountCardData | undefined;

  const currency = data?.currency ?? 'USD';

  const { data: summary, isLoading } = useQuery({
    ...trpc.account.getSummary.queryOptions({ workspaceId: workspaceId ?? '' }),
    staleTime: 60_000,
    enabled: !!workspaceId,
  });

  const totalAssets = summary?.totalAssets ?? 0;
  const totalLiabilities = summary?.totalLiabilities ?? 0;
  const netWorth = summary?.netWorth ?? 0;
  const count = summary?.count ?? 0;
  const healthColor = getNetWorthHealthColor(netWorth);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Accounts
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {isLoading ? '...' : `${count} account${count === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-muted/40 animate-pulse" />
            <div className="h-6 w-28 rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-24 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : (
          <>
            <p className="text-[10px] text-muted-foreground">Net Worth</p>
            <p
              className={cn(
                'text-[20px] font-bold leading-tight',
                healthColor === 'green'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400',
              )}
            >
              {formatCurrency(netWorth, currency)}
            </p>
            <p className="text-[13px] text-muted-foreground tabular-nums">
              +${compactFormatter.format(totalAssets)} assets &minus;$
              {compactFormatter.format(totalLiabilities)} liab
            </p>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          {isLoading ? '...' : `${count} account${count === 1 ? '' : 's'}`}
        </span>
      </div>
    </div>
  );
});
