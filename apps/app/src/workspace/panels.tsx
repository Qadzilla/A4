import type { Panel } from '@/workspace/panel';
import { Pin, X } from 'lucide-react';

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

export function PanelCard({
  panel,
  onDismiss,
  onTogglePin,
}: {
  panel: Panel;
  onDismiss: (id: string) => void;
  onTogglePin: (id: string) => void;
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
            onClick={() => onTogglePin(panel.id)}
            aria-label={panel.pinned ? 'Unpin panel' : 'Pin panel'}
            aria-pressed={panel.pinned ?? false}
            className={`transition-colors ${
              panel.pinned ? 'text-accent' : 'text-faint hover:text-ink'
            }`}
          >
            <Pin size={13} fill={panel.pinned ? 'currentColor' : 'none'} />
          </button>
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
    </section>
  );
}
