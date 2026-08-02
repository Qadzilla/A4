import { blob, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  userId: text('user_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  thumbnail: text('thumbnail'),
  type: text('type').notNull().default('workspace'),
  parentId: text('parent_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
});

// Cached daily/historical bars from Polygon.io
export const marketBars = sqliteTable(
  'market_bars',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    symbol: text('symbol').notNull(),
    timespan: text('timespan').notNull(),
    multiplier: integer('multiplier').notNull(),
    timestamp: integer('timestamp').notNull(),
    open: real('open').notNull(),
    high: real('high').notNull(),
    low: real('low').notNull(),
    close: real('close').notNull(),
    volume: real('volume').notNull(),
    vwap: real('vwap'),
    transactions: integer('transactions'),
    cachedAt: integer('cached_at').notNull(),
  },
  (table) => [
    uniqueIndex('market_bars_unique').on(
      table.symbol,
      table.timespan,
      table.multiplier,
      table.timestamp,
    ),
  ],
);

// Uploaded files metadata
export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  workspaceId: text('workspace_id').notNull(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  extension: text('extension').notNull(),
  storagePath: text('storage_path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Shared categories for financial cards (ledger, receipt, subscription, budget)
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  type: text('type').notNull(), // 'income' | 'expense' | 'both'
  context: text('context').notNull().default('ledger'), // 'ledger' | 'receipt' | 'subscription'
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Financial transactions (unified ledger entries)
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  description: text('description').notNull(),
  amount: real('amount').notNull(),
  type: text('type').notNull(), // 'income' | 'expense'
  categoryId: text('category_id'), // FK to categories.id (nullable)
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Account groups (color-coded groupings for accounts)
export const accountGroups = sqliteTable('account_groups', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Financial accounts (checking, savings, credit card, etc.)
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  institution: text('institution').notNull(),
  type: text('type').notNull(), // AccountType enum
  balance: real('balance').notNull(),
  groupId: text('group_id'), // FK to account_groups.id (nullable)
  lastUpdated: text('last_updated'), // YYYY-MM-DD
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Cached ticker metadata from Polygon.io
export const tickerDetails = sqliteTable('ticker_details', {
  symbol: text('symbol').primaryKey(),
  name: text('name').notNull(),
  market: text('market').notNull(),
  type: text('type'),
  currencyName: text('currency_name'),
  active: integer('active', { mode: 'boolean' }).default(true),
  logoUrl: text('logo_url'),
  cachedAt: integer('cached_at').notNull(),
});

// Portfolio holdings (workspace-level)
export const holdings = sqliteTable('holdings', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  value: real('value').notNull(),
  targetPct: real('target_pct').notNull(),
  quantity: real('quantity'), // shares/units, when known (statement import)
  costBasis: real('cost_basis'), // total cost of the position, when known
  acquiredAt: text('acquired_at'), // YYYY-MM-DD acquisition date, when known — powers the benchmark
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Security trades (buys/sells) — the raw material for the realized-gains
// ledger. Sourced from SnapTrade activities sync (externalId dedups) or
// manual entry; the lot engine in lib/calc/lots.ts does the matching.
export const trades = sqliteTable('trades', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  symbol: text('symbol').notNull(),
  side: text('side').notNull(), // 'buy' | 'sell'
  tradeDate: text('trade_date').notNull(), // YYYY-MM-DD
  units: real('units').notNull(),
  price: real('price').notNull(), // per-unit
  fees: real('fees').notNull().default(0),
  source: text('source').notNull().default('manual'), // 'snaptrade' | 'manual'
  externalId: text('external_id').unique(), // brokerage activity id, for dedup
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Extracted 1099-B forms — one row per uploaded form, payload holds the
// per-security rows as JSON (Extracted1099 shape from lib/calc/reconcile).
export const tax1099s = sqliteTable('tax_1099s', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  fileId: text('file_id').notNull().unique(),
  taxYear: integer('tax_year').notNull(),
  broker: text('broker'),
  payload: text('payload').notNull(), // JSON: Extracted1099
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Year-round tax profile — the inputs to the tax meter, one row per
// user+workspace. Field names mirror TaxEstimatorData in lib/calc.
export const taxProfiles = sqliteTable('tax_profiles', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  taxYear: integer('tax_year').notNull().default(2026),
  filingStatus: text('filing_status').notNull().default('single'),
  stateCode: text('state_code').notNull().default(''),
  w2Wages: real('w2_wages').notNull().default(0),
  selfEmploymentIncome: real('self_employment_income').notNull().default(0),
  investmentIncome: real('investment_income').notNull().default(0),
  capitalGainsShort: real('capital_gains_short').notNull().default(0),
  capitalGainsLong: real('capital_gains_long').notNull().default(0),
  otherIncome: real('other_income').notNull().default(0),
  retirement401k: real('retirement_401k').notNull().default(0),
  traditionalIRA: real('traditional_ira').notNull().default(0),
  hsaContribution: real('hsa_contribution').notNull().default(0),
  studentLoanInterest: real('student_loan_interest').notNull().default(0),
  deductionType: text('deduction_type').notNull().default('standard'),
  saltDeduction: real('salt_deduction').notNull().default(0),
  mortgageInterest: real('mortgage_interest').notNull().default(0),
  charitableGiving: real('charitable_giving').notNull().default(0),
  otherItemized: real('other_itemized').notNull().default(0),
  numDependentChildren: integer('num_dependent_children').notNull().default(0),
  otherCredits: real('other_credits').notNull().default(0),
  federalWithheld: real('federal_withheld').notNull().default(0),
  stateWithheld: real('state_withheld').notNull().default(0),
  estimatedPayments: real('estimated_payments').notNull().default(0),
  priorYearTax: real('prior_year_tax'),
  priorYearAgi: real('prior_year_agi'),
  // B2: the two facts the kiddie-tax guard turns on. Nullable — unknown is
  // a state the guard handles, never a default.
  birthDate: text('birth_date'),
  fullTimeStudent: integer('full_time_student', { mode: 'boolean' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// SnapTrade brokerage-connection identity: one row per A4 user who has
// registered with SnapTrade. The userSecret is required for every SnapTrade
// API call on that user's behalf — treat it like a credential.
export const snaptradeUsers = sqliteTable('snaptrade_users', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().unique(),
  stUserId: text('st_user_id').notNull(), // the id we registered with SnapTrade
  userSecret: text('user_secret').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Categorization rules for auto-assigning categories during import
export const categorizationRules = sqliteTable('categorization_rules', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  pattern: text('pattern').notNull(), // case-insensitive substring match
  categoryId: text('category_id').notNull(), // FK to categories
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Chat conversations (workspace-scoped)
/**
 * What a conversation leaves on the workspace. One row per panel, keyed by
 * the tool call that produced it so a rerun replaces rather than duplicates.
 *
 * `payload` is the tool's raw JSON result and `payloadVersion` says which
 * shape it was written in — the renderers read defensively, so an old payload
 * degrades to a thinner panel instead of breaking, and a future change to a
 * tool's return type can be migrated or ignored per version rather than
 * silently rendering wrong.
 */
export const workspacePanels = sqliteTable('workspace_panels', {
  id: text('id').primaryKey(),
  // Panels belong to a desk — a workspace and a tax year — not to whichever
  // conversation happened to produce them. Someone assembling a year over
  // weeks should come back to the desk they left, not an empty canvas.
  taxYear: integer('tax_year').notNull(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  payload: text('payload').notNull(), // JSON
  payloadVersion: integer('payload_version').notNull().default(1),
  // Fractional, so a panel can be dropped between two others without renumbering
  position: real('position').notNull().default(0),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  // Where it sits on the desk. Null means never placed — the canvas packs
  // those into free space on first sight and writes the result back, so a
  // panel made before the canvas existed still lands somewhere sensible.
  // Height is deliberately not stored: these panels are vertical-flow content
  // and size to what they contain, so width is the only dimension worth
  // arguing with.
  x: real('x'),
  y: real('y'),
  w: real('w'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * One extracted W-2 per uploaded file. The payload is every box as printed —
 * extraction never reconciles box 1 against box 3 or fills a blank. Facts
 * are asserted from the LIVE set of these rows (a W-2c replaces its
 * predecessor by employer EIN + year; duplicates surface as contradictions).
 */
export const w2Forms = sqliteTable('w2_forms', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  fileId: text('file_id').notNull().unique(),
  taxYear: integer('tax_year').notNull(),
  employerName: text('employer_name'),
  employerEin: text('employer_ein'),
  corrected: integer('corrected', { mode: 'boolean' }).notNull().default(false),
  payload: text('payload').notNull(), // JSON: ExtractedW2
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * One extracted 1099-NEC or 1099-K per uploaded file. Same discipline as
 * w2_forms: the payload is every box as printed, a K form's box 1a is gross
 * receipts and is never treated as income here, and facts are asserted from
 * the LIVE set (corrected forms replace by payer TIN + kind + year;
 * duplicates surface as contradictions).
 */
export const incomeForms = sqliteTable('income_forms', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  fileId: text('file_id').notNull().unique(),
  kind: text('kind').notNull(), // '1099-NEC' | '1099-K'
  taxYear: integer('tax_year').notNull(),
  payerName: text('payer_name'),
  payerTin: text('payer_tin'),
  corrected: integer('corrected', { mode: 'boolean' }).notNull().default(false),
  payload: text('payload').notNull(), // JSON: ExtractedIncomeForm
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * One extracted consolidated 1099 (or standalone 1099-B/-DIV/-INT) per
 * uploaded file: dividend and interest totals as printed, plus lot-level
 * sale rows with dates and the 8949 category, which flow into the trades
 * table as document-sourced trades. Distinct from tax_1099s, which stores
 * per-security TOTALS for the reconciliation check — this table is where
 * the numbers themselves come from.
 */
export const investmentForms = sqliteTable('investment_forms', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  fileId: text('file_id').notNull().unique(),
  taxYear: integer('tax_year').notNull(),
  broker: text('broker'),
  brokerTin: text('broker_tin'),
  corrected: integer('corrected', { mode: 'boolean' }).notNull().default(false),
  payload: text('payload').notNull(), // JSON: ExtractedInvestmentForms
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * One extracted 1098-T, 1098-E or 1095-A per uploaded file. The 1095-A
 * payload keeps the monthly table with full fidelity — twelve rows of
 * premium / SLCSP / advance credit, printed zeros distinct from blanks —
 * because D3 reconciles month-wise, never from sums.
 */
export const educationHealthForms = sqliteTable('education_health_forms', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  fileId: text('file_id').notNull().unique(),
  kind: text('kind').notNull(), // '1098-T' | '1098-E' | '1095-A'
  taxYear: integer('tax_year').notNull(),
  issuerName: text('issuer_name'),
  issuerTin: text('issuer_tin'),
  corrected: integer('corrected', { mode: 'boolean' }).notNull().default(false),
  payload: text('payload').notNull(), // JSON: ExtractedEducationHealthForm
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * One extracted 1099-R, 1099-G or W-2G per uploaded file — the three
 * documents that ambush this audience: the job-change 401(k) cashout,
 * taxable unemployment, and winnings that are taxable even in a losing
 * year. The 1099-R's box 7 codes drive everything downstream.
 */
export const benefitForms = sqliteTable('benefit_forms', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  fileId: text('file_id').notNull().unique(),
  kind: text('kind').notNull(), // '1099-R' | '1099-G' | 'W-2G'
  taxYear: integer('tax_year').notNull(),
  payerName: text('payer_name'),
  payerTin: text('payer_tin'),
  corrected: integer('corrected', { mode: 'boolean' }).notNull().default(false),
  payload: text('payload').notNull(), // JSON: ExtractedBenefitForm
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * The A1 fact model, persisted: append-only assertions with provenance and
 * supersession. C1 brings the table forward (G1 adds the router and intake
 * on top); the shape mirrors lib/calc/filing/facts.ts exactly, and every
 * read goes back through that module's algebra.
 */
export const factAssertions = sqliteTable('fact_assertions', {
  assertionId: text('assertion_id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  factId: text('fact_id').notNull(),
  taxYear: integer('tax_year').notNull(),
  value: text('value').notNull(), // JSON: FactValue
  source: text('source').notNull(), // JSON: FactSource
  assertedAt: text('asserted_at').notNull(),
  supersedes: text('supersedes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  title: text('title'),
  model: text('model').notNull().default('claude-sonnet-4-6'),
  summary: text('summary'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Chat messages
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count'),
  model: text('model'),
  toolCalls: text('tool_calls'),
  toolCallId: text('tool_call_id'),
  citations: text('citations'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Document chunks for RAG embeddings
export const documentChunks = sqliteTable('document_chunks', {
  id: text('id').primaryKey(),
  fileId: text('file_id').notNull(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count').notNull(),
  embedding: blob('embedding', { mode: 'buffer' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Multimodal embeddings of rendered PDF pages (visual retrieval)
export const pageEmbeddings = sqliteTable('page_embeddings', {
  id: text('id').primaryKey(),
  fileId: text('file_id').notNull(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  page: integer('page').notNull(), // 1-based page number
  embedding: blob('embedding', { mode: 'buffer' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// AI usage tracking
export const aiUsage = sqliteTable('ai_usage', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  conversationId: text('conversation_id'),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  costCents: integer('cost_cents'),
  byok: integer('byok', { mode: 'boolean' }).notNull().default(false), // billed to the user's own key
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// User-supplied provider API keys (BYOK), AES-256-GCM encrypted at rest
export const userApiKeys = sqliteTable(
  'user_api_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    provider: text('provider').notNull(), // 'anthropic' | 'openai'
    encryptedKey: text('encrypted_key').notNull(),
    keyHint: text('key_hint').notNull(), // last 4 characters, for display only
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('user_api_keys_user_provider').on(table.userId, table.provider)],
);

// Personal access tokens for headless clients (MCP). Only a hash is stored —
// the raw token is shown once at creation.
export const personalAccessTokens = sqliteTable('personal_access_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  name: text('name').notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// User profiles (app-specific preferences; identity lives in Clerk)
export const userProfiles = sqliteTable('user_profiles', {
  userId: text('user_id').primaryKey(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  onboardingCompleted: integer('onboarding_completed', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Background jobs (entity extraction, page embeddings, and other async ingestion work)
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  payload: text('payload').notNull().default('{}'),
  status: text('status').notNull().default('pending'), // pending | running | done | failed
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  lastError: text('last_error'),
  runAfter: integer('run_after', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Resolved entities (merchants, institutions, people) across documents + financial data
export const entities = sqliteTable('entities', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(), // 'merchant' | 'institution' | 'person' | 'organization' | 'account_ref'
  canonicalName: text('canonical_name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  aliases: text('aliases').notNull().default('[]'), // JSON string[]
  mentionCount: integer('mention_count').notNull().default(0),
  rejectedMerges: text('rejected_merges').notNull().default('[]'), // JSON string[] of entity ids adjudicated as NOT the same
  mergedInto: text('merged_into'), // tombstone: id of the winner this entity was merged into

  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Where an entity appears (document chunk or structured financial row)
export const entityMentions = sqliteTable('entity_mentions', {
  id: text('id').primaryKey(),
  entityId: text('entity_id').notNull(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  sourceType: text('source_type').notNull(), // 'chunk' | 'transaction' | 'invoice' | 'receipt' | 'subscription' | 'account'
  sourceId: text('source_id').notNull(),
  snippet: text('snippet'),
  confidence: real('confidence').notNull(),
  amount: real('amount'), // dollar amount stated at the mention site, if any
  date: integer('date', { mode: 'timestamp' }), // date stated at the mention site, if any
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Relationships between entities, with mention ids as evidence
export const entityEdges = sqliteTable('entity_edges', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  fromEntityId: text('from_entity_id').notNull(),
  toEntityId: text('to_entity_id').notNull(),
  relationship: text('relationship').notNull(),
  evidence: text('evidence').notNull().default('[]'), // JSON string[] of mention ids
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Proactive insights
export const workspaceInsights = sqliteTable('workspace_insights', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  data: text('data'),
  status: text('status').notNull().default('active'),
  conversationId: text('conversation_id'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
});
