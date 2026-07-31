/**
 * Panels are what Bip's tool calls leave behind on the workspace.
 *
 * The server already streams every tool's full result to the browser over the
 * chat SSE (`tool_result`); this maps the ones worth looking at onto a panel.
 * Tools that only feed the model — workspace summaries, entity lookups — make
 * no panel at all, so the workspace stays the things you'd actually want on
 * the desk rather than a log of everything that ran.
 */

export type PanelKind =
  | 'lots'
  | 'tax'
  | 'benchmark'
  | 'ledger'
  | 'holdings'
  | 'search'
  | 'document'
  | 'export'
  | 'gains'
  | 'approaching'
  | 'losses'
  | 'reconciliation'
  | 'comparison'
  | 'generated'
  // Summoned from a dashboard rather than produced by a tool. These carry no
  // payload: a tool panel is evidence from the moment Bip looked, a summoned
  // panel is the dashboard itself and reads live every time it renders.
  | 'portfolio'
  | 'taxes';

export const SUMMONABLE = {
  portfolio: { title: 'Portfolio', subtitle: 'live' },
  taxes: { title: 'Taxes', subtitle: 'live' },
  gains: { title: 'Realized gains', subtitle: 'live' },
  approaching: { title: 'Approaching long-term', subtitle: 'live' },
  losses: { title: 'Losses available', subtitle: 'live' },
  reconciliation: { title: '1099 check', subtitle: 'live' },
  comparison: { title: 'Every position, compared', subtitle: 'live' },
} as const;

export type SummonKind = keyof typeof SUMMONABLE;

export function isSummonKind(value: string): value is SummonKind {
  return value in SUMMONABLE;
}

/** Keyed by kind, so summoning twice moves it up rather than stacking. */
export function summonedPanel(kind: SummonKind): Panel {
  return {
    id: `live:${kind}`,
    kind,
    title: SUMMONABLE[kind].title,
    subtitle: SUMMONABLE[kind].subtitle,
    data: {},
    createdAt: Date.now(),
  };
}

/**
 * Bumped when the stored payload shape changes in a way readers must know
 * about. Rows carry the version they were written with, so an old payload can
 * be migrated or ignored rather than silently rendered wrong.
 */
export const PANEL_PAYLOAD_VERSION = 1;

export interface Panel {
  /** The tool call that produced it — stable, so a rerun replaces rather than stacks. */
  id: string;
  kind: PanelKind;
  title: string;
  subtitle: string | null;
  data: Record<string, unknown>;
  createdAt: number;
  pinned?: boolean;
  /** Where it sits on the canvas. Undefined until it has been placed. */
  x?: number | null;
  y?: number | null;
  w?: number | null;
}

interface PanelSpec {
  kind: PanelKind;
  title: string;
  /**
   * What this panel is *about*, which is its identity on the desk. Asking the
   * same thing twice should update one panel, not leave two — so the id comes
   * from the subject rather than from the tool call that happened to produce
   * it. Undefined falls back to the call id, keeping every result distinct.
   */
  subject?: (d: Record<string, unknown>) => string | undefined;
  /**
   * Whether the result actually carried anything. Tools degrade gracefully
   * rather than failing, so a call can succeed and still have nothing to
   * show — nine "we couldn't work this out" cards is what a cluttered desk is
   * made of.
   */
  substance?: (d: Record<string, unknown>) => boolean;
}

const nonEmpty = (v: unknown): boolean => Array.isArray(v) && v.length > 0;
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

const PANEL_TOOLS: Record<string, PanelSpec> = {
  pre_trade_check: {
    kind: 'lots',
    title: 'Pre-trade check',
    subject: (d) => str(d.symbol),
    // No lots means no purchase history, so there is no gain to show and the
    // panel would say only that it can't say.
    substance: (d) => nonEmpty(d.lots),
  },
  get_tax_picture: {
    kind: 'tax',
    title: 'Tax picture',
    // One tax position per desk; a second look at it is the same panel.
    subject: () => 'current',
    substance: (d) => d.hasProfile !== false,
  },
  benchmark_comparison: {
    kind: 'benchmark',
    title: 'Against the index',
    subject: (d) => str(d.benchmarkSymbol) ?? 'index',
  },
  estimate_capital_gains: {
    kind: 'ledger',
    title: 'Realized gains',
    subject: (d) => (typeof d.taxYear === 'number' ? String(d.taxYear) : 'year'),
  },
  get_holdings: {
    kind: 'holdings',
    title: 'Holdings',
    subject: () => 'all',
    substance: (d) => nonEmpty(d.holdings),
  },
  search_documents: {
    kind: 'search',
    title: 'Documents',
    substance: (d) => nonEmpty(d.results) || nonEmpty(d.documents),
  },
  prepare_export: {
    kind: 'export',
    title: 'Ready to download',
    subject: (d) => `${str(d.kind) ?? 'export'}:${typeof d.taxYear === 'number' ? d.taxYear : ''}`,
  },
  show_on_desk: {
    kind: 'generated',
    title: 'Answer',
    // An answer is identified by what it answers. Asking the same question
    // again rebuilds that panel in place rather than adding a near-duplicate.
    subject: (d) =>
      str(d.title)
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 60),
    substance: (d) => typeof d.html === 'string' && d.html.length > 0,
  },
};

/** A short line of context for the panel header, pulled from the result. */
function subtitleFor(kind: PanelKind, data: Record<string, unknown>): string | null {
  switch (kind) {
    case 'lots':
      return typeof data.symbol === 'string' ? data.symbol : null;
    case 'ledger':
      return typeof data.taxYear === 'number' ? String(data.taxYear) : null;
    case 'benchmark':
      return typeof data.benchmarkSymbol === 'string' ? data.benchmarkSymbol : null;
    case 'export':
      return data.kind === 'cost-basis'
        ? 'Cost basis report'
        : `Form 8949 · ${typeof data.taxYear === 'number' ? data.taxYear : ''}`.trim();
    default:
      return null;
  }
}

export function panelFromToolResult(
  toolName: string,
  toolCallId: string,
  result: unknown,
): Panel | null {
  const spec = PANEL_TOOLS[toolName];
  if (!spec) return null;
  if (typeof result !== 'object' || result === null) return null;
  const data = result as Record<string, unknown>;

  // Tools degrade with { available: false, reason } rather than throwing —
  // a panel that can only say "no data" is worse than no panel.
  if (data.available === false) return null;
  // And a call can succeed while still having nothing to show. One question
  // can fan out into a tool call per position; the ones that came back empty
  // are the difference between a desk and a pile.
  if (spec.substance && !spec.substance(data)) return null;

  // A generated answer names itself — the tool's fixed label is only a
  // fallback, since the whole point is that Bip decided what this is.
  const title =
    spec.kind === 'generated' && typeof data.title === 'string' && data.title.length > 0
      ? data.title
      : spec.title;
  const subtitle =
    spec.kind === 'generated'
      ? typeof data.subtitle === 'string' && data.subtitle.length > 0
        ? data.subtitle
        : null
      : subtitleFor(spec.kind, data);

  const subject = spec.subject?.(data);

  return {
    // Keyed by what it's about where that's knowable, so a rerun updates the
    // panel instead of parking another one next to it.
    id: subject ? `${spec.kind}:${subject}` : toolCallId,
    kind: spec.kind,
    title,
    subtitle,
    data,
    createdAt: Date.now(),
  };
}

/**
 * A document opened by hand rather than produced by a tool. Keyed by file id
 * so opening the same document twice moves it to the top instead of stacking.
 */
export function documentPanel(file: {
  id: string;
  fileName: string;
  pageCount: number;
  mimeType: string;
}): Panel {
  return {
    id: `doc:${file.id}`,
    kind: 'document',
    title: 'Document',
    subtitle: file.fileName,
    data: {
      fileId: file.id,
      fileName: file.fileName,
      pageCount: file.pageCount,
      mimeType: file.mimeType,
    },
    createdAt: Date.now(),
  };
}

/** Newest first, and a rerun of the same tool call replaces its old panel. */
export function mergePanel(panels: Panel[], next: Panel): Panel[] {
  const previous = panels.find((p) => p.id === next.id);
  // A rerun of a pinned panel stays pinned — the pin is the user's, not the tool's
  const merged = previous?.pinned ? { ...next, pinned: true } : next;
  return sortPanels([merged, ...panels.filter((p) => p.id !== next.id)]);
}

/** Pinned first, then whatever order the list already carries. */
export function sortPanels(panels: Panel[]): Panel[] {
  return [...panels].sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false));
}
