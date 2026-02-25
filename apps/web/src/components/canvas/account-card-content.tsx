import { cn } from '@a4/ui';
import { memo } from 'react';
import { computeAccountTotals, getNetWorthHealthColor } from '../../lib/account-utils';
import type { AccountCardData } from '../../lib/account-utils';
import { formatCurrency } from '../../lib/currency-utils';
import type { CanvasItem } from '../../stores/canvas-store';

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const AccountCardContent = memo(function AccountCardContent({ item }: { item: CanvasItem }) {
  const data = item.data as AccountCardData | undefined;

  const currency = data?.currency ?? 'USD';
  const accounts = data?.accounts ?? [];
  const groups = data?.groups ?? [];

  const { totalAssets, totalLiabilities, netWorth } = computeAccountTotals(accounts);
  const healthColor = getNetWorthHealthColor(netWorth);

  const uniqueTypes = new Set(accounts.map((a) => a.type)).size;

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Accounts
        </span>
        <span className="text-[10px] text-muted-foreground truncate ml-2">
          {accounts.length} account{accounts.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-1">
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
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          {uniqueTypes} type{uniqueTypes === 1 ? '' : 's'}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {groups.length} group{groups.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
});
