import { useTRPC } from '@/lib/trpc';
import { useSpaceId } from '@/surfaces/layout';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Upload } from 'lucide-react';
import { Link } from 'react-router';

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

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

  const holdingsTotal = holdings.reduce((s, h) => s + h.value, 0);
  const cashTotal = accounts.reduce((s, a) => s + a.balance, 0);
  const total = holdingsTotal + cashTotal;
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
        <EmptyPortfolio />
      ) : (
        <>
          <h1 className="tnum mb-1 font-mono text-4xl font-bold tracking-tight">{usd(total)}</h1>
          {/* P3 note: accounts can overlap holdings (a brokerage account holding
              the same positions) — proper dedup arrives with the import flow */}
          <p className="mb-10 text-sm text-muted">
            {usd(holdingsTotal)} in holdings · {usd(cashTotal)} across accounts
          </p>

          {holdings.length > 0 && (
            <section className="mb-10">
              <h2 className="eyebrow mb-3">Holdings</h2>
              <div className="overflow-hidden rounded-card border border-hairline bg-surface">
                {holdings.map((h, i) => {
                  const pct = holdingsTotal > 0 ? (h.value / holdingsTotal) * 100 : 0;
                  const drift = h.targetPct > 0 ? pct - h.targetPct : null;
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
                      </div>
                      <div className="text-right">
                        <div className="tnum font-mono text-sm">{usd(h.value)}</div>
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

          {accounts.length > 0 && (
            <section>
              <h2 className="eyebrow mb-3">Accounts</h2>
              <div className="overflow-hidden rounded-card border border-hairline bg-surface">
                {accounts.map((a, i) => (
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

function EmptyPortfolio() {
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
        <div className="flex items-center justify-between rounded-card border border-dashed border-hairline p-4 opacity-70">
          <div>
            <p className="text-sm font-semibold">Connect a brokerage</p>
            <p className="text-xs text-muted">
              Robinhood, Coinbase, Fidelity &amp; more — coming in P3
            </p>
          </div>
          <span className="eyebrow">Soon</span>
        </div>
      </div>
    </div>
  );
}
