import { memo } from 'react';
import { formatCurrency } from '../../lib/currency-utils';
import { computeSubscriptionTotals } from '../../lib/subscription-utils';
import type { SubscriptionCardData } from '../../lib/subscription-utils';
import type { CanvasItem } from '../../stores/canvas-store';

export const SubscriptionCardContent = memo(function SubscriptionCardContent({
  item,
}: { item: CanvasItem }) {
  const data = item.data as SubscriptionCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const subscriptions = data?.subscriptions ?? [];
  const categories = data?.categories ?? [];

  const { monthlyCost, annualCost, byStatus } = computeSubscriptionTotals(subscriptions);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Subscriptions
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {byStatus.active} active
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1">
        <p className="text-[10px] text-muted-foreground">Monthly Cost</p>
        <p className="text-[20px] font-bold leading-tight text-green-600 dark:text-green-400">
          {formatCurrency(monthlyCost, currency)}/mo
        </p>
        <p className="text-[13px] text-muted-foreground tabular-nums">
          {formatCurrency(annualCost, currency)}/yr
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          {subscriptions.length} subscription{subscriptions.length === 1 ? '' : 's'}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
        </span>
      </div>
    </div>
  );
});
