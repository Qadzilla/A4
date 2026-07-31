import { describe, expect, it } from 'vitest';
import { mergePanel, panelFromToolResult } from '../panel';

/**
 * What is allowed onto the desk, and what counts as the same thing twice.
 *
 * The desk had twenty-five panels on it, ten of them pre-trade checks and six
 * of those unable to compute anything. Both halves of that are covered here:
 * results with nothing in them never become panels, and a second look at the
 * same subject replaces the first rather than parking beside it.
 */

const lots = (symbol: string, hasLots: boolean) => ({
  available: true,
  symbol,
  lots: hasLots ? [{ units: 5, acquiredAt: '2026-01-15' }] : [],
  estimatedGain: hasLots ? { total: 438 } : { note: 'Gain cannot be estimated' },
});

describe('panelFromToolResult', () => {
  it('drops a pre-trade check that has no lot history to work from', () => {
    expect(panelFromToolResult('pre_trade_check', 'call-1', lots('VTI', false))).toBeNull();
  });

  it('keeps a pre-trade check that could actually compute something', () => {
    const panel = panelFromToolResult('pre_trade_check', 'call-1', lots('NVDA', true));
    expect(panel).not.toBeNull();
    expect(panel?.subtitle).toBe('NVDA');
  });

  it('identifies a pre-trade check by its symbol, not by the call', () => {
    const first = panelFromToolResult('pre_trade_check', 'call-1', lots('NVDA', true));
    const second = panelFromToolResult('pre_trade_check', 'call-2', lots('NVDA', true));
    expect(first?.id).toBe(second?.id);
    expect(first?.id).toBe('lots:NVDA');
  });

  it('keeps different symbols apart', () => {
    const nvda = panelFromToolResult('pre_trade_check', 'a', lots('NVDA', true));
    const voo = panelFromToolResult('pre_trade_check', 'b', lots('VOO', true));
    expect(nvda?.id).not.toBe(voo?.id);
  });

  it('treats every look at the tax picture as one panel', () => {
    const a = panelFromToolResult('get_tax_picture', 'a', { hasProfile: true, result: {} });
    const b = panelFromToolResult('get_tax_picture', 'b', { hasProfile: true, result: {} });
    expect(a?.id).toBe(b?.id);
  });

  it('drops a tax picture when there is no profile behind it', () => {
    expect(panelFromToolResult('get_tax_picture', 'a', { hasProfile: false })).toBeNull();
  });

  it('identifies a generated answer by what it answers', () => {
    const first = panelFromToolResult('show_on_desk', 'a', {
      available: true,
      title: 'Where your income lands',
      html: '<div class="card">x</div>',
    });
    const again = panelFromToolResult('show_on_desk', 'b', {
      available: true,
      title: 'Where your income lands',
      html: '<div class="card">y</div>',
    });
    expect(first?.id).toBe(again?.id);
    expect(first?.id).toBe('generated:where-your-income-lands');
  });

  it('drops a generated answer that carries no markup', () => {
    expect(
      panelFromToolResult('show_on_desk', 'a', { available: true, title: 'Empty', html: '' }),
    ).toBeNull();
  });

  it('still drops anything the tool reported as unavailable', () => {
    expect(
      panelFromToolResult('benchmark_comparison', 'a', { available: false, reason: 'no basis' }),
    ).toBeNull();
  });

  it('falls back to the call id when the subject cannot be named', () => {
    const panel = panelFromToolResult('search_documents', 'call-9', { results: [{ id: '1' }] });
    expect(panel?.id).toBe('call-9');
  });
});

describe('mergePanel', () => {
  it('replaces rather than accumulates when the subject repeats', () => {
    const first = panelFromToolResult('pre_trade_check', 'a', lots('NVDA', true));
    const second = panelFromToolResult('pre_trade_check', 'b', lots('NVDA', true));
    if (!first || !second) throw new Error('expected both panels');

    const desk = mergePanel(mergePanel([], first), second);
    expect(desk).toHaveLength(1);
  });

  /**
   * The shape that made the mess: one question asking about every position
   * fans out into a tool call per symbol. Six of nine had no cost basis.
   */
  it('leaves three panels for a nine-position sweep where six had no basis', () => {
    const symbols = ['VTI', 'VXUS', 'BND', 'AAPL', 'MSFT', 'DOGE', 'NVDA', 'VOO', 'TSLA'];
    const computable = new Set(['NVDA', 'VOO', 'TSLA']);
    let desk = [] as ReturnType<typeof mergePanel>;
    symbols.forEach((symbol, i) => {
      const panel = panelFromToolResult(
        'pre_trade_check',
        `call-${i}`,
        lots(symbol, computable.has(symbol)),
      );
      if (panel) desk = mergePanel(desk, panel);
    });
    expect(desk).toHaveLength(3);
  });
});
