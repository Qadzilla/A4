// ── Types ──

export interface CategorizationRule {
  id: string;
  pattern: string;
  categoryId: string;
}

export interface CategorizedTransaction {
  description: string;
  categoryId: string | null;
}

export interface ColumnMapping {
  date: number | null;
  description: number | null;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  category: number | null;
  type: number | null;
}

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  categoryId: string | null;
}

// ── Category suggestion ──

export function suggestCategory(
  description: string,
  rules: CategorizationRule[],
  history: CategorizedTransaction[],
): string | null {
  const normalized = description.toLowerCase().trim();
  if (!normalized) return null;

  // 1. Check rules (first match wins)
  for (const rule of rules) {
    if (normalized.includes(rule.pattern.toLowerCase())) {
      return rule.categoryId;
    }
  }

  // 2. Fall back to history matching (exact description match)
  for (const tx of history) {
    if (tx.categoryId && tx.description.toLowerCase().trim() === normalized) {
      return tx.categoryId;
    }
  }

  return null;
}

export function suggestCategoriesForBatch(
  descriptions: string[],
  rules: CategorizationRule[],
  history: CategorizedTransaction[],
): (string | null)[] {
  return descriptions.map((desc) => suggestCategory(desc, rules, history));
}

// ── Column mapping heuristics ──

const DATE_KEYWORDS = ['date', 'transaction date', 'posted', 'posting date', 'trans date'];
const DESCRIPTION_KEYWORDS = [
  'description',
  'memo',
  'payee',
  'merchant',
  'name',
  'details',
  'narrative',
];
const AMOUNT_KEYWORDS = ['amount', 'total', 'sum', 'value'];
const DEBIT_KEYWORDS = ['debit', 'withdrawal', 'charge', 'out'];
const CREDIT_KEYWORDS = ['credit', 'deposit', 'payment', 'in'];
const CATEGORY_KEYWORDS = ['category', 'type', 'class'];

function matchColumn(header: string, keywords: string[]): boolean {
  const h = header.toLowerCase().trim();
  return keywords.some((kw) => h === kw || h.includes(kw));
}

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    date: null,
    description: null,
    amount: null,
    debit: null,
    credit: null,
    category: null,
    type: null,
  };

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i] ?? '';
    if (mapping.date === null && matchColumn(h, DATE_KEYWORDS)) mapping.date = i;
    else if (mapping.description === null && matchColumn(h, DESCRIPTION_KEYWORDS))
      mapping.description = i;
    else if (mapping.amount === null && matchColumn(h, AMOUNT_KEYWORDS)) mapping.amount = i;
    else if (mapping.debit === null && matchColumn(h, DEBIT_KEYWORDS)) mapping.debit = i;
    else if (mapping.credit === null && matchColumn(h, CREDIT_KEYWORDS)) mapping.credit = i;
    else if (mapping.category === null && matchColumn(h, CATEGORY_KEYWORDS)) mapping.category = i;
  }

  return mapping;
}

// ── Date parsing ──

export function parseDateFlexible(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // YYYY-MM-DD (ISO)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return formatDate(Number(y), Number(m), Number(d));
  }

  // MM/DD/YYYY or M/D/YYYY or MM-DD-YYYY
  const usMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (usMatch) {
    const [, a, b, y] = usMatch;
    return disambiguateDate(Number(a), Number(b), Number(y));
  }

  // M/D/YY or MM/DD/YY
  const shortYearMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (shortYearMatch) {
    const [, a, b, yy] = shortYearMatch;
    const year = Number(yy) + (Number(yy) > 50 ? 1900 : 2000);
    return disambiguateDate(Number(a), Number(b), year);
  }

  return null;
}

function disambiguateDate(a: number, b: number, year: number): string | null {
  // If either > 12, it's unambiguous
  if (a > 12 && b <= 12) {
    // a is day, b is month (DD/MM/YYYY)
    return formatDate(year, b, a);
  }
  // Default: MM/DD/YYYY (US convention)
  return formatDate(year, a, b);
}

function formatDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── Row mapping ──

export function mapRowToTransaction(
  row: string[],
  mapping: ColumnMapping,
  defaultType: 'income' | 'expense',
): ParsedTransaction | { error: string } {
  // Date
  const dateRaw = mapping.date !== null ? row[mapping.date] : undefined;
  if (!dateRaw?.trim()) return { error: 'Missing date' };
  const date = parseDateFlexible(dateRaw);
  if (!date) return { error: `Invalid date: ${dateRaw}` };

  // Description
  const description = mapping.description !== null ? (row[mapping.description] ?? '').trim() : '';
  if (!description) return { error: 'Missing description' };

  // Amount + type
  let amount: number;
  let type: 'income' | 'expense';

  if (mapping.amount !== null) {
    // Single amount column
    const raw = (row[mapping.amount] ?? '').replace(/[$,\s]/g, '');
    const parsed = Number.parseFloat(raw);
    if (Number.isNaN(parsed)) return { error: `Invalid amount: ${row[mapping.amount]}` };
    amount = Math.abs(parsed);
    type = parsed < 0 ? 'expense' : defaultType;
  } else if (mapping.debit !== null || mapping.credit !== null) {
    // Separate debit/credit columns
    const debitRaw =
      mapping.debit !== null ? (row[mapping.debit] ?? '').replace(/[$,\s]/g, '') : '';
    const creditRaw =
      mapping.credit !== null ? (row[mapping.credit] ?? '').replace(/[$,\s]/g, '') : '';
    const debitVal = debitRaw ? Math.abs(Number.parseFloat(debitRaw)) : 0;
    const creditVal = creditRaw ? Math.abs(Number.parseFloat(creditRaw)) : 0;

    if (Number.isNaN(debitVal) && Number.isNaN(creditVal)) return { error: 'Invalid debit/credit' };

    if (creditVal > 0) {
      amount = creditVal;
      type = 'income';
    } else if (debitVal > 0) {
      amount = debitVal;
      type = 'expense';
    } else {
      return { error: 'No amount found' };
    }
  } else {
    return { error: 'No amount column mapped' };
  }

  return { date, description, amount, type, categoryId: null };
}
