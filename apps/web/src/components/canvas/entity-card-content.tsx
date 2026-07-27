import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';

export interface EntityCardData {
  entityId?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  merchant: 'MERCHANT',
  institution: 'INSTITUTION',
  person: 'PERSON',
  organization: 'ORG',
  account_ref: 'ACCOUNT',
};

const SOURCE_LABELS: Record<string, string> = {
  chunk: 'docs',
  transaction: 'txns',
  invoice: 'invoices',
  receipt: 'receipts',
  subscription: 'subs',
  account: 'accounts',
};

export const EntityCardContent = memo(function EntityCardContent({ item }: { item: CanvasItem }) {
  const trpc = useTRPC();
  const data = item.data as EntityCardData | undefined;
  const entityId = data?.entityId ?? null;

  const { data: entity, isLoading } = useQuery({
    ...trpc.entity.get.queryOptions({ id: entityId ?? '' }),
    staleTime: 60_000,
    enabled: !!entityId,
  });

  const { data: mentionInfo } = useQuery({
    ...trpc.entity.getMentions.queryOptions({ id: entityId ?? '', limit: 100 }),
    staleTime: 60_000,
    enabled: !!entityId,
  });

  return (
    <div className="flex h-full w-full flex-col bg-card shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/20 px-3 py-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Entity
        </span>
        {entity && (
          <span className="text-[8px] uppercase px-1 py-0.5 rounded bg-muted/40 text-muted-foreground shrink-0">
            {TYPE_LABELS[entity.type] ?? entity.type}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col px-3 py-2 gap-1 min-h-0">
        {!entityId ? (
          <p className="text-[11px] text-muted-foreground text-center my-auto">
            Open to pick an entity
          </p>
        ) : isLoading ? (
          <div className="space-y-2">
            <div className="h-5 w-3/4 rounded bg-muted/40 animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : !entity ? (
          <p className="text-[11px] text-muted-foreground text-center my-auto">Entity not found</p>
        ) : (
          <>
            <p className="text-[14px] font-semibold text-foreground truncate">
              {entity.canonicalName}
            </p>
            {entity.aliases.length > 0 && (
              <p className="text-[10px] text-muted-foreground truncate">
                aka {entity.aliases.slice(0, 2).join(', ')}
                {entity.aliases.length > 2 ? ` +${entity.aliases.length - 2}` : ''}
              </p>
            )}
            <div className="mt-auto flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-mono tabular-nums text-foreground">
                {entity.mentionCount} mention{entity.mentionCount === 1 ? '' : 's'}
              </span>
              {mentionInfo &&
                Object.entries(mentionInfo.bySourceType).map(([source, n]) => (
                  <span
                    key={source}
                    className="text-[8px] px-1 py-0.5 rounded bg-muted/40 text-muted-foreground"
                  >
                    {n} {SOURCE_LABELS[source] ?? source}
                  </span>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
