import { cn } from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { memo, useState } from 'react';
import { formatCurrency } from '../../lib/currency-utils';
import { useTRPC } from '../../lib/trpc';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';
import type { EntityCardData } from './entity-card-content';

const TYPE_LABELS: Record<string, string> = {
  merchant: 'Merchant',
  institution: 'Institution',
  person: 'Person',
  organization: 'Organization',
  account_ref: 'Account reference',
};

const SOURCE_LABELS: Record<string, string> = {
  chunk: 'Document',
  transaction: 'Transaction',
  invoice: 'Invoice',
  receipt: 'Receipt',
  subscription: 'Subscription',
  account: 'Account',
};

export const EntityCardView = memo(function EntityCardView({
  item,
  workspaceId,
}: {
  item: CanvasItem;
  workspaceId: string;
}) {
  const trpc = useTRPC();
  const updateItemData = useCanvasStore((s) => s.updateItemData);
  const data = item.data as EntityCardData | undefined;
  const entityId = data?.entityId ?? null;
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(!entityId);

  const { data: entity, isLoading: entityLoading } = useQuery({
    ...trpc.entity.get.queryOptions({ id: entityId ?? '' }),
    staleTime: 30_000,
    enabled: !!entityId,
  });

  const { data: mentionInfo } = useQuery({
    ...trpc.entity.getMentions.queryOptions({ id: entityId ?? '', limit: 50 }),
    staleTime: 30_000,
    enabled: !!entityId && !picking,
  });

  const { data: connections } = useQuery({
    ...trpc.entity.getConnections.queryOptions({ id: entityId ?? '', depth: 1 }),
    staleTime: 30_000,
    enabled: !!entityId && !picking,
  });

  const { data: candidates, isLoading: listLoading } = useQuery({
    ...trpc.entity.list.queryOptions({
      workspaceId,
      query: search.trim() || undefined,
    }),
    staleTime: 15_000,
    enabled: picking,
  });

  const selectEntity = (id: string) => {
    updateItemData(item.id, { entityId: id } satisfies Record<string, unknown>);
    setPicking(false);
    setSearch('');
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-2xl p-6 sm:p-8">
        <div className="bg-card border border-border/60 shadow-sm rounded-xl p-6 sm:p-8 animate-fade-in">
          {picking ? (
            <>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Pick an entity
              </p>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search merchants, institutions, people…"
                className="w-full rounded-md border border-border bg-muted/20 px-3 py-2 text-[13px] text-foreground outline-none focus:border-ring"
              />
              <div className="mt-3 flex flex-col divide-y divide-border/40 max-h-96 overflow-y-auto">
                {listLoading ? (
                  <p className="text-[12px] text-muted-foreground py-3">Loading…</p>
                ) : (candidates ?? []).length === 0 ? (
                  <p className="text-[12px] text-muted-foreground py-3">
                    No entities yet. Upload documents or add financial data — the entity graph
                    builds itself in the background.
                  </p>
                ) : (
                  (candidates ?? []).map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => selectEntity(candidate.id)}
                      className="group flex items-center gap-2 py-2 text-left hover:bg-muted/20 px-2 rounded"
                    >
                      <span className="text-[13px] text-foreground truncate flex-1">
                        {candidate.canonicalName}
                      </span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">
                        {TYPE_LABELS[candidate.type] ?? candidate.type}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                        {candidate.mentionCount}
                      </span>
                    </button>
                  ))
                )}
              </div>
              {entityId && (
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  className="mt-4 text-[12px] text-muted-foreground hover:text-foreground"
                >
                  ← Back
                </button>
              )}
            </>
          ) : entityLoading ? (
            <div className="space-y-3">
              <div className="h-7 w-1/2 rounded bg-muted/40 animate-pulse" />
              <div className="h-4 w-1/3 rounded bg-muted/40 animate-pulse" />
            </div>
          ) : !entity ? (
            <div className="text-center py-6">
              <p className="text-[13px] text-muted-foreground">
                This entity no longer exists — it may have been pruned after its sources were
                deleted.
              </p>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="mt-3 text-[12px] text-foreground underline underline-offset-2"
              >
                Pick another entity
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-foreground truncate">
                    {entity.canonicalName}
                  </h2>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">
                    {TYPE_LABELS[entity.type] ?? entity.type} · {entity.mentionCount} mention
                    {entity.mentionCount === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="text-[12px] text-muted-foreground hover:text-foreground shrink-0"
                >
                  Change
                </button>
              </div>

              {entity.aliases.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    Also seen as
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {entity.aliases.map((alias) => (
                      <span
                        key={alias}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-muted/40 text-foreground"
                      >
                        {alias}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {connections && connections.edges.length > 0 && (
                <div className="mt-5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    Connections
                  </p>
                  <div className="flex flex-col gap-1">
                    {connections.edges.map((edge) => {
                      const from = connections.nodes.find((n) => n.id === edge.from);
                      const to = connections.nodes.find((n) => n.id === edge.to);
                      return (
                        <p
                          key={`${edge.from}-${edge.to}-${edge.relationship}`}
                          className="text-[12px] text-foreground"
                        >
                          <span className="font-medium">{from?.canonicalName ?? '?'}</span>{' '}
                          <span className="text-muted-foreground">{edge.relationship}</span>{' '}
                          <span className="font-medium">{to?.canonicalName ?? '?'}</span>
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Mentions
                </p>
                {!mentionInfo || mentionInfo.mentions.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">No mentions recorded.</p>
                ) : (
                  <div className="flex flex-col divide-y divide-border/40">
                    {mentionInfo.mentions.map((mention) => (
                      <div key={mention.id} className="group py-2 hover:bg-muted/20 px-2 rounded">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground shrink-0">
                            {SOURCE_LABELS[mention.sourceType] ?? mention.sourceType}
                          </span>
                          {mention.amount !== null && (
                            <span
                              className={cn('text-[11px] font-mono tabular-nums text-foreground')}
                            >
                              {formatCurrency(mention.amount, 'USD')}
                            </span>
                          )}
                          {mention.date && (
                            <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
                              {new Date(mention.date).toISOString().slice(0, 10)}
                            </span>
                          )}
                        </div>
                        {mention.snippet && (
                          <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">
                            {mention.snippet}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
