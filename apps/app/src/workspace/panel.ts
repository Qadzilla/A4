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
  // Summoned from a dashboard rather than produced by a tool. These carry no
  // payload: a tool panel is evidence from the moment Bip looked, a summoned
  // panel is the dashboard itself and reads live every time it renders.
  | 'portfolio'
  | 'taxes';

export const SUMMONABLE = {
  portfolio: { title: 'Portfolio', subtitle: 'live' },
  taxes: { title: 'Taxes', subtitle: 'live' },
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
}

const PANEL_TOOLS: Record<string, { kind: PanelKind; title: string }> = {
  pre_trade_check: { kind: 'lots', title: 'Pre-trade check' },
  get_tax_picture: { kind: 'tax', title: 'Tax picture' },
  benchmark_comparison: { kind: 'benchmark', title: 'Against the index' },
  estimate_capital_gains: { kind: 'ledger', title: 'Realized gains' },
  get_holdings: { kind: 'holdings', title: 'Holdings' },
  search_documents: { kind: 'search', title: 'Documents' },
  prepare_export: { kind: 'export', title: 'Ready to download' },
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

  return {
    id: toolCallId,
    kind: spec.kind,
    title: spec.title,
    subtitle: subtitleFor(spec.kind, data),
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
