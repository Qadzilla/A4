import type Database from 'better-sqlite3';

/**
 * Idempotent DDL for everything added after the last full `drizzle-kit push`
 * — drizzle push prompts interactively on this schema, so new tables/columns
 * are applied here at boot instead (same pattern as the FTS setup). This is
 * what makes a Railway redeploy onto an existing volume safe: the fresh-
 * volume path still gets the full schema from start.sh, and this fills the
 * gap for volumes that predate the Basis pivot.
 */
export function ensureLaunchSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS snaptrade_users (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, st_user_id TEXT NOT NULL,
      user_secret TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tax_profiles (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      tax_year INTEGER NOT NULL DEFAULT 2026, filing_status TEXT NOT NULL DEFAULT 'single',
      state_code TEXT NOT NULL DEFAULT '', w2_wages REAL NOT NULL DEFAULT 0,
      self_employment_income REAL NOT NULL DEFAULT 0, investment_income REAL NOT NULL DEFAULT 0,
      capital_gains_short REAL NOT NULL DEFAULT 0, capital_gains_long REAL NOT NULL DEFAULT 0,
      other_income REAL NOT NULL DEFAULT 0, retirement_401k REAL NOT NULL DEFAULT 0,
      traditional_ira REAL NOT NULL DEFAULT 0, hsa_contribution REAL NOT NULL DEFAULT 0,
      student_loan_interest REAL NOT NULL DEFAULT 0, deduction_type TEXT NOT NULL DEFAULT 'standard',
      salt_deduction REAL NOT NULL DEFAULT 0, mortgage_interest REAL NOT NULL DEFAULT 0,
      charitable_giving REAL NOT NULL DEFAULT 0, other_itemized REAL NOT NULL DEFAULT 0,
      num_dependent_children INTEGER NOT NULL DEFAULT 0, other_credits REAL NOT NULL DEFAULT 0,
      federal_withheld REAL NOT NULL DEFAULT 0, state_withheld REAL NOT NULL DEFAULT 0,
      estimated_payments REAL NOT NULL DEFAULT 0, prior_year_tax REAL, prior_year_agi REAL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      symbol TEXT NOT NULL, side TEXT NOT NULL, trade_date TEXT NOT NULL,
      units REAL NOT NULL, price REAL NOT NULL, fees REAL NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual', external_id TEXT UNIQUE,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tax_1099s (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      file_id TEXT NOT NULL UNIQUE, tax_year INTEGER NOT NULL, broker TEXT,
      payload TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);

  // holdings gained three nullable columns in P3 — ALTER only when missing
  const holdingsExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='holdings'")
    .get();
  if (holdingsExists) {
    const columns = new Set(
      (sqlite.prepare('PRAGMA table_info(holdings)').all() as Array<{ name: string }>).map(
        (c) => c.name,
      ),
    );
    if (!columns.has('quantity')) sqlite.exec('ALTER TABLE holdings ADD COLUMN quantity REAL');
    if (!columns.has('cost_basis')) sqlite.exec('ALTER TABLE holdings ADD COLUMN cost_basis REAL');
    if (!columns.has('acquired_at')) {
      sqlite.exec('ALTER TABLE holdings ADD COLUMN acquired_at TEXT');
    }
  }
}
