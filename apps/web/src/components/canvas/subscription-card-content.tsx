import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useParams } from 'react-router';
import { formatCurrency } from '../../lib/currency-utils';
import type { Subscription, SubscriptionCardData } from '../../lib/subscription-utils';
import {
  computeMonthlyAmount,
  computeSubscriptionTotals,
  getSubscriptionStatusColor,
} from '../../lib/subscription-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

const STATUS_DOT_COLORS: Record<ReturnType<typeof getSubscriptionStatusColor>, string> = {
  green: 'rgb(22 163 74)',
  amber: 'rgb(217 119 6)',
  red: 'rgb(220 38 38)',
};

export const SubscriptionCardContent = memo(function SubscriptionCardContent({
  item,
}: { item: CanvasItem }) {
  const { id: workspaceId } = useParams();
  const trpc = useTRPC();
  const data = item.data as SubscriptionCardData | undefined;
  const currency = data?.currency ?? 'USD';

  const { data: subscriptions, isLoading } = useQuery({
    ...trpc.subscription.list.queryOptions({ workspaceId: workspaceId ?? '' }),
    staleTime: 60_000,
    enabled: !!workspaceId,
  });

  const subList = (subscriptions ?? []) as Subscription[];
  const activeOnly = subList.filter((s) => s.status === 'active');
  const sorted = [...activeOnly].sort(
    (a, b) =>
      computeMonthlyAmount(b.amount, b.frequency) - computeMonthlyAmount(a.amount, a.frequency),
  );
  const topSubs = sorted.slice(0, 3);
  const totals = computeSubscriptionTotals(subList);
  const activeCount = activeOnly.length;

  return (
    <div className="flex h-full w-full flex-col bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/20 px-3 py-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Subscriptions
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {isLoading ? '...' : `${activeCount} active`}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col px-3 py-2 gap-1.5">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : activeCount === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-2">
            No active subscriptions
          </p>
        ) : (
          <>
            {/* Top 3 active subs by monthly cost */}
            <div className="flex flex-col gap-1">
              {topSubs.map((sub) => (
                <div key={sub.id} className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="size-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: STATUS_DOT_COLORS[getSubscriptionStatusColor(sub.status)],
                    }}
                  />
                  <span className="text-[10px] text-foreground truncate flex-1 min-w-0">
                    {sub.name || 'Untitled'}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-foreground shrink-0">
                    {formatCurrency(computeMonthlyAmount(sub.amount, sub.frequency), currency)}
                    <span className="text-muted-foreground">/mo</span>
                  </span>
                </div>
              ))}
            </div>

            {/* Bottom section */}
            <div className="mt-auto pt-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold font-mono tabular-nums text-foreground">
                {formatCurrency(totals.monthlyCost, currency)}/mo
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground">
                {formatCurrency(totals.annualCost, currency)}/yr
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
