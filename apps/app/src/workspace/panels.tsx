import { useTRPC } from '@/lib/trpc';
import { useSpaceId } from '@/surfaces/layout';
import { GeneratedPanel } from '@/workspace/generated';
import type { Panel } from '@/workspace/panel';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, ExternalLink, Pin, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

/**
 * Panel renderers. Every payload here arrives as untyped JSON off the chat
 * stream, so each reader is defensive — a field that isn't there renders as
 * nothing rather than throwing the workspace away.
 */

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const usdWhole = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? (v.filter((x) => typeof x === 'object' && x !== null) as Record<string, unknown>[])
    : [];

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'accent';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-good'
      : tone === 'bad'
        ? 'text-bad'
        : tone === 'accent'
          ? 'text-accent'
          : '';
  return (
    <div>
      <p className="eyebrow mb-1">{label}</p>
      <p className={`tnum font-mono text-lg font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function Row({ children, first = false }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2.5 ${first ? '' : 'border-t border-hairline'}`}
    >
      {children}
    </div>
  );
}

function LotsPanel({ d }: { d: Record<string, unknown> }) {
  const lots = arr(d.lots);
  const gain = (d.estimatedGain ?? {}) as Record<string, unknown>;
  const total = num(gain.total);
  const tax = num(gain.estimatedFederalTax);
  const wash = str(d.washSaleRisk);
  const note = str(gain.note);

  return (
    <div className="space-y-4">
      {(total !== null || tax !== null) && (
        <div className="grid grid-cols-2 gap-4">
          {total !== null && (
            <Figure label="Estimated gain" value={usd(total)} tone={total >= 0 ? 'good' : 'bad'} />
          )}
          {tax !== null && <Figure label="Estimated federal tax" value={usd(tax)} />}
        </div>
      )}

      {lots.length > 0 && (
        <div className="overflow-hidden rounded-card border border-hairline">
          {lots.map((lot, i) => {
            const days = num(lot.daysUntilLongTerm);
            const term = str(lot.term);
            return (
              <Row key={`${str(lot.acquiredAt) ?? i}`} first={i === 0}>
                <span className="tnum font-mono text-xs">
                  {num(lot.units)?.toLocaleString() ?? '—'} units · {str(lot.acquiredAt) ?? '—'}
                </span>
                <span className="flex items-center gap-2 text-xs">
                  <span className="eyebrow rounded-full border border-hairline px-1.5 py-0.5">
                    {term ?? '—'}
                  </span>
                  {term === 'short' && days !== null && (
                    <span className="tnum text-accent">long-term in {days}d</span>
                  )}
                </span>
              </Row>
            );
          })}
        </div>
      )}

      {wash && <p className="text-xs text-warn">{wash}</p>}
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

function TaxPanel({ d }: { d: Record<string, unknown> }) {
  const result = (d.result ?? {}) as Record<string, unknown>;
  const owed = num(result.refundOrOwed);
  const totalTax = num(result.totalTax);
  const room = num(result.ltcgZeroBracketRoom);
  const effective = num(result.effectiveRate);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {owed !== null && (
          <Figure
            label={owed < 0 ? "You'd owe" : "You'd get back"}
            value={usdWhole(Math.abs(owed))}
            tone={owed < 0 ? 'bad' : 'good'}
          />
        )}
        {totalTax !== null && <Figure label="Total tax" value={usdWhole(totalTax)} />}
      </div>
      {room !== null && room > 0 && (
        <div className="rounded-card border border-accent/30 bg-accent-soft p-3">
          <p className="eyebrow mb-1 text-accent">Tax-free gains window</p>
          <p className="text-xs">
            <span className="tnum font-mono font-bold">{usdWhole(room)}</span> of long-term gains
            realizable at 0% federal tax.
          </p>
        </div>
      )}
      {effective !== null && (
        <p className="text-xs text-muted">{effective.toFixed(1)}% effective rate</p>
      )}
    </div>
  );
}

function BenchmarkPanel({ d }: { d: Record<string, unknown> }) {
  const actual = num(d.actualValue);
  const counterfactual = num(d.counterfactualValue);
  const coverage = num(d.coverage);
  const positions = arr(d.positions);
  const diff = actual !== null && counterfactual !== null ? actual - counterfactual : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {actual !== null && <Figure label="Your picks" value={usd(actual)} />}
        {counterfactual !== null && (
          <Figure label="Same dollars, same dates" value={usd(counterfactual)} />
        )}
      </div>
      {diff !== null && (
        <p className="text-sm">
          <span className={diff >= 0 ? 'text-good' : 'text-bad'}>
            {diff >= 0 ? 'Ahead by ' : 'Behind by '}
            {usd(Math.abs(diff))}
          </span>
          {coverage !== null && coverage < 0.95 && (
            <span className="text-muted"> · covers {Math.round(coverage * 100)}% of holdings</span>
          )}
        </p>
      )}
      {positions.length > 0 && (
        <div className="overflow-hidden rounded-card border border-hairline">
          {positions.slice(0, 8).map((p, i) => {
            const a = num(p.actualValue);
            const c = num(p.counterfactualValue);
            const d2 = a !== null && c !== null ? a - c : null;
            return (
              <Row key={str(p.symbol) ?? i} first={i === 0}>
                <span className="font-mono text-xs font-semibold">{str(p.symbol) ?? '—'}</span>
                {d2 !== null && (
                  <span className={`tnum font-mono text-xs ${d2 >= 0 ? 'text-good' : 'text-bad'}`}>
                    {d2 >= 0 ? '+' : ''}
                    {usd(d2)}
                  </span>
                )}
              </Row>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LedgerPanel({ d }: { d: Record<string, unknown> }) {
  const short = num(d.shortTermGain);
  const long = num(d.longTermGain);
  const wash = num(d.washDisallowed);
  const sales = arr(d.sales);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {short !== null && (
          <Figure label="Short-term" value={usd(short)} tone={short >= 0 ? 'good' : 'bad'} />
        )}
        {long !== null && (
          <Figure label="Long-term" value={usd(long)} tone={long >= 0 ? 'good' : 'bad'} />
        )}
      </div>
      {wash !== null && wash > 0 && (
        <p className="text-xs text-warn">{usd(wash)} of losses disallowed by wash sales</p>
      )}
      {sales.length > 0 && (
        <div className="overflow-hidden rounded-card border border-hairline">
          {sales.slice(0, 10).map((s, i) => {
            const g = num(s.gain);
            return (
              <Row key={str(s.tradeId) ?? i} first={i === 0}>
                <span className="text-xs">
                  <span className="font-mono font-semibold">{str(s.symbol) ?? '—'}</span>
                  <span className="ml-2 text-muted">{str(s.saleDate) ?? ''}</span>
                </span>
                {g !== null && (
                  <span className={`tnum font-mono text-xs ${g >= 0 ? 'text-good' : 'text-bad'}`}>
                    {g >= 0 ? '+' : ''}
                    {usd(g)}
                  </span>
                )}
              </Row>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HoldingsPanel({ d }: { d: Record<string, unknown> }) {
  const holdings = arr(d.holdings).length > 0 ? arr(d.holdings) : arr(d.rows);
  if (holdings.length === 0) return <p className="text-xs text-muted">No positions.</p>;
  return (
    <div className="overflow-hidden rounded-card border border-hairline">
      {holdings.slice(0, 12).map((h, i) => (
        <Row key={str(h.symbol) ?? i} first={i === 0}>
          <span className="text-xs">
            <span className="font-mono font-semibold">{str(h.symbol) ?? '—'}</span>
            <span className="ml-2 text-muted">{str(h.name) ?? ''}</span>
          </span>
          <span className="tnum font-mono text-xs">
            {num(h.value) !== null ? usd(num(h.value) as number) : '—'}
          </span>
        </Row>
      ))}
    </div>
  );
}

function SearchPanel({ d }: { d: Record<string, unknown> }) {
  const results = arr(d.results).length > 0 ? arr(d.results) : arr(d.chunks);
  if (results.length === 0) return <p className="text-xs text-muted">Nothing matched.</p>;
  return (
    <div className="space-y-3">
      {results.slice(0, 6).map((r, i) => (
        <div key={str(r.chunkId) ?? i} className="rounded-card border border-hairline p-3">
          <p className="eyebrow mb-1">{str(r.fileName) ?? 'Document'}</p>
          <p className="text-xs leading-relaxed text-muted">
            {(str(r.content) ?? str(r.snippet) ?? '').slice(0, 260)}
          </p>
        </div>
      ))}
    </div>
  );
}

function DocumentPanel({ d }: { d: Record<string, unknown> }) {
  const fileId = str(d.fileId);
  const pageCount = num(d.pageCount) ?? 0;
  const isPdf = str(d.mimeType) === 'application/pdf';
  const [page, setPage] = useState(1);

  if (!fileId) return <p className="text-xs text-muted">This document is no longer available.</p>;

  return (
    <div className="space-y-3">
      {isPdf && pageCount > 0 ? (
        <>
          <div className="overflow-hidden rounded-card border border-hairline bg-paper">
            {/* Pages are rendered on demand and cached by the browser */}
            <img
              key={page}
              src={`/api/files/${fileId}/page/${page}`}
              alt={`${str(d.fileName) ?? 'Document'} — page ${page}`}
              className="block w-full"
            />
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
                className="text-muted transition-colors hover:text-ink disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="tnum font-mono text-xs text-muted">
                {page} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page === pageCount}
                aria-label="Next page"
                className="text-muted transition-colors hover:text-ink disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted">
          {isPdf
            ? "This PDF couldn't be opened for preview."
            : 'Preview is available for PDFs; open the original to view this one.'}
        </p>
      )}

      <a
        href={`/api/files/${fileId}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
      >
        Open the original <ExternalLink size={12} />
      </a>
    </div>
  );
}

function ExportPanel({ d }: { d: Record<string, unknown> }) {
  const path = str(d.downloadPath);
  const isBasisReport = d.kind === 'cost-basis';
  const rowCount = num(d.rowCount);
  const shortTerm = num(d.shortTermGain);
  const longTerm = num(d.longTermGain);
  const wash = num(d.washDisallowed);
  const basisKnown = num(d.basisKnownCount);

  return (
    <div className="space-y-4">
      {isBasisReport ? (
        <p className="text-sm text-muted">
          {rowCount ?? 0} position{rowCount === 1 ? '' : 's'}
          {basisKnown !== null && (
            <> · {basisKnown} with a known cost basis, the rest marked NOT REPORTED</>
          )}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            {shortTerm !== null && (
              <Figure
                label="Short-term"
                value={usd(shortTerm)}
                tone={shortTerm >= 0 ? 'good' : 'bad'}
              />
            )}
            {longTerm !== null && (
              <Figure
                label="Long-term"
                value={usd(longTerm)}
                tone={longTerm >= 0 ? 'good' : 'bad'}
              />
            )}
          </div>
          <p className="text-xs text-muted">
            {rowCount ?? 0} reportable sale{rowCount === 1 ? '' : 's'}
            {wash !== null && wash > 0 && <> · {usd(wash)} disallowed by wash sales, coded W</>}
          </p>
        </>
      )}

      {path && (
        <a
          href={path}
          className="inline-flex items-center gap-2 rounded-card bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Download size={15} /> Download CSV
        </a>
      )}

      <p className="text-[11px] leading-relaxed text-faint">
        Computed from your own data. An educational worksheet, not a filing.
      </p>
    </div>
  );
}

/**
 * Summoned dashboards. Unlike the tool panels these hold no payload — they
 * read the same routers Portfolio and Taxes do, so what sits on the workspace
 * is the current number rather than a snapshot of one.
 */
function LivePortfolioPanel() {
  const trpc = useTRPC();
  const spaceId = useSpaceId();
  const { data: holdings, isLoading } = useQuery(
    trpc.holding.list.queryOptions({ workspaceId: spaceId }),
  );

  if (isLoading) return <p className="text-xs text-muted">Reading your positions…</p>;
  if (!holdings || holdings.length === 0)
    return <p className="text-xs text-muted">No positions yet.</p>;

  const total = holdings.reduce((s, h) => s + h.value, 0);
  return (
    <div className="space-y-4">
      <Figure label="Invested" value={usd(total)} />
      <div className="overflow-hidden rounded-card border border-hairline">
        {holdings.slice(0, 12).map((h, i) => (
          <Row key={h.id} first={i === 0}>
            <span className="text-xs">
              <span className="font-mono font-semibold">{h.symbol}</span>
              <span className="ml-2 text-muted">{h.name}</span>
            </span>
            <span className="tnum font-mono text-xs">{usd(h.value)}</span>
          </Row>
        ))}
      </div>
      <Link
        to="/portfolio"
        className="inline-block text-xs font-medium text-accent hover:underline"
      >
        Open Portfolio
      </Link>
    </div>
  );
}

function LiveTaxPanel() {
  const trpc = useTRPC();
  const spaceId = useSpaceId();
  const { data: picture, isLoading } = useQuery(
    trpc.tax.picture.queryOptions({ workspaceId: spaceId }),
  );

  if (isLoading) return <p className="text-xs text-muted">Running the numbers…</p>;
  if (!picture) return <p className="text-xs text-muted">No tax picture yet.</p>;

  const { result } = picture;
  const owed = result.refundOrOwed;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Figure
          label={owed < 0 ? "You'd owe" : "You'd get back"}
          value={usdWhole(Math.abs(owed))}
          tone={owed < 0 ? 'bad' : 'good'}
        />
        <Figure label="Total tax" value={usdWhole(result.totalTax)} />
      </div>
      {result.ltcgZeroBracketRoom > 0 && (
        <div className="rounded-card border border-accent/30 bg-accent-soft p-3">
          <p className="eyebrow mb-1 text-accent">Tax-free gains window</p>
          <p className="text-xs">
            <span className="tnum font-mono font-bold">{usdWhole(result.ltcgZeroBracketRoom)}</span>{' '}
            of long-term gains realizable at 0% federal tax.
          </p>
        </div>
      )}
      <Link to="/taxes" className="inline-block text-xs font-medium text-accent hover:underline">
        Open Taxes
      </Link>
    </div>
  );
}

/** Positions on the wrong side of the one-year line, soonest first. */
function ApproachingPanel() {
  const trpc = useTRPC();
  const spaceId = useSpaceId();
  const { data, isLoading } = useQuery(trpc.desk.positions.queryOptions({ workspaceId: spaceId }));

  if (isLoading) return <p className="text-xs text-muted">Reading your positions…</p>;
  const soon = (data ?? [])
    .filter((p) => p.daysToLongTerm !== null)
    .sort((a, b) => (a.daysToLongTerm ?? 0) - (b.daysToLongTerm ?? 0));
  const undated = (data ?? []).filter((p) => p.term === null).length;

  if (soon.length === 0) {
    return (
      <p className="text-xs text-muted">
        Nothing is short-term right now.
        {undated > 0 && ` ${undated} position${undated === 1 ? '' : 's'} have no acquisition date.`}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-card border border-hairline">
        {soon.map((p, i) => (
          <Row key={p.id} first={i === 0}>
            <span className="text-xs">
              <span className="font-mono font-semibold">{p.symbol}</span>
              <span className="ml-2 text-muted">held since {p.acquiredAt}</span>
            </span>
            <span className="tnum font-mono text-xs text-accent">
              {p.daysToLongTerm} day{p.daysToLongTerm === 1 ? '' : 's'}
            </span>
          </Row>
        ))}
      </div>
      <p className="text-xs text-muted">
        Selling before the count runs out taxes the gain at your ordinary rate instead of the
        long-term one.
        {undated > 0 && ` ${undated} position${undated === 1 ? '' : 's'} have no acquisition date.`}
      </p>
    </div>
  );
}

/** What's under water, and by how much. */
function LossesPanel() {
  const trpc = useTRPC();
  const spaceId = useSpaceId();
  const { data, isLoading } = useQuery(trpc.desk.positions.queryOptions({ workspaceId: spaceId }));

  if (isLoading) return <p className="text-xs text-muted">Reading your positions…</p>;
  const positions = data ?? [];
  const losing = positions
    .filter((p) => p.unrealized !== null && p.unrealized < 0)
    .sort((a, b) => (a.unrealized ?? 0) - (b.unrealized ?? 0));
  const unknown = positions.filter((p) => p.unrealized === null).length;

  if (losing.length === 0) {
    return (
      <p className="text-xs text-muted">
        No position with a known basis is under water.
        {unknown > 0 && ` ${unknown} can't be judged without a cost basis.`}
      </p>
    );
  }
  const total = losing.reduce((s, p) => s + (p.unrealized ?? 0), 0);
  return (
    <div className="space-y-3">
      <Figure label="Unrealized losses" value={usd(Math.abs(total))} tone="bad" />
      <div className="overflow-hidden rounded-card border border-hairline">
        {losing.map((p, i) => (
          <Row key={p.id} first={i === 0}>
            <span className="text-xs">
              <span className="font-mono font-semibold">{p.symbol}</span>
              {p.term && <span className="ml-2 text-muted">{p.term}-term</span>}
            </span>
            <span className="tnum font-mono text-xs text-bad">{usd(p.unrealized ?? 0)}</span>
          </Row>
        ))}
      </div>
      <p className="text-xs text-muted">
        Realizing a loss offsets gains first, then up to $3,000 of ordinary income. Buying back
        within 30 days disallows it.
        {unknown > 0 && ` ${unknown} position${unknown === 1 ? '' : 's'} have no cost basis.`}
      </p>
    </div>
  );
}

/** The year's realized gains, read live rather than from a tool snapshot. */
function GainsPanel({ taxYear }: { taxYear: number }) {
  const trpc = useTRPC();
  const spaceId = useSpaceId();
  const { data, isLoading } = useQuery(
    trpc.tax.realizedGains.queryOptions({ workspaceId: spaceId, taxYear }),
  );
  if (isLoading) return <p className="text-xs text-muted">Matching lots…</p>;
  if (!data) return <p className="text-xs text-muted">No trade history imported.</p>;
  return <LedgerPanel d={data as unknown as Record<string, unknown>} />;
}

/** The 1099 check for the desk's year, without needing to know the file. */
function ReconciliationPanel({ taxYear }: { taxYear: number }) {
  const trpc = useTRPC();
  const spaceId = useSpaceId();
  const { data, isLoading } = useQuery(
    trpc.tax.reconciliationForYear.queryOptions({ workspaceId: spaceId, taxYear }),
  );

  if (isLoading) return <p className="text-xs text-muted">Comparing against the ledger…</p>;
  if (!data) return <p className="text-xs text-muted">No 1099 uploaded for {taxYear}.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="font-medium">{data.broker ?? 'Broker'}</span>
        <span className="text-muted">
          {' · '}
          {data.matches} of {data.reportedRowCount} reported rows agree
        </span>
      </p>
      <div className="overflow-hidden rounded-card border border-hairline">
        {data.rows.map((r, i) => (
          <Row key={`${r.symbol}|${r.term}`} first={i === 0}>
            <span className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  r.status === 'match' ? 'bg-good' : r.status === 'mismatch' ? 'bg-bad' : 'bg-warn'
                }`}
              />
              <span className="font-mono text-xs font-semibold">{r.symbol}</span>
              <span className="eyebrow rounded-full border border-hairline px-1.5 py-0.5">
                {r.term}
              </span>
            </span>
            <span className="tnum font-mono text-xs">
              {r.status === 'match' && <span className="text-good">matches</span>}
              {r.status === 'mismatch' && (
                <span className="text-bad">
                  {r.deltas.basis !== null && Math.abs(r.deltas.basis) > 1
                    ? `basis off by ${usd(r.deltas.basis)}`
                    : `proceeds off by ${usd(r.deltas.proceeds ?? 0)}`}
                </span>
              )}
              {r.status === 'missing-history' && <span className="text-warn">no history</span>}
              {r.status === 'not-on-1099' && <span className="text-warn">not on the form</span>}
            </span>
          </Row>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-faint">
        Differences can be legitimate — specific-lot elections, transfers — so check before assuming
        either side is wrong.
      </p>
    </div>
  );
}

/**
 * The sell decision, side by side. Every position against the things that
 * decide it, so the choice is made by comparison rather than by asking about
 * one holding at a time and trying to hold the rest in your head.
 */
function ComparisonPanel() {
  const trpc = useTRPC();
  const spaceId = useSpaceId();
  const { data, isLoading } = useQuery(trpc.desk.comparison.queryOptions({ workspaceId: spaceId }));

  if (isLoading) return <p className="text-xs text-muted">Working through your positions…</p>;
  if (!data || data.positions.length === 0)
    return <p className="text-xs text-muted">No positions yet.</p>;

  const { context, positions } = data;
  return (
    <div className="space-y-3">
      {/* The table is wider than the panel on a narrow screen; it scrolls
          rather than wrapping, because a wrapped comparison isn't one. */}
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th className="eyebrow py-2 pr-3 font-normal">Position</th>
              <th className="eyebrow py-2 pr-3 font-normal">Term</th>
              <th className="eyebrow py-2 pr-3 text-right font-normal">To long-term</th>
              <th className="eyebrow py-2 pr-3 text-right font-normal">Unrealized</th>
              <th className="eyebrow py-2 pr-3 text-right font-normal">Tax if sold</th>
              <th className="eyebrow py-2 text-right font-normal">Wash</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id} className="border-b border-hairline last:border-0">
                <td className="py-2 pr-3">
                  <span className="font-mono font-semibold">{p.symbol}</span>
                </td>
                <td className="py-2 pr-3 text-muted">{p.term ?? '—'}</td>
                <td className="tnum py-2 pr-3 text-right font-mono">
                  {p.daysToLongTerm === null ? (
                    <span className="text-faint">—</span>
                  ) : (
                    <span className="text-accent">{p.daysToLongTerm}d</span>
                  )}
                </td>
                <td className="tnum py-2 pr-3 text-right font-mono">
                  {p.unrealized === null ? (
                    <span className="text-faint">not known</span>
                  ) : (
                    <span className={p.unrealized >= 0 ? 'text-good' : 'text-bad'}>
                      {p.unrealized >= 0 ? '+' : ''}
                      {usd(p.unrealized)}
                    </span>
                  )}
                </td>
                <td className="tnum py-2 pr-3 text-right font-mono">
                  {p.estimatedTaxIfSoldToday === null ? (
                    <span className="text-faint">—</span>
                  ) : (
                    usd(p.estimatedTaxIfSoldToday)
                  )}
                </td>
                <td className="py-2 text-right">
                  {p.washRisk ? (
                    <span className="text-warn">at risk</span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-relaxed text-faint">
        {context.hasTaxProfile
          ? `Each row assumes it's the only thing you sell: the ${usdWhole(context.ltcgZeroBracketRoom)} of 0% long-term room is a single allowance, not one per position. Short-term gains use your ${context.marginalFederalRatePct?.toFixed(0)}% marginal rate; long-term above the window uses 15%. Federal only, and an estimate.`
          : 'Tax columns need your income before they can be worked out — the Taxes surface fills them in.'}
      </p>
    </div>
  );
}

/**
 * A panel on the desk. It carries no pin: on a canvas the arrangement *is*
 * where you put things, so an ordering flag has nothing left to order.
 */
export function PanelCard({
  panel,
  taxYear,
  onDismiss,
}: {
  panel: Panel;
  /** The desk's year — the live panels that are year-scoped read it. */
  taxYear: number;
  onDismiss: (id: string) => void;
}) {
  return (
    <section className="rise rounded-card bg-surface p-5 shadow-card">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="eyebrow">{panel.title}</h2>
          {panel.subtitle && <span className="font-mono text-xs text-muted">{panel.subtitle}</span>}
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onDismiss(panel.id)}
            aria-label="Remove panel"
            className="text-faint transition-colors hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {panel.kind === 'lots' && <LotsPanel d={panel.data} />}
      {panel.kind === 'tax' && <TaxPanel d={panel.data} />}
      {panel.kind === 'benchmark' && <BenchmarkPanel d={panel.data} />}
      {panel.kind === 'ledger' && <LedgerPanel d={panel.data} />}
      {panel.kind === 'holdings' && <HoldingsPanel d={panel.data} />}
      {panel.kind === 'search' && <SearchPanel d={panel.data} />}
      {panel.kind === 'document' && <DocumentPanel d={panel.data} />}
      {panel.kind === 'export' && <ExportPanel d={panel.data} />}
      {panel.kind === 'generated' && typeof panel.data.html === 'string' && (
        <GeneratedPanel id={panel.id} html={panel.data.html} />
      )}
      {panel.kind === 'comparison' && <ComparisonPanel />}
      {panel.kind === 'gains' && <GainsPanel taxYear={taxYear} />}
      {panel.kind === 'approaching' && <ApproachingPanel />}
      {panel.kind === 'losses' && <LossesPanel />}
      {panel.kind === 'reconciliation' && <ReconciliationPanel taxYear={taxYear} />}
      {panel.kind === 'portfolio' && <LivePortfolioPanel />}
      {panel.kind === 'taxes' && <LiveTaxPanel />}
    </section>
  );
}
