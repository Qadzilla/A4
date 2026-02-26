import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import { formatCurrency } from '../../lib/currency-utils';
import type { SubscriptionCardData } from '../../lib/subscription-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

export const SubscriptionCardContent = memo(function SubscriptionCardContent({
  item,
}: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const data = item.data as SubscriptionCardData | undefined;

  const currency = data?.currency ?? 'USD';

  const { data: summary, isLoading } = useQuery({
    ...trpc.subscription.getSummary.queryOptions({ workspaceId: workspaceId! }),
    staleTime: 60_000,
  });

  const monthlyCost = summary?.monthlyCost ?? 0;
  const annualCost = summary?.annualCost ?? 0;
  const count = summary?.count ?? 0;
  const byStatus = summary?.byStatus ?? { active: 0, paused: 0, cancelled: 0 };

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Subscriptions
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {isLoading ? '...' : `${byStatus.active} active`}
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
            <p className="text-[10px] text-muted-foreground">Monthly Cost</p>
            <p className="text-[20px] font-bold leading-tight text-green-600 dark:text-green-400">
              {formatCurrency(monthlyCost, currency)}/mo
            </p>
            <p className="text-[13px] text-muted-foreground tabular-nums">
              {formatCurrency(annualCost, currency)}/yr
            </p>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          {isLoading ? '...' : `${count} subscription${count === 1 ? '' : 's'}`}
        </span>
      </div>
    </div>
  );
});
