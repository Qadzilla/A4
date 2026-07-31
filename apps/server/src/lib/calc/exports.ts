// ─── Exports ───────────────────────────────────────────────────────
// Turning what Basis computed into paper you can hand to someone else.
// Pure string building: no database, no formatting opinions beyond what the
// destination needs. CSV because it opens in every spreadsheet and every tax
// package; a PDF can wrap these once the columns settle.

import type { RealizedSale } from './lots';

/** RFC 4180: quote anything containing a comma, quote or newline. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: (string | number | null)[][]): string {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

/** Two decimals, no thousands separators — spreadsheets want a number. */
function money(n: number): string {
  return n.toFixed(2);
}

export interface Form8949Row {
  description: string;
  acquired: string;
  sold: string;
  proceeds: number;
  basis: number;
  code: string;
  adjustment: number | null;
  gain: number;
  term: 'short' | 'long';
}

/**
 * Form 8949 worksheet — one row per sale, in the form's own column order.
 *
 * This is a worksheet, not a filing: it gives a preparer (or you) the figures
 * in the shape the form expects. Wash sales carry code W and the disallowed
 * amount as the adjustment, which is how the form wants them. Sales with no
 * matched basis are excluded rather than reported as zero-basis, because
 * guessing here would overstate the gain.
 */
export function buildForm8949Rows(sales: RealizedSale[]): Form8949Row[] {
  return (
    sales
      .filter((s) => s.units > 0)
      .map((s) => ({
        description: `${s.units} sh. ${s.symbol}`,
        acquired: s.acquiredAt ?? '',
        sold: s.saleDate,
        proceeds: s.proceeds,
        basis: s.basis,
        code: s.washDisallowed > 0 ? 'W' : '',
        adjustment: s.washDisallowed > 0 ? s.washDisallowed : null,
        gain: s.gain + s.washDisallowed,
        term: s.term,
      }))
      // Short-term first, then long — the order of Parts I and II on the form
      .sort((a, b) =>
        a.term === b.term ? a.sold.localeCompare(b.sold) : a.term === 'short' ? -1 : 1,
      )
  );
}

export function form8949Csv(sales: RealizedSale[], taxYear: number): string {
  const rows = buildForm8949Rows(sales);
  const header: (string | number | null)[][] = [
    [`Form 8949 worksheet — tax year ${taxYear}`],
    ['Prepared by Basis from your trade history. Educational estimate, not a filing.'],
    [],
    [
      '(a) Description of property',
      '(b) Date acquired',
      '(c) Date sold or disposed',
      '(d) Proceeds',
      '(e) Cost or other basis',
      '(f) Code',
      '(g) Amount of adjustment',
      '(h) Gain or (loss)',
      'Term',
    ],
  ];

  const body = rows.map((r) => [
    r.description,
    r.acquired,
    r.sold,
    money(r.proceeds),
    money(r.basis),
    r.code,
    r.adjustment === null ? '' : money(r.adjustment),
    money(r.gain),
    r.term === 'short' ? 'Short-term' : 'Long-term',
  ]);

  const shortTotal = rows.filter((r) => r.term === 'short').reduce((s, r) => s + r.gain, 0);
  const longTotal = rows.filter((r) => r.term === 'long').reduce((s, r) => s + r.gain, 0);
  const totals: (string | number | null)[][] = [
    [],
    ['Short-term total', '', '', '', '', '', '', money(shortTotal)],
    ['Long-term total', '', '', '', '', '', '', money(longTotal)],
  ];

  return toCsv([...header, ...body, ...totals]);
}

export interface BasisHolding {
  symbol: string;
  name: string;
  quantity: number | null;
  costBasis: number | null;
  acquiredAt: string | null;
  value: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LONG_TERM_DAYS = 365;

/**
 * Cost-basis report — what you hold, what you paid, and where each position
 * sits relative to the one-year line. Positions whose basis was never
 * reported say so rather than showing a zero.
 */
export function costBasisCsv(holdings: BasisHolding[], today = new Date()): string {
  const rows: (string | number | null)[][] = [
    ['Cost basis report'],
    [`As of ${today.toISOString().slice(0, 10)}. Prepared by Basis. Educational estimate.`],
    [],
    [
      'Symbol',
      'Name',
      'Quantity',
      'Cost basis',
      'Date acquired',
      'Current value',
      'Unrealized gain/(loss)',
      'Term',
      'Days to long-term',
    ],
  ];

  for (const h of holdings) {
    const known = h.costBasis !== null && h.costBasis > 0;
    let term = '';
    let daysToLong: string | number = '';
    if (h.acquiredAt) {
      const heldDays = Math.floor(
        (today.getTime() - new Date(`${h.acquiredAt}T00:00:00Z`).getTime()) / DAY_MS,
      );
      const isLong = heldDays > LONG_TERM_DAYS;
      term = isLong ? 'Long-term' : 'Short-term';
      daysToLong = isLong ? 0 : LONG_TERM_DAYS + 1 - heldDays;
    }

    rows.push([
      h.symbol,
      h.name,
      h.quantity === null ? '' : h.quantity,
      known ? money(h.costBasis as number) : 'NOT REPORTED',
      h.acquiredAt ?? '',
      money(h.value),
      known ? money(h.value - (h.costBasis as number)) : '',
      term,
      daysToLong,
    ]);
  }

  const covered = holdings.filter((h) => h.costBasis !== null && h.costBasis > 0);
  const unrealized = covered.reduce((s, h) => s + (h.value - (h.costBasis as number)), 0);
  rows.push(
    [],
    [`Positions with a known basis: ${covered.length} of ${holdings.length}`],
    ['Unrealized on those positions', '', '', '', '', '', money(unrealized)],
  );

  return toCsv(rows);
}
