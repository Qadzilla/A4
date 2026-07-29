import { useTRPC } from '@/lib/trpc';
import { useSpaceId } from '@/surfaces/layout';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Link2, RefreshCw, Upload } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const LIVE_REFRESH_MS = 60_000;

export function PortfolioSurface() {
  const trpc = useTRPC();
  const spaceId = useSpaceId();

  const {
    data: holdings = [],
    isLoading: holdingsLoading,
    isError: holdingsError,
    refetch,
  } = useQuery(trpc.holding.list.queryOptions({ workspaceId: spaceId }));
  const { data: accounts = [], isLoading: accountsLoading } = useQuery(
    trpc.account.list.queryOptions({ workspaceId: spaceId }),
  );

  // Quotes: one per symbol, refreshed every minute. Live snapshot when the
  // data plan allows it, latest daily close (labeled EOD) otherwise; failures
  // (crypto tickers, missing key) degrade to stored values.
  const quoteResults = useQueries({
    queries: holdings.map((h) => ({
      ...trpc.marketData.getQuote.queryOptions({ symbol: h.symbol }),
      refetchInterval: LIVE_REFRESH_MS,
      staleTime: LIVE_REFRESH_MS / 2,
      retry: 0,
    })),
  });
  const livePrice = new Map<string, { price: number; changePct: number; live: boolean }>();
  holdings.forEach((h, i) => {
    const quote = quoteResults[i]?.data;
    if (quote && quote.price > 0) {
      livePrice.set(h.symbol, {
        price: quote.price,
        changePct: quote.changePct,
        live: quote.live,
      });
    }
  });
  /** Live value when we know the share count; stored value otherwise. */
  const liveValue = (h: (typeof holdings)[number]) => {
    const quote = livePrice.get(h.symbol);
    return h.quantity && quote ? h.quantity * quote.price : h.value;
  };

  const { data: benchmark } = useQuery({
    ...trpc.holding.benchmark.queryOptions({ workspaceId: spaceId }),
    staleTime: 5 * 60_000,
  });

  // Dedup rule: investment-container accounts (a brokerage account holding
  // the same positions as the holdings list) are excluded from the cash sum —
  // positions are counted once, in holdings. Imported statements create
  // 'brokerage-cash' accounts carrying the cash sweep only, which DO count.
  const INVESTMENT_CONTAINER_TYPES = new Set(['brokerage', 'investment', 'retirement']);
  const cashAccounts = accounts.filter((a) => !INVESTMENT_CONTAINER_TYPES.has(a.type));
  const containerAccounts = accounts.filter((a) => INVESTMENT_CONTAINER_TYPES.has(a.type));

  const holdingsTotal = holdings.reduce((s, h) => s + liveValue(h), 0);
  const cashTotal = cashAccounts.reduce((s, a) => s + a.balance, 0);
  const total = holdingsTotal + cashTotal;
  const isLive = [...livePrice.values()].some((q) => q.live);
  const isEod = !isLive && livePrice.size > 0;

  // Brokerage connections (SnapTrade) — absent entirely when not configured
  const queryClient = useQueryClient();
  const { data: brokerage } = useQuery(trpc.brokerage.status.queryOptions());
  const connectUrl = useMutation(trpc.brokerage.connectUrl.mutationOptions());
  const sync = useMutation(
    trpc.brokerage.sync.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries(),
    }),
  );
  const connect = () => {
    connectUrl.mutate(
      { redirect: `${window.location.origin}/portfolio?snaptrade=done` },
      { onSuccess: ({ url }) => window.location.assign(url) },
    );
  };
  // Returning from the connection portal → sync once, then clean the URL
  const [searchParams, setSearchParams] = useSearchParams();
  const syncedOnReturn = useRef(false);
  const returnedFromPortal = searchParams.get('snaptrade') === 'done';
  useEffect(() => {
    if (returnedFromPortal && !syncedOnReturn.current) {
      syncedOnReturn.current = true;
      sync.mutate({ workspaceId: spaceId });
      setSearchParams({}, { replace: true });
    }
  }, [returnedFromPortal, sync, spaceId, setSearchParams]);
  // Unrealized P/L only over positions whose cost basis is actually known —
  // mixing basis-known and basis-unknown positions would fabricate a gain
  const basisKnown = holdings.filter((h) => h.costBasis !== null && h.costBasis !== undefined);
  const unrealized =
    basisKnown.length > 0
      ? basisKnown.reduce((s, h) => s + (liveValue(h) - (h.costBasis ?? 0)), 0)
      : null;
  const unrealizedPartial = basisKnown.length > 0 && basisKnown.length < holdings.length;
  const isLoading = holdingsLoading || accountsLoading;
  const isEmpty = !isLoading && holdings.length === 0 && accounts.length === 0;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 md:py-12">
        <p className="eyebrow mb-1.5">Portfolio</p>
        <PortfolioSkeleton />
      </div>
    );
  }

  if (holdingsError) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 md:py-12">
        <p className="eyebrow mb-1.5">Portfolio</p>
        <div className="max-w-md rounded-card border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
          Couldn't load your portfolio.{' '}
          <button type="button" onClick={() => void refetch()} className="font-semibold underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rise mx-auto max-w-3xl px-5 py-8 md:py-12">
      <p className="eyebrow mb-1.5">Portfolio</p>

      {isEmpty ? (
        <EmptyPortfolio
          brokerageEnabled={brokerage?.enabled ?? false}
          onConnect={connect}
          connecting={connectUrl.isPending}
        />
      ) : (
        <>
          <h1 className="tnum mb-1 flex items-center gap-3 font-mono text-4xl font-bold tracking-tight">
            {usd(total)}
            {isLive && (
              <span className="flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
                <span className="eyebrow">Live</span>
              </span>
            )}
            {isEod && (
              <span
                className="flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5"
                title="Latest end-of-day closing prices"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-faint" />
                <span className="eyebrow">EOD</span>
              </span>
            )}
          </h1>
          <p className="mb-10 text-sm text-muted">
            {usd(holdingsTotal)} invested · {usd(cashTotal)} cash
            {unrealized !== null && (
              <span className={unrealized >= 0 ? 'text-good' : 'text-bad'}>
                {' · '}
                {unrealized >= 0 ? '+' : ''}
                {usd(unrealized)} unrealized{unrealizedPartial ? ' (imported positions)' : ''}
              </span>
            )}
          </p>

          {benchmark && (
            <section className="mb-10">
              <h2 className="eyebrow mb-3">vs S&amp;P 500</h2>
              <div className="rounded-card border border-hairline bg-surface p-5">
                <div className="mb-3 grid grid-cols-2 gap-4">
                  <div>
                    <p className="eyebrow mb-1">Your picks</p>
                    <p className="tnum font-mono text-xl font-bold">{usd(benchmark.actualValue)}</p>
                  </div>
                  <div>
                    <p className="eyebrow mb-1">Same dollars in SPY, same dates</p>
                    <p className="tnum font-mono text-xl font-bold text-muted">
                      {usd(benchmark.counterfactualValue)}
                    </p>
                  </div>
                </div>
                {(() => {
                  const diff = benchmark.actualValue - benchmark.counterfactualValue;
                  const ahead = diff >= 0;
                  return (
                    <p className="text-sm">
                      <span className={ahead ? 'text-good' : 'text-bad'}>
                        {ahead ? "You're ahead by " : "You're behind by "}
                        {usd(Math.abs(diff))}
                      </span>
                      <span className="text-muted">
                        {' '}
                        on {usd(benchmark.invested)} invested
                        {benchmark.coverage < 0.95 &&
                          ` · covers ${Math.round(benchmark.coverage * 100)}% of your holdings (dated positions only)`}
                      </span>
                    </p>
                  );
                })()}
              </div>
            </section>
          )}

          {holdings.length > 0 && (
            <section className="mb-10">
              <h2 className="eyebrow mb-3">Holdings</h2>
              <div className="overflow-hidden rounded-card border border-hairline bg-surface">
                {holdings.map((h, i) => {
                  const value = liveValue(h);
                  const pct = holdingsTotal > 0 ? (value / holdingsTotal) * 100 : 0;
                  const drift = h.targetPct > 0 ? pct - h.targetPct : null;
                  const quote = livePrice.get(h.symbol);
                  return (
                    <div
                      key={h.id}
                      className={`flex items-center justify-between px-4 py-3 ${
                        i > 0 ? 'border-t border-hairline' : ''
                      }`}
                    >
                      <div>
                        <span className="font-mono text-sm font-semibold">{h.symbol}</span>
                        <span className="ml-2 text-xs text-muted">{h.name}</span>
                        {quote && (
                          <div className="tnum mt-0.5 font-mono text-xs text-muted">
                            {usd(quote.price)}
                            {quote.changePct !== 0 && (
                              <span className={quote.changePct > 0 ? 'text-good' : 'text-bad'}>
                                {' '}
                                {quote.changePct > 0 ? '+' : ''}
                                {quote.changePct.toFixed(2)}%{quote.live ? ' today' : ''}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="tnum font-mono text-sm">{usd(value)}</div>
                        <div className="tnum text-xs text-muted">
                          {pct.toFixed(1)}%
                          {drift !== null && Math.abs(drift) > 5 && (
                            <span className={drift > 0 ? 'text-warn' : 'text-accent'}>
                              {' '}
                              ({drift > 0 ? '+' : ''}
                              {drift.toFixed(0)}% vs target)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {cashAccounts.length > 0 && (
            <section>
              <h2 className="eyebrow mb-3">Cash &amp; accounts</h2>
              <div className="overflow-hidden rounded-card border border-hairline bg-surface">
                {cashAccounts.map((a, i) => (
                  <div
                    key={a.id}
                    className={`flex items-center justify-between px-4 py-3 ${
                      i > 0 ? 'border-t border-hairline' : ''
                    }`}
                  >
                    <div>
                      <span className="text-sm font-medium">{a.name}</span>
                      <span className="ml-2 text-xs text-muted">
                        {a.institution} · {a.type}
                      </span>
                    </div>
                    <span className="tnum font-mono text-sm">{usd(a.balance)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {brokerage?.enabled && (
            <section className="mt-10">
              <h2 className="eyebrow mb-3">Brokerages</h2>
              <div className="overflow-hidden rounded-card border border-hairline bg-surface">
                {brokerage.connections.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between border-b border-hairline px-4 py-3"
                  >
                    <div>
                      <span className="text-sm font-medium">{c.brokerage}</span>
                      {c.disabled && (
                        <span className="ml-2 text-xs text-warn">connection needs attention</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => sync.mutate({ workspaceId: spaceId })}
                      disabled={sync.isPending}
                      className="flex items-center gap-1.5 text-xs font-medium text-accent disabled:opacity-50"
                    >
                      <RefreshCw
                        size={13}
                        strokeWidth={1.75}
                        className={sync.isPending ? 'animate-spin' : ''}
                      />
                      {sync.isPending ? 'Syncing…' : 'Sync now'}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={connect}
                  disabled={connectUrl.isPending}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent-soft disabled:opacity-50"
                >
                  <Link2 size={16} strokeWidth={1.75} className="text-accent" />
                  <div>
                    <p className="text-sm font-medium">
                      {connectUrl.isPending
                        ? 'Opening secure connection…'
                        : brokerage.connections.length > 0
                          ? 'Connect another brokerage'
                          : 'Connect a brokerage'}
                    </p>
                    <p className="text-xs text-muted">
                      Robinhood, Coinbase, Fidelity &amp; more — read-only, via SnapTrade
                    </p>
                  </div>
                </button>
              </div>
              {sync.isSuccess && (
                <p className="mt-2 text-xs text-muted">
                  Synced {sync.data.accountsSynced} account
                  {sync.data.accountsSynced === 1 ? '' : 's'} ·{' '}
                  {sync.data.positionsCreated + sync.data.positionsUpdated} positions
                </p>
              )}
              {sync.isError && (
                <p className="mt-2 text-xs text-bad">
                  Sync failed — try again, or reconnect the brokerage.
                </p>
              )}
            </section>
          )}

          {containerAccounts.length > 0 && (
            <section className="mt-10">
              <h2 className="eyebrow mb-3">Investment accounts</h2>
              <p className="mb-3 text-xs text-muted">
                These hold the positions listed above — excluded from totals so nothing counts
                twice.
              </p>
              <div className="overflow-hidden rounded-card border border-hairline bg-surface opacity-80">
                {containerAccounts.map((a, i) => (
                  <div
                    key={a.id}
                    className={`flex items-center justify-between px-4 py-3 ${
                      i > 0 ? 'border-t border-hairline' : ''
                    }`}
                  >
                    <div>
                      <span className="text-sm font-medium">{a.name}</span>
                      <span className="ml-2 text-xs text-muted">
                        {a.institution} · {a.type}
                      </span>
                    </div>
                    <span className="tnum font-mono text-sm text-muted">{usd(a.balance)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-2 h-10 w-56 rounded-card bg-hairline/60" />
      <div className="mb-10 h-4 w-72 rounded-card bg-hairline/40" />
      <div className="mb-3 h-3 w-20 rounded-card bg-hairline/40" />
      <div className="overflow-hidden rounded-card border border-hairline bg-surface">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`flex items-center justify-between px-4 py-3.5 ${i > 0 ? 'border-t border-hairline' : ''}`}
          >
            <div className="h-4 w-40 rounded-card bg-hairline/50" />
            <div className="h-4 w-24 rounded-card bg-hairline/50" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyPortfolio({
  brokerageEnabled,
  onConnect,
  connecting,
}: {
  brokerageEnabled: boolean;
  onConnect: () => void;
  connecting: boolean;
}) {
  return (
    <div className="mt-6">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">What do you actually own?</h1>
      <p className="mb-8 max-w-md text-sm text-muted">
        Bring in your real positions and Basis shows you the honest picture — allocation,
        concentration, and what it all means in April.
      </p>
      <div className="grid max-w-md gap-3">
        <Link
          to="/documents"
          className="flex items-center justify-between rounded-card border border-hairline bg-surface p-4 transition-colors hover:border-accent"
        >
          <div className="flex items-center gap-3">
            <Upload size={18} strokeWidth={1.75} className="text-accent" />
            <div>
              <p className="text-sm font-semibold">Upload a statement</p>
              <p className="text-xs text-muted">PDF or CSV from any brokerage — parsed for you</p>
            </div>
          </div>
          <ArrowUpRight size={16} className="text-faint" />
        </Link>
        {brokerageEnabled ? (
          <button
            type="button"
            onClick={onConnect}
            disabled={connecting}
            className="flex items-center justify-between rounded-card border border-hairline bg-surface p-4 text-left transition-colors hover:border-accent disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <Link2 size={18} strokeWidth={1.75} className="text-accent" />
              <div>
                <p className="text-sm font-semibold">
                  {connecting ? 'Opening secure connection…' : 'Connect a brokerage'}
                </p>
                <p className="text-xs text-muted">
                  Robinhood, Coinbase, Fidelity &amp; more — read-only, via SnapTrade
                </p>
              </div>
            </div>
            <ArrowUpRight size={16} className="text-faint" />
          </button>
        ) : (
          <div className="flex items-center justify-between rounded-card border border-dashed border-hairline p-4 opacity-70">
            <div>
              <p className="text-sm font-semibold">Connect a brokerage</p>
              <p className="text-xs text-muted">
                Robinhood, Coinbase, Fidelity &amp; more — coming soon
              </p>
            </div>
            <span className="eyebrow">Soon</span>
          </div>
        )}
      </div>
    </div>
  );
}
