/**
 * Panels are what Bip's tool calls leave behind on the workspace.
 *
 * The server already streams every tool's full result to the browser over the
 * chat SSE (`tool_result`); this maps the ones worth looking at onto a panel.
 * Tools that only feed the model — workspace summaries, entity lookups — make
 * no panel at all, so the workspace stays the things you'd actually want on
 * the desk rather than a log of everything that ran.
 */

export type PanelKind = 'lots' | 'tax' | 'benchmark' | 'ledger' | 'holdings' | 'search';

export interface Panel {
  /** The tool call that produced it — stable, so a rerun replaces rather than stacks. */
  id: string;
  kind: PanelKind;
  title: string;
  subtitle: string | null;
  data: Record<string, unknown>;
  createdAt: number;
}

const PANEL_TOOLS: Record<string, { kind: PanelKind; title: string }> = {
  pre_trade_check: { kind: 'lots', title: 'Pre-trade check' },
  get_tax_picture: { kind: 'tax', title: 'Tax picture' },
  benchmark_comparison: { kind: 'benchmark', title: 'Against the index' },
  estimate_capital_gains: { kind: 'ledger', title: 'Realized gains' },
  get_holdings: { kind: 'holdings', title: 'Holdings' },
  search_documents: { kind: 'search', title: 'Documents' },
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

/** Newest first, and a rerun of the same tool call replaces its old panel. */
export function mergePanel(panels: Panel[], next: Panel): Panel[] {
  return [next, ...panels.filter((p) => p.id !== next.id)];
}
