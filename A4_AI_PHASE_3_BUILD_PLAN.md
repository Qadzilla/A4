# A4 — AI Pipeline: Phase 3 Detailed Build Plan (RAG: AI Knows Your Documents)

> **Created:** 2026-03-14
> **Status:** Complete — BU-01 through BU-08 all done
> **Prerequisite:** Phase 2 complete — 24 tools registered, canvas mutations, calculation tools, tool activity UI all working.
> **Architecture reference:** [A4_AI_PIPELINE.md](./A4_AI_PIPELINE.md) — read this first for the full system design, SSE protocol, tool definitions, and privacy model. This document does not repeat that information; it breaks Phase 3 into executable build units.

---

## How to use this document

Each **build unit (BU)** is one coding session's worth of work. They are ordered by dependency — you cannot start a unit until its listed inputs are complete. Within a session, follow this workflow:

1. Read the BU description top to bottom
2. Create/modify the listed files
3. Run the listed tests — all must pass before moving on
4. Run the verification checks
5. Mark the BU as done in the completion checklist at the bottom

**Format of each BU:**

- **Goal** — one sentence describing the outcome
- **Inputs** — which prior BUs must be done first (or "None")
- **Creates / Modifies** — exact file paths affected
- **Description** — what to build, decisions already made, edge cases, constraints
- **Tests** — full specs: file path, `describe`/`it` blocks, assertions, setup/teardown
- **Verification** — manual and automated checks to confirm the unit works

**No code in this document.** All code decisions happen in coding sessions. This doc tells you *what* to build and *how to know it's correct*, not *how to write it*.

---

## Phase 3 goal

Every uploaded file becomes searchable knowledge. The AI answers questions grounded in the user's documents, with clickable citations that link back to source file cards on the canvas.

---

## Dependency graph

```
BU-01  document_chunks table + shared schemas
  │
  ├──→ BU-02  Server-side text extraction
  │      │
  │      └──→ BU-03  Chunking + embedding pipeline
  │             │
  │             ├──→ BU-04  Vector search + search_documents tool
  │             │      │
  │             │      └──→ BU-05  System prompt injection + query-time RAG
  │             │             │
  │             │             └──→ BU-07  Client-side citation rendering
  │             │
  │             └──→ BU-06  Incremental updates (re-embed on upload, delete on remove)
  │
  └──→ BU-08  E2E tests + polish (depends on BU-05, BU-06, BU-07)

Parallel-safe groups:
  - BU-04 + BU-06 can run in parallel (both depend on BU-03, no overlap)
```

---

## BU-01 — document_chunks table + shared schemas

**Goal:** Add the `document_chunks` table for storing text chunks with embedding blobs, add `OPENAI_API_KEY` env validation, extend citation schemas and SSE done event.

**Inputs:** None (Phase 2 complete)

**Creates / Modifies:**
- `apps/server/src/db/schema.ts` — add `documentChunks` table, add `citations` column to `messages` table
- `apps/server/src/env.ts` — add `OPENAI_API_KEY` to env schema
- `packages/shared-schemas/src/chat.ts` — add `citationSchema`, extend `sseEventSchema` done event with `citations` field
- `apps/server/src/__tests__/document-chunks-table.test.ts` — new test file
- `packages/shared-schemas/src/__tests__/chat-schemas.test.ts` — extend with citation tests

**Description:**

Add `documentChunks` table to `schema.ts`:
- `id`: text PK (UUID)
- `fileId`: text NOT NULL — logical FK to `files.id`
- `workspaceId`: text NOT NULL — denormalized for fast workspace-scoped queries
- `userId`: text NOT NULL — owner
- `chunkIndex`: integer NOT NULL — 0-based position within the source file
- `content`: text NOT NULL — the plain text of this chunk
- `tokenCount`: integer NOT NULL — approximate token count of this chunk
- `embedding`: blob NOT NULL — Float32Array as raw bytes (1536 × 4 = 6,144 bytes per chunk for text-embedding-3-small)
- `createdAt`: integer timestamp NOT NULL with default

Embedding storage decision: Use SQLite `blob` column (`sqliteTable` blob type from drizzle-orm). Store embeddings as raw `Float32Array` bytes — 6KB per chunk vs ~20KB as JSON text. Read back with `new Float32Array(buffer)`. This is the most space-efficient option for SQLite.

Add `citations` column to `messages` table:
- `citations`: text, nullable — JSON string of `Array<{ fileId, fileName, chunkContent, score }>`. Stored on assistant messages that used RAG. `null` for user messages and assistant messages without RAG.

Add `OPENAI_API_KEY` to `env.ts`:
- Optional in dev (`z.string().optional()`), required in production (`z.string().min(1, 'OPENAI_API_KEY is required for document embeddings')`).
- Follow the same pattern as `ANTHROPIC_API_KEY` (optional, graceful degradation when missing).

Add `citationSchema` to `chat.ts`:
```
citationSchema = z.object({
  index: z.number(),          // 1-based citation number as displayed to user
  fileId: z.string(),         // FK to files table
  fileName: z.string(),       // human-readable file name
  chunkContent: z.string(),   // the matched text chunk (for hover preview)
  score: z.number(),          // cosine similarity score (0-1)
})
```

Extend the `done` event in `sseEventSchema`:
- Add optional `citations` field: `z.array(citationSchema).optional()` — sent with the done event so the client can persist and render citations.

Decisions already made:
- No formal SQLite foreign keys — matches every other table in the codebase.
- `workspaceId` is denormalized on `documentChunks` to avoid a join through `files` on every search query. When a file is deleted, its chunks are deleted too, so staleness is not an issue.
- `embedding` as blob (not text) — binary is 3× more compact and avoids JSON parse overhead on read.
- Citations on the `done` event (not a separate SSE event) — simpler protocol, client already processes `done`.
- Citations stored on `messages` table for persistence — reloading the page should show citations, not just during streaming.

Edge cases:
- Existing messages have `citations` as null — backward compatible.
- `OPENAI_API_KEY` missing in dev → RAG features silently skip (no embedding, no search). Chat still works normally.

**Tests:**

File: `apps/server/src/__tests__/document-chunks-table.test.ts` (new)

Follow the exact pattern in existing table tests: in-memory SQLite via `better-sqlite3`, manual `CREATE TABLE` SQL in `beforeEach`, Drizzle ORM wrapper.

```
describe('documentChunks table')
  beforeEach — create fresh in-memory DB with documentChunks table

  it('inserts and retrieves a document chunk')
    - Create a Float32Array of 1536 floats with known values
    - Insert chunk with all fields populated including embedding as Buffer.from(float32Array.buffer)
    - Select by id
    - Assert all fields match: id, fileId, workspaceId, userId, chunkIndex, content, tokenCount, createdAt
    - Assert embedding can be read back as Float32Array with matching values

  it('retrieves all chunks for a file in order')
    - Insert 3 chunks for file-A with chunkIndex 0, 1, 2
    - Insert 1 chunk for file-B
    - Select where fileId='file-A' ORDER BY chunkIndex ASC
    - Assert exactly 3 results in correct order
    - Assert file-B chunk is not included

  it('retrieves chunks scoped by workspaceId')
    - Insert 2 chunks for workspace-A, 1 for workspace-B
    - Select where workspaceId='workspace-A'
    - Assert exactly 2 results

  it('deletes all chunks for a file')
    - Insert 3 chunks for file-A
    - Delete where fileId='file-A'
    - Select where fileId='file-A' → expect empty result set

  it('stores and reads back embedding blob correctly')
    - Create Float32Array with specific values: [0.1, -0.5, 0.0, 1.0, ...] (1536 elements)
    - Insert as Buffer.from(float32Array.buffer)
    - Read back, convert to Float32Array
    - Assert element-by-element equality (within floating point tolerance)

describe('messages table — citations column')
  beforeEach — in-memory DB with conversations and messages tables (include citations column)

  it('stores and retrieves citations JSON on assistant messages')
    - Insert message with citations='[{"index":1,"fileId":"f1","fileName":"bank.pdf","chunkContent":"Transaction...","score":0.92}]'
    - Select by id
    - Parse citations JSON
    - Assert array length 1, first citation has correct fields

  it('existing messages have null citations')
    - Insert message without citations field
    - Select by id
    - Assert citations is null
```

File: `packages/shared-schemas/src/__tests__/chat-schemas.test.ts` (extend existing)

```
describe('citationSchema')
  it('validates a valid citation')
    - Parse { index: 1, fileId: 'f-123', fileName: 'statement.pdf', chunkContent: 'The balance...', score: 0.89 }
    - Assert success

  it('rejects citation without required fields')
    - Parse { index: 1 } (missing fileId, fileName, etc.)
    - Assert failure

describe('sseEventSchema — done event with citations')
  it('validates done event with citations array')
    - Parse { type: 'done', usage: { inputTokens: 100, outputTokens: 50 }, citations: [{ index: 1, fileId: 'f1', fileName: 'a.pdf', chunkContent: '...', score: 0.9 }] }
    - Assert success, citations array preserved

  it('validates done event without citations (backward compatible)')
    - Parse { type: 'done', usage: { inputTokens: 100, outputTokens: 50 } }
    - Assert success, citations is undefined
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/document-chunks-table.test.ts` — all tests pass
- `pnpm vitest run packages/shared-schemas/src/__tests__/chat-schemas.test.ts` — all tests pass
- `pnpm typecheck` — no type errors across the monorepo

---

## BU-02 — Server-side text extraction

**Goal:** Create a service that extracts plain text from uploaded files (PDF, CSV, Excel, DOCX, TXT) using server-safe libraries.

**Inputs:** BU-01

**Creates / Modifies:**
- `apps/server/src/services/text-extraction.ts` — new file: `extractText(filePath, mimeType): Promise<string>`
- `apps/server/src/__tests__/text-extraction.test.ts` — new test file
- `apps/server/package.json` — add dependencies: `pdfjs-dist`, `mammoth`

**Description:**

Create `text-extraction.ts` with a single exported function:

`extractText(filePath: string, mimeType: string): Promise<string>`

Returns the full plain text content of the file. Dispatches by MIME type:

1. **PDF** (`application/pdf`): Use `pdfjs-dist` (Node.js build). Load the PDF, iterate all pages, call `page.getTextContent()`, join text items with spaces, pages with double newlines. Import from `pdfjs-dist/legacy/build/pdf.mjs` for Node compatibility (no canvas dependency needed — text extraction only, not rendering).

2. **CSV** (`text/csv`): Use `papaparse` (already a dependency in the monorepo — check). Parse the CSV, convert rows to a readable text format: header row as column names, then each data row as a line. Keep it simple — join cells with ` | ` separators so the text is readable in chunks.

3. **Excel** (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-excel`): Use `fflate` (already present for the client-side Excel parsing in `file-utils.ts`). Replicate the pattern from `apps/web/src/lib/file-utils.ts` `parseExcel()`: read the XLSX zip, extract `xl/sharedStrings.xml` and `xl/worksheets/sheet1.xml`, parse the XML to extract cell values. Convert to readable text same as CSV.

4. **DOCX** (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`): Use `mammoth`. Call `mammoth.extractRawText({ path: filePath })` which returns `{ value: string }`. Return the extracted text.

5. **Plain text** (`text/plain`): Read file with `fs.readFile(filePath, 'utf-8')`. Return as-is.

6. **Images** (`image/png`, `image/jpeg`, `image/webp`): Return empty string — no OCR for MVP. The file card shows the image visually; text extraction is not applicable.

7. **Unknown MIME types**: Return empty string with a console.warn. Do not throw — graceful degradation.

Error handling:
- Wrap each extraction in try/catch. On failure, log the error and return empty string. A failed extraction should never block file upload or crash the embedding pipeline.
- Large file guard: If the file is larger than 10MB, skip extraction and return empty string (this matches the upload limit, but acts as a safety net).

Dependencies to add:
- `pdfjs-dist`: Already used client-side for PDF preview. The Node.js build works without canvas for text-only extraction.
- `mammoth`: Lightweight DOCX-to-text. ~200KB, no native dependencies.
- `papaparse`: Check if already in `apps/server/package.json`. If not, add it. Already used in the web app for CSV parsing.
- `fflate`: Check if already in `apps/server/package.json`. Already used in the web app.

Decisions already made:
- Text extraction is a pure function — no DB access, no side effects. It reads a file path and returns text.
- No OCR — images return empty string. OCR is a future enhancement (Phase 4+).
- Excel extraction covers sheet 1 only (matching client-side behavior). Multi-sheet support is a future enhancement.
- CSV/Excel output format: pipe-separated values with headers. This is more token-efficient than JSON and more readable in chunks.

Edge cases:
- Empty PDF (no pages) → return empty string.
- Password-protected PDF → pdfjs-dist throws → catch, return empty string, log warning.
- Malformed XLSX (missing sharedStrings.xml) → catch, return empty string.
- Binary file accidentally uploaded as text/plain → fs.readFile returns garbled text — acceptable, chunking/embedding handles it.
- Very large CSV (50k rows) → extract all text. The chunking layer handles splitting.

**Tests:**

File: `apps/server/src/__tests__/text-extraction.test.ts` (new)

Use real test fixture files. Create minimal fixtures in `apps/server/src/__tests__/fixtures/`:
- `test.txt` — 3 lines of plain text
- `test.csv` — 5 rows, 3 columns (header + 4 data rows)

For PDF/DOCX/XLSX, test with dynamically created minimal files OR mock the library calls. Since creating valid binary files in tests is complex, the recommended approach is:

```
describe('extractText')
  describe('plain text')
    it('extracts text from a .txt file')
      - Write a temp file with known content "Hello\nWorld\nTest"
      - Call extractText(tempPath, 'text/plain')
      - Assert result === "Hello\nWorld\nTest"

    it('returns empty string for empty .txt file')
      - Write empty temp file
      - Call extractText(tempPath, 'text/plain')
      - Assert result === ""

  describe('CSV')
    it('extracts readable text from a CSV file')
      - Write temp CSV: "Name,Amount,Date\nAlice,100,2024-01-01\nBob,200,2024-01-02"
      - Call extractText(tempPath, 'text/csv')
      - Assert result contains "Name" and "Alice" and "100"
      - Assert result contains pipe or separator format

    it('handles CSV with quoted fields containing commas')
      - Write temp CSV: 'Name,Desc\n"Smith, John","A, B, C"'
      - Call extractText(tempPath, 'text/csv')
      - Assert "Smith, John" appears in output

  describe('PDF')
    it('extracts text from a PDF file')
      - This test requires a real PDF fixture or mocked pdfjs-dist
      - If mocking: mock getDocument to return a fake page with getTextContent → items
      - Assert extracted text matches expected content

    it('returns empty string for extraction error')
      - Call extractText('/nonexistent/file.pdf', 'application/pdf')
      - Assert result === "" (graceful degradation, no throw)

  describe('DOCX')
    it('extracts text from a DOCX file')
      - If mocking: mock mammoth.extractRawText to return { value: 'Hello from Word' }
      - Assert result === 'Hello from Word'

  describe('Excel')
    it('extracts text from an XLSX file')
      - If mocking: mock fflate.unzipSync to return fake sheet XML
      - Assert result contains expected cell values

  describe('images')
    it('returns empty string for image files')
      - Call extractText('/some/image.png', 'image/png')
      - Assert result === ""

  describe('unknown types')
    it('returns empty string for unsupported MIME types')
      - Call extractText('/some/file.bin', 'application/octet-stream')
      - Assert result === ""

  describe('error handling')
    it('returns empty string when file read fails')
      - Call extractText('/nonexistent/path.txt', 'text/plain')
      - Assert result === "" (no throw)
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/text-extraction.test.ts` — all tests pass
- `pnpm typecheck` — no type errors
- Manual test: upload a real PDF via the UI, call `extractText` on the stored file path, verify meaningful text is returned

---

## BU-03 — Chunking + embedding pipeline

**Goal:** Create sentence-aware text chunking, an OpenAI embedding wrapper with batching/retry, and an orchestration pipeline that extracts text → chunks → embeds → stores in the database.

**Inputs:** BU-02

**Creates / Modifies:**
- `apps/server/src/services/chunking.ts` — new file: `chunkText(text, options): Chunk[]`
- `apps/server/src/services/embedding.ts` — new file: `embedTexts(texts): Promise<Float32Array[]>`
- `apps/server/src/services/embedding-pipeline.ts` — new file: `embedFile(fileId, db): Promise<void>`
- `apps/server/package.json` — add `openai` dependency
- `apps/server/src/__tests__/chunking.test.ts` — new test file
- `apps/server/src/__tests__/embedding.test.ts` — new test file
- `apps/server/src/__tests__/embedding-pipeline.test.ts` — new test file

**Description:**

**`chunking.ts`:**

Create `chunkText(text: string, options?: { maxTokens?: number; overlap?: number }): Array<{ content: string; tokenCount: number; chunkIndex: number }>`.

Algorithm (sentence-aware chunking):
1. Default `maxTokens = 500`, `overlap = 50`.
2. Split text into sentences using a regex: `/(?<=[.!?])\s+/` (split on sentence-ending punctuation followed by whitespace). This is a simple heuristic — not perfect for all text, but good enough for financial documents.
3. Accumulate sentences into chunks. For each sentence:
   - Estimate token count: `Math.ceil(text.length / 4)` (rough approximation — 1 token ≈ 4 chars for English text).
   - If adding the sentence would exceed `maxTokens`, finalize the current chunk and start a new one.
   - For overlap: when starting a new chunk, carry over the last N tokens worth of sentences from the previous chunk (where N = `overlap`). This ensures continuity across chunk boundaries.
4. Finalize the last chunk.
5. Return array of `{ content, tokenCount, chunkIndex }` where `chunkIndex` is 0-based.

Decisions already made:
- Token estimation uses `length / 4` — accurate enough for chunking purposes. Exact tokenization (tiktoken) is overkill and adds a heavy dependency.
- Sentence-splitting regex is simple. Financial documents (bank statements, invoices) have structured text that splits well on periods. Tables/CSV data may not have sentence boundaries — the chunking still works by splitting on any whitespace boundary when no sentence boundary is found within the limit.
- Overlap ensures a question about content near a chunk boundary still finds relevant text.

Edge cases:
- Empty text → return empty array.
- Text shorter than maxTokens → return single chunk.
- Single very long "sentence" (no periods, e.g., a long CSV row) → force-split at maxTokens boundary on whitespace.
- Text with no sentence boundaries at all → split on whitespace at maxTokens intervals.

**`embedding.ts`:**

Create `embedTexts(texts: string[]): Promise<Float32Array[]>`.

Uses OpenAI `text-embedding-3-small` model (1536 dimensions):
1. Import `OpenAI` from the `openai` package.
2. Initialize client with `env.OPENAI_API_KEY`.
3. Batch texts into groups of 100 (OpenAI's max batch size per request).
4. For each batch, call `openai.embeddings.create({ model: 'text-embedding-3-small', input: batch })`.
5. Convert each embedding (number[]) to `Float32Array` for storage.
6. Retry logic: on 429 (rate limit) or 5xx errors, retry up to 3 times with exponential backoff (1s, 2s, 4s).
7. Return array of Float32Array in the same order as input texts.

Also create `embedSingle(text: string): Promise<Float32Array>` — convenience wrapper for single text (used for query embedding at search time).

Guard: If `env.OPENAI_API_KEY` is not set, both functions throw a descriptive error: `'OPENAI_API_KEY not configured — cannot generate embeddings'`. The calling code (pipeline, search) catches this and skips RAG.

Decisions already made:
- `text-embedding-3-small` over `text-embedding-3-large`: 1536 dims is sufficient for document search. Half the cost, 3× faster, adequate quality for financial documents.
- Batch size of 100: OpenAI allows up to 2048 inputs per request, but 100 keeps individual requests fast and retries cheap.
- The `openai` npm package is the official SDK and handles auth, request formatting, and error types.

Edge cases:
- Empty texts array → return empty array (no API call).
- Text that exceeds OpenAI's 8191 token limit per input → the chunking layer prevents this (maxTokens=500), but if it somehow occurs, OpenAI truncates silently.
- Network error → retry with backoff. After 3 retries, throw (caller handles).

**`embedding-pipeline.ts`:**

Create `embedFile(fileId: string, db: DrizzleDB): Promise<{ chunksCreated: number }>`.

Orchestration:
1. Look up the file record from the `files` table by `fileId`. If not found, throw.
2. Resolve the file's storage path on disk.
3. Call `extractText(storagePath, mimeType)` from BU-02.
4. If extracted text is empty (image, unsupported, or extraction failed), return `{ chunksCreated: 0 }`.
5. Call `chunkText(extractedText)` to split into chunks.
6. If no chunks, return `{ chunksCreated: 0 }`.
7. Call `embedTexts(chunks.map(c => c.content))` to get embeddings.
8. Delete any existing chunks for this `fileId` (in case of re-embedding on file replace).
9. Insert all chunks into `documentChunks` table in a single transaction: for each chunk, store `{ id: uuid, fileId, workspaceId: file.workspaceId, userId: file.userId, chunkIndex, content, tokenCount, embedding: Buffer.from(embedding.buffer) }`.
10. Return `{ chunksCreated: chunks.length }`.

Decisions already made:
- Re-embedding deletes old chunks first (idempotent). This handles the "file replaced" case cleanly.
- Single transaction for all inserts — either all chunks are stored or none. Prevents partial embedding state.
- The pipeline is a standalone function, not a tRPC route. It's called from the file upload route (BU-06) and can be called manually for re-processing.

Edge cases:
- `embedTexts` throws (API key missing, network error) → let it propagate. The caller (file upload) catches and logs.
- File deleted between lookup and text extraction → `extractText` fails on missing file → returns empty string → pipeline returns 0 chunks.
- Very large file producing thousands of chunks → process all. The batching in `embedTexts` handles this efficiently.

**Tests:**

File: `apps/server/src/__tests__/chunking.test.ts` (new)

```
describe('chunkText')
  it('returns empty array for empty text')
    - chunkText('') → []

  it('returns single chunk for short text')
    - chunkText('Hello world. This is a test.') → 1 chunk
    - Assert chunk.content includes both sentences
    - Assert chunk.chunkIndex === 0

  it('splits long text into multiple chunks')
    - Create text with 20 sentences, each ~100 chars (~500 tokens total)
    - chunkText(text, { maxTokens: 200 })
    - Assert >= 2 chunks
    - Assert each chunk.tokenCount <= 200 (approximately)
    - Assert chunks are in order (chunkIndex 0, 1, 2...)

  it('preserves sentence boundaries')
    - Create text: "First sentence. Second sentence. Third sentence. Fourth sentence."
    - chunkText(text, { maxTokens: 30 })
    - Assert no chunk ends mid-sentence (each chunk content ends with a period or contains complete sentences)

  it('applies overlap between chunks')
    - Create text with 10 distinct sentences
    - chunkText(text, { maxTokens: 100, overlap: 30 })
    - Assert chunks > 1
    - Assert some content from end of chunk N appears at start of chunk N+1

  it('handles text with no sentence boundaries')
    - chunkText('word '.repeat(1000), { maxTokens: 100 })
    - Assert multiple chunks created
    - Assert no chunk exceeds maxTokens (approximately)

  it('handles single very long sentence')
    - chunkText('A'.repeat(4000), { maxTokens: 500 })
    - Assert multiple chunks (force-split)
    - Assert each chunk <= 500 estimated tokens

  it('assigns sequential chunkIndex values')
    - Create text that produces 5 chunks
    - Assert chunkIndex values are [0, 1, 2, 3, 4]
```

File: `apps/server/src/__tests__/embedding.test.ts` (new)

Mock the OpenAI SDK — do not make real API calls in tests.

```
describe('embedTexts')
  beforeEach — mock OpenAI embeddings.create to return fake embeddings

  it('returns Float32Array for each input text')
    - Mock returns [{ embedding: Array(1536).fill(0.1) }, { embedding: Array(1536).fill(0.2) }]
    - Call embedTexts(['hello', 'world'])
    - Assert result is array of 2 Float32Arrays
    - Assert each has length 1536

  it('returns empty array for empty input')
    - embedTexts([]) → []
    - Assert OpenAI API not called

  it('batches inputs exceeding batch size')
    - Create 150 texts
    - Mock returns matching embeddings
    - Call embedTexts(texts)
    - Assert OpenAI API called twice (batch of 100 + batch of 50)
    - Assert 150 Float32Arrays returned

  it('retries on rate limit error')
    - Mock first call to throw 429 error, second call succeeds
    - Call embedTexts(['test'])
    - Assert result returned successfully
    - Assert API called twice

  it('throws after max retries')
    - Mock all calls to throw 500 error
    - Call embedTexts(['test'])
    - Assert throws

  it('throws when OPENAI_API_KEY is not set')
    - Temporarily unset env.OPENAI_API_KEY
    - Call embedTexts(['test'])
    - Assert throws with descriptive message
    - Restore env

describe('embedSingle')
  it('returns a single Float32Array')
    - Mock returns one embedding
    - Call embedSingle('hello')
    - Assert Float32Array with length 1536
```

File: `apps/server/src/__tests__/embedding-pipeline.test.ts` (new)

Mock `extractText`, `chunkText`, `embedTexts` — test orchestration logic only.

```
describe('embedFile')
  beforeEach — in-memory DB with files and documentChunks tables, insert a test file record

  it('extracts, chunks, embeds, and stores chunks for a file')
    - Mock extractText → 'Some long document text...'
    - Mock chunkText → [{ content: 'chunk1', tokenCount: 50, chunkIndex: 0 }, { content: 'chunk2', tokenCount: 45, chunkIndex: 1 }]
    - Mock embedTexts → [Float32Array(1536), Float32Array(1536)]
    - Call embedFile(fileId, db)
    - Assert result.chunksCreated === 2
    - Query documentChunks table → assert 2 rows with correct fileId, content, chunkIndex, embedding

  it('returns 0 chunks for empty text extraction')
    - Mock extractText → ''
    - Call embedFile(fileId, db)
    - Assert result.chunksCreated === 0
    - Assert documentChunks table is empty

  it('deletes existing chunks before re-embedding')
    - Insert 3 existing chunks for this fileId
    - Mock extractText → 'New content'
    - Mock chunkText → [{ content: 'new chunk', tokenCount: 30, chunkIndex: 0 }]
    - Mock embedTexts → [Float32Array(1536)]
    - Call embedFile(fileId, db)
    - Assert result.chunksCreated === 1
    - Assert documentChunks table has exactly 1 row (old 3 deleted)

  it('throws when file not found in database')
    - Call embedFile('nonexistent-id', db)
    - Assert throws

  it('handles embedding API failure gracefully')
    - Mock extractText → 'Some text'
    - Mock chunkText → [{ content: 'chunk', tokenCount: 50, chunkIndex: 0 }]
    - Mock embedTexts → throws Error('API unavailable')
    - Call embedFile(fileId, db)
    - Assert throws (caller handles)
    - Assert documentChunks table is empty (transaction rolled back)
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/chunking.test.ts` — all tests pass
- `pnpm vitest run apps/server/src/__tests__/embedding.test.ts` — all tests pass
- `pnpm vitest run apps/server/src/__tests__/embedding-pipeline.test.ts` — all tests pass
- `pnpm typecheck` — no type errors
- Manual test: call `embedFile` on an existing file record, verify chunks appear in the DB with correct content and 6KB embedding blobs

---

## BU-04 — Vector search + search_documents tool

**Goal:** Create brute-force cosine similarity search over document chunks and register it as tool #25 in the AI tools registry.

**Inputs:** BU-03

**Creates / Modifies:**
- `apps/server/src/services/vector-search.ts` — new file: `searchChunks(query, workspaceId, db, options): Promise<SearchResult[]>`
- `apps/server/src/services/ai-tools.ts` — add `search_documents` tool definition and executor
- `apps/server/src/__tests__/vector-search.test.ts` — new test file
- `apps/server/src/__tests__/ai-tools.test.ts` — extend with search_documents tests

**Description:**

**`vector-search.ts`:**

Create `searchChunks(queryEmbedding: Float32Array, workspaceId: string, db: DrizzleDB, options?: { topK?: number; minScore?: number }): Promise<SearchResult[]>`.

Algorithm:
1. Default `topK = 5`, `minScore = 0.3`.
2. Load all `documentChunks` for the given `workspaceId` from the database. Select `id, fileId, content, chunkIndex, embedding`.
3. For each chunk, compute cosine similarity between `queryEmbedding` and the chunk's embedding:
   - `cosineSimilarity(a: Float32Array, b: Float32Array): number` — dot product divided by product of magnitudes.
   - `cos(a,b) = Σ(a_i × b_i) / (√Σ(a_i²) × √Σ(b_i²))`
4. Filter out results below `minScore`.
5. Sort by score descending.
6. Return top K results as `Array<{ chunkId, fileId, content, chunkIndex, score }>`.

Also create a convenience function:
`searchDocuments(query: string, workspaceId: string, db: DrizzleDB, options?: { topK?: number }): Promise<SearchResult[]>`
1. Call `embedSingle(query)` to get query embedding.
2. Call `searchChunks(queryEmbedding, workspaceId, db, options)`.
3. Join with `files` table to include `fileName` in results.
4. Return `Array<{ chunkId, fileId, fileName, content, chunkIndex, score }>`.

Performance: Brute-force is O(n) where n = total chunks in workspace. For a workspace with 100 documents × 20 chunks each = 2,000 chunks, computing 2,000 cosine similarities of 1536-dim vectors takes ~5ms in JavaScript. This scales to ~10k chunks before becoming noticeable. No indexing needed for MVP.

Decisions already made:
- Brute-force over ANN (approximate nearest neighbor) — simpler, no additional dependencies, adequate for expected scale.
- Load all workspace chunks into memory per search — SQLite reads are fast for this data size.
- `minScore = 0.3` filters out clearly irrelevant chunks while keeping potentially useful ones. The system prompt will use the top results regardless of whether they're perfect matches.

Edge cases:
- No chunks in workspace → return empty array (no error).
- All chunks below minScore → return empty array.
- `embedSingle` throws (no API key) → `searchDocuments` propagates the error.
- Chunk with zero-magnitude embedding (all zeros) → cosine similarity is NaN → filter it out.

**`search_documents` tool (tool #25):**

Add to the tool registry in `ai-tools.ts`:

Definition:
```
name: 'search_documents'
description: 'Search through uploaded documents in this workspace using semantic similarity. Returns relevant text passages from uploaded files (PDF, CSV, Excel, DOCX, TXT). Use this when the user asks about content in their files or when you need specific information from uploaded documents.'
input_schema: {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'The search query — describe what you are looking for in natural language' },
    topK: { type: 'number', description: 'Maximum number of results to return (default: 5)' }
  },
  required: ['query']
}
```

Executor:
1. Call `searchDocuments(input.query, context.workspaceId, context.db, { topK: input.topK })`.
2. If no results, return `{ results: [], message: 'No matching documents found. The workspace may not have any uploaded files, or no files match this query.' }`.
3. Return `{ results: results.map(r => ({ fileName: r.fileName, content: r.content, score: r.score, fileId: r.fileId })) }`.
4. Catch embedding errors (API key missing) → return `{ results: [], message: 'Document search is not available — embedding service not configured.' }`.

**Tests:**

File: `apps/server/src/__tests__/vector-search.test.ts` (new)

```
describe('cosineSimilarity')
  it('returns 1 for identical vectors')
    - Create two identical Float32Arrays
    - Assert cosineSimilarity(a, a) ≈ 1.0

  it('returns 0 for orthogonal vectors')
    - Create a = [1, 0, 0, ...], b = [0, 1, 0, ...]
    - Assert cosineSimilarity(a, b) ≈ 0.0

  it('returns -1 for opposite vectors')
    - Create a = [1, 0, 0, ...], b = [-1, 0, 0, ...]
    - Assert cosineSimilarity(a, b) ≈ -1.0

  it('handles zero-magnitude vector')
    - Create a = [0, 0, 0, ...], b = [1, 1, 1, ...]
    - Assert result is NaN or 0 (not crash)

describe('searchChunks')
  beforeEach — in-memory DB with documentChunks table, insert chunks with known embeddings

  it('returns chunks ranked by cosine similarity')
    - Insert 3 chunks with embeddings: one very similar to query, one somewhat similar, one dissimilar
    - searchChunks(queryEmbedding, workspaceId, db)
    - Assert results sorted by score descending
    - Assert most similar chunk is first

  it('respects topK limit')
    - Insert 10 chunks
    - searchChunks(query, wsId, db, { topK: 3 })
    - Assert exactly 3 results

  it('filters by minScore')
    - Insert chunks with known low-similarity embeddings
    - searchChunks(query, wsId, db, { minScore: 0.8 })
    - Assert only high-scoring chunks returned

  it('scopes search to workspace')
    - Insert chunks for workspace-A and workspace-B
    - searchChunks(query, 'workspace-A', db)
    - Assert only workspace-A chunks returned

  it('returns empty array when no chunks exist')
    - searchChunks(query, 'empty-workspace', db)
    - Assert result is []
```

File: `apps/server/src/__tests__/ai-tools.test.ts` (extend existing)

```
describe('search_documents')
  it('is registered as tool #25')
    - getToolDefinitions() includes a tool named 'search_documents'

  it('returns search results with fileName and content')
    - Mock searchDocuments to return 2 results
    - Execute tool with { query: 'dining expenses' }
    - Assert result.results has length 2
    - Assert each has fileName, content, score

  it('returns empty results when no documents match')
    - Mock searchDocuments to return []
    - Execute tool with { query: 'nonexistent topic' }
    - Assert result.results is [] and message present

  it('handles missing API key gracefully')
    - Mock searchDocuments to throw 'OPENAI_API_KEY not configured'
    - Execute tool with { query: 'test' }
    - Assert result contains graceful error message
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/vector-search.test.ts` — all tests pass
- `pnpm vitest run apps/server/src/__tests__/ai-tools.test.ts` — all tests pass (including new search_documents tests)
- `pnpm typecheck` — no type errors
- Tool count: `getToolDefinitions().length === 25`

---

## BU-05 — System prompt injection + query-time RAG

**Goal:** Automatically embed the user's message, search document chunks, inject relevant passages into the system prompt, and send citation data with the SSE done event.

**Inputs:** BU-04

**Creates / Modifies:**
- `apps/server/src/services/ai-context.ts` — add `buildDocumentContext(query, workspaceId, db): Promise<{ section: string; citations: Citation[] }>`
- `apps/server/src/routes/chat-stream.ts` — integrate RAG into the streaming pipeline, send citations in done event
- `apps/server/src/__tests__/ai-context.test.ts` — extend with document context tests
- `apps/server/src/__tests__/chat-stream.test.ts` — extend with RAG integration tests

**Description:**

**Modify `ai-context.ts`:**

Add a new function: `buildDocumentContext(query: string, workspaceId: string, db: DrizzleDB): Promise<{ section: string; citations: Citation[] }>`.

1. Call `searchDocuments(query, workspaceId, db, { topK: 5 })`.
2. If no results (empty array), return `{ section: '', citations: [] }`.
3. Group results by `fileId` (multiple chunks from the same file appear together).
4. Build a markdown section:
   ```
   ## Relevant Documents

   The following excerpts from the user's uploaded documents are relevant to this query. Cite them using [1], [2], etc. when referencing specific information.

   [1] bank-statement.pdf (relevance: 92%)
   > Transaction on 2024-01-15: Dining at Olive Garden, $45.00...

   [2] expenses.csv (relevance: 85%)
   > Category | Amount | Date
   > Dining | $120 | 2024-01...
   ```
5. Build citations array: `Array<{ index, fileId, fileName, chunkContent, score }>` — one per unique chunk, numbered sequentially.
6. Return both the formatted section and citations array.

Token budget: Cap the document context section at ~2000 tokens (approximately 8000 characters). If top-5 chunks exceed this, truncate the last chunks. This leaves room for the workspace snapshot and chat history.

Add citation instructions to `SYSTEM_PREAMBLE`:
- Append a section: "When you reference information from uploaded documents, cite the source using [1], [2], etc. These numbers correspond to the document excerpts provided in the '## Relevant Documents' section. Always cite your sources when answering questions about file content."

**Modify `chat-stream.ts`:**

In the POST handler, after building the workspace context and before calling the Anthropic API:

1. Get the user's message content from the request.
2. Check if the workspace has any document chunks: `SELECT COUNT(*) FROM documentChunks WHERE workspaceId = ?`. If 0, skip RAG entirely.
3. If chunks exist, call `buildDocumentContext(userMessage, workspaceId, db)`.
4. If the document context section is non-empty, append it to the system prompt (after the workspace context section).
5. Store the citations array for later.
6. After the streaming completes (in the done event handler), include `citations` in the done SSE event: `{ type: 'done', usage: { inputTokens, outputTokens }, citations }`.
7. When persisting the final assistant message, store citations as JSON in the `messages.citations` column.

Error handling:
- If `buildDocumentContext` throws (e.g., OpenAI API key missing, embedding service down), catch the error, log it, and continue without RAG. The chat should work normally — RAG is an enhancement, not a requirement.
- If the embedding call is slow (>5s), it delays the first token. Acceptable for MVP — the user sees the streaming response start slightly later.

Decisions already made:
- RAG is automatic — no user opt-in. If documents exist and the embedding service is available, every query searches documents. This is the simplest UX.
- RAG runs before the Anthropic API call (blocking) — the document context must be in the system prompt for the first API call. Async/streaming RAG is a future optimization.
- Citations are included in the done event AND persisted to the messages table. The done event is for immediate rendering; the persisted column is for reload.
- Top 5 results is the default — balances relevance with token budget.

Edge cases:
- Workspace has no files → chunk count is 0 → skip RAG entirely. No API call to OpenAI.
- All search results have very low scores → they're still included (minScore=0.3 filters the worst). Let Claude decide if the content is relevant.
- User's message is very short ("hi") → embedding still works, but results will be low relevance → included but Claude will likely ignore them.
- Multiple chunks from the same file → each gets its own citation number. Claude may cite [1] and [2] from the same file.
- System prompt exceeds Claude's context window → unlikely with 2000-token cap on document context. Total system prompt is ~5k tokens with documents, well within limits.

**Tests:**

File: `apps/server/src/__tests__/ai-context.test.ts` (extend existing)

```
describe('buildDocumentContext')
  beforeEach — mock searchDocuments

  it('returns formatted document section with numbered citations')
    - Mock searchDocuments → [{ fileName: 'bank.pdf', content: 'Transaction...', score: 0.92, fileId: 'f1', chunkId: 'c1', chunkIndex: 0 }]
    - Call buildDocumentContext('dining expenses', wsId, db)
    - Assert section contains '## Relevant Documents'
    - Assert section contains '[1] bank.pdf'
    - Assert section contains 'Transaction...'
    - Assert citations.length === 1
    - Assert citations[0].index === 1

  it('returns empty section when no results')
    - Mock searchDocuments → []
    - Call buildDocumentContext('random query', wsId, db)
    - Assert section === ''
    - Assert citations === []

  it('numbers citations sequentially across multiple results')
    - Mock searchDocuments → 3 results from 2 files
    - Call buildDocumentContext('query', wsId, db)
    - Assert citations have index 1, 2, 3
    - Assert section contains [1], [2], [3]

  it('truncates to token budget')
    - Mock searchDocuments → 5 results, each with 1000-char content (total ~5000 chars > budget)
    - Call buildDocumentContext('query', wsId, db)
    - Assert section length <= 8000 characters
    - Assert citations array length <= total chunks included in section

  it('handles searchDocuments error gracefully')
    - Mock searchDocuments → throws
    - Call buildDocumentContext('query', wsId, db)
    - Assert returns { section: '', citations: [] } (no throw)
```

File: `apps/server/src/__tests__/chat-stream.test.ts` (extend existing)

```
describe('RAG integration in chat stream')
  it('skips RAG when workspace has no document chunks')
    - Mock chunk count query → 0
    - Assert buildDocumentContext not called
    - Assert system prompt does not contain '## Relevant Documents'

  it('includes document context in system prompt when chunks exist')
    - Mock chunk count query → 5
    - Mock buildDocumentContext → { section: '## Relevant Documents\n...', citations: [...] }
    - Assert system prompt contains '## Relevant Documents'

  it('sends citations in done event')
    - Mock RAG pipeline to return citations
    - Assert done SSE event includes citations array

  it('persists citations on assistant message')
    - Mock RAG pipeline to return citations
    - After stream completes, query messages table
    - Assert assistant message has citations column with correct JSON

  it('continues normally when RAG fails')
    - Mock buildDocumentContext → throws
    - Assert stream still completes with text response
    - Assert done event has no citations (or empty array)
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/ai-context.test.ts` — all tests pass
- `pnpm vitest run apps/server/src/__tests__/chat-stream.test.ts` — all tests pass
- `pnpm typecheck` — no type errors
- Manual test: upload a PDF, ask a question about it → verify Claude's response references the document content with [1] citations
- Manual test: ask a question with no uploaded files → verify chat works normally without RAG delay

---

## BU-06 — Incremental updates (embed on upload, delete on remove)

**Goal:** File uploads automatically trigger background embedding; file deletes synchronously remove chunks.

**Inputs:** BU-03

**Creates / Modifies:**
- `apps/server/src/routes/files.ts` — add embedding trigger on upload, chunk deletion on delete
- `apps/server/src/__tests__/files-embedding.test.ts` — new test file

**Description:**

**Modify the POST `/upload` route in `files.ts`:**

After the file record is inserted into the `files` table (and the response is sent to the client), trigger the embedding pipeline as a fire-and-forget async operation:

```
// After res.json(fileRecord) — fire and forget
embedFile(fileRecord.id, db).catch(err => {
  console.error(`[RAG] Background embedding failed for file ${fileRecord.id}:`, err);
});
```

Key behavior:
- The upload response returns immediately — the client does not wait for embedding.
- Embedding runs in the background. If it fails, the file is still uploaded and usable; it just won't be searchable via RAG.
- No job queue for MVP — simple fire-and-forget `Promise`. This is acceptable because embedding a single file (even a large one) takes <10 seconds, and only one file is uploaded at a time.
- Guard: Only trigger embedding for text-extractable MIME types (PDF, CSV, XLSX, DOCX, TXT). Skip for images.

**Modify the DELETE `/:fileId` route in `files.ts`:**

Before or after deleting the file record, delete all associated document chunks:

```
// Delete chunks synchronously (before deleting file record)
await db.delete(documentChunks).where(eq(documentChunks.fileId, fileId));
```

Key behavior:
- Chunk deletion is synchronous (part of the delete request) — ensures chunks are cleaned up immediately.
- This runs regardless of whether embedding completed — if the file was never embedded, the delete is a no-op.
- Delete chunks BEFORE deleting the file record (in case the request fails midway — orphaned chunks are harmless, but referencing a deleted file would be inconsistent).

Decisions already made:
- Fire-and-forget for uploads (not await) — keeps upload fast, embedding is best-effort.
- Synchronous for deletes — user expects deleted content to be immediately unsearchable.
- No re-embedding on file replace — file replace isn't a current feature. If added later, the `embedFile` function already handles re-embedding (deletes old chunks first).

Edge cases:
- Upload an image → embedding is skipped (MIME type guard), no chunks created. Delete → chunk deletion is a no-op.
- Upload while `OPENAI_API_KEY` is unset → `embedFile` throws → caught by `.catch()`, logged. File is still uploaded.
- Very rapid upload + delete → file is deleted before embedding completes. The embedding pipeline tries to read the file from disk, fails, returns 0 chunks. No harm.
- Delete a file with 100 chunks → single DELETE WHERE query, fast.

**Tests:**

File: `apps/server/src/__tests__/files-embedding.test.ts` (new)

```
describe('file upload → embedding trigger')
  it('calls embedFile after successful upload')
    - Mock embedFile
    - Simulate POST /upload with a PDF file
    - Assert embedFile called with the new file's ID
    - Assert response returned before embedding completes

  it('does not call embedFile for image uploads')
    - Simulate POST /upload with a PNG file
    - Assert embedFile NOT called

  it('still returns success even if embedding fails')
    - Mock embedFile → throws
    - Simulate POST /upload with a PDF
    - Assert response status 200 (upload succeeded)
    - Assert error logged

describe('file delete → chunk cleanup')
  it('deletes document chunks when file is deleted')
    - Insert file record + 3 document chunks for that file
    - Simulate DELETE /:fileId
    - Assert documentChunks table has 0 rows for that fileId

  it('handles delete when no chunks exist')
    - Insert file record (no chunks — never embedded)
    - Simulate DELETE /:fileId
    - Assert no error (delete is a no-op for chunks)
    - Assert file record is deleted

  it('deletes chunks before file record')
    - Insert file + chunks
    - Simulate DELETE /:fileId
    - Assert chunks deleted first (verify via transaction order or mock)
```

**Verification:**
- `pnpm vitest run apps/server/src/__tests__/files-embedding.test.ts` — all tests pass
- `pnpm typecheck` — no type errors
- Manual test: upload a PDF → wait 5 seconds → query `documentChunks` table → verify chunks exist
- Manual test: delete the uploaded PDF → verify chunks are removed from `documentChunks` table
- Manual test: upload an image → verify no chunks are created

---

## BU-07 — Client-side citation rendering

**Goal:** Render `[1]`, `[2]`, etc. in assistant messages as clickable badges that scroll to the source file card on the canvas, with a collapsible Sources section below the message.

**Inputs:** BU-05

**Creates / Modifies:**
- `apps/web/src/hooks/useChat.ts` — handle citations from done event, persist in message state
- `apps/web/src/stores/canvas-store.ts` — add `scrollToItem(itemId)` method, add `findItemByFileId(fileId)` helper
- `apps/web/src/components/canvas/chat-message.tsx` — render citation badges inline, add Sources section
- `apps/web/src/components/canvas/chat-panel.tsx` — pass citations to messages
- `packages/shared-schemas/src/chat.ts` — no changes (citationSchema already added in BU-01)

**Description:**

**Modify `useChat.ts`:**

1. Extend the message type in state to include optional `citations` field: `Array<{ index, fileId, fileName, chunkContent, score }>`.
2. When the `done` SSE event is received and contains `citations`, store them on the current assistant message.
3. When loading conversation messages from the API (page reload), parse the `citations` JSON column and include it in the message object.
4. Export citations as part of the message data so `ChatMessage` can render them.

**Modify `canvas-store.ts`:**

Add two new methods:

`findItemByFileId(fileId: string): CanvasItem | undefined`
- Search through `items` for a `file-card` whose `data` (parsed JSON) contains a `fileId` field matching the given ID.
- This connects the citation's `fileId` to the actual canvas item displaying that file.
- Return the matching item, or undefined if not found (file card may have been deleted or file was uploaded but not placed on canvas).

`scrollToItem(itemId: string): void`
- Set `selectedItemId` to `itemId`.
- Add `itemId` to `highlightedItemIds` set.
- After a timeout (2 seconds), remove `itemId` from `highlightedItemIds`.
- The canvas viewport scrolling is handled by the existing canvas component which auto-centers on `selectedItemId` changes.

**Modify `chat-message.tsx`:**

1. Accept new optional prop: `citations?: Citation[]`.
2. In the markdown renderer, detect citation patterns `[N]` (where N is a number) in the text.
   - Use a custom ReactMarkdown component or post-process the rendered text.
   - Replace `[N]` with a clickable badge component:
     - Style: small rounded pill, `bg-primary/10 text-primary text-xs font-medium px-1.5 py-0.5 cursor-pointer hover:bg-primary/20 transition-colors inline-flex items-center`
     - Content: the number (e.g., "1")
     - On click: look up `citations[N-1].fileId`, call `findItemByFileId(fileId)`, if found call `scrollToItem(itemId)`.
     - Tooltip on hover: show `citations[N-1].fileName` and a short preview of `chunkContent` (first 100 chars).
3. After the message content, if `citations` is non-empty, render a collapsible Sources section:
   - Collapsed by default. Toggle button: "Sources (N)" with a chevron icon.
   - Expanded: list each citation with its number badge, file name, relevance score as a percentage, and a truncated preview of the chunk content (first 150 chars).
   - Each citation row is clickable — same scroll-to-item behavior as inline badges.
   - Style: `border-t border-border/40 mt-3 pt-3` separator. Muted text colors. Compact layout.

Important rendering details:
- Citation badges must NOT interfere with markdown rendering. The `[N]` pattern in markdown normally creates a link reference. Since we're using ReactMarkdown, we need to handle this carefully:
  - Option A: Pre-process the markdown text before passing to ReactMarkdown — replace `[N]` with a placeholder like `%%CITE_N%%`, then use a custom text renderer to replace placeholders with badge components.
  - Option B: Use a custom `text` component in ReactMarkdown that detects `[N]` patterns and renders badges inline.
  - Option B is preferred — it's cleaner and doesn't require text preprocessing.
- Only replace `[N]` when `citations` prop is provided and `N` is within the citations range. Otherwise, leave `[N]` as normal markdown text.

**Modify `chat-panel.tsx`:**

- Pass `citations` prop from message data to `ChatMessage` component.
- No other changes needed — the chat panel already renders messages through `ChatMessage`.

Decisions already made:
- Citations are rendered inline as small badges, not as footnotes or endnotes. This matches the natural reading flow.
- The Sources section is collapsed by default to keep the chat clean. Users can expand it to see full citation details.
- Clicking a citation scrolls the canvas to the file card and briefly highlights it. This is the core value of citations — connecting chat answers to source documents.
- If the file card isn't on the canvas (file was uploaded but not added as a card), the click is a no-op. No error shown.
- Citation hover preview shows the chunk content, giving users a quick peek without expanding Sources.

Edge cases:
- Message with no citations → no badges rendered, no Sources section. Normal message rendering.
- Citation references a file that was deleted → `findItemByFileId` returns undefined → click is a no-op. The badge still renders (the citation is historical).
- Multiple citations from the same file → each gets its own badge and Sources entry. They may have different chunk content.
- Message contains `[1]` but no citations data (e.g., old message before RAG was added) → `[1]` rendered as plain text (no citations prop = no badge replacement).
- Very long chunk content in Sources → truncated to 150 chars with ellipsis.

**Tests:**

Since this is primarily UI work, most testing happens in BU-08 (E2E tests). Unit tests focus on the store methods and citation parsing logic.

File: `apps/web/src/__tests__/citation-rendering.test.ts` (new, if applicable — otherwise tested via E2E)

```
describe('findItemByFileId')
  it('finds a file-card by fileId in its data')
    - Set up canvas store with items including a file-card with data: { fileId: 'f-123' }
    - Call findItemByFileId('f-123')
    - Assert returns the file-card item

  it('returns undefined when no matching file card exists')
    - Set up canvas store with items (no file-cards)
    - Call findItemByFileId('nonexistent')
    - Assert returns undefined

describe('scrollToItem')
  it('sets selectedItemId and adds to highlightedItemIds')
    - Call scrollToItem('item-1')
    - Assert selectedItemId === 'item-1'
    - Assert highlightedItemIds.has('item-1') === true

  it('removes highlight after timeout')
    - Call scrollToItem('item-1')
    - Advance timers by 2000ms
    - Assert highlightedItemIds.has('item-1') === false
```

**Verification:**
- `pnpm vitest run` — all existing + new tests pass
- `pnpm typecheck` — no type errors
- Manual test: upload a PDF, ask about its content → verify [1] citation appears as clickable badge
- Manual test: click citation badge → canvas scrolls to file card and highlights it briefly
- Manual test: expand Sources section → verify file name, relevance score, and content preview shown
- Manual test: reload page → verify citations persist and render correctly on old messages
- Manual test: dark mode → verify citation badges and Sources section render correctly

---

## BU-08 — E2E tests + polish

**Goal:** Playwright tests covering citation rendering, navigation, and persistence; citation UI polish for both themes.

**Inputs:** BU-05, BU-06, BU-07

**Creates / Modifies:**
- `apps/web/e2e/chat-rag.spec.ts` — new E2E test file
- `apps/web/src/components/canvas/chat-message.tsx` — visual polish
- `apps/web/src/components/canvas/chat-panel.tsx` — visual polish

**Description:**

**E2E tests** (`chat-rag.spec.ts`):

Create Playwright tests that cover the full RAG flow. Since the real embedding pipeline requires an OpenAI API key and actual files, use one of these strategies:
- **Option A (preferred):** Mock the SSE endpoint at the network level (page.route) to return realistic SSE events including citations. This tests the client-side rendering without requiring a real backend.
- **Option B:** If the test environment has API keys, use real file uploads and chat interactions.

Tests:

```
describe('RAG citations')
  test('citation badges render as clickable elements')
    - Mock SSE response with text containing [1] and [2], and done event with citations
    - Assert 2 citation badges visible in the message
    - Assert badges have correct numbers (1, 2)
    - Assert badges are styled as pills (not plain text)

  test('clicking citation badge scrolls to file card')
    - Set up canvas with a file-card item
    - Mock SSE with citation referencing that file
    - Click citation badge [1]
    - Assert file-card is selected (has selected styling)

  test('Sources section is collapsible')
    - Mock SSE with citations
    - Assert Sources section exists but is collapsed (content not visible)
    - Click "Sources (2)" toggle
    - Assert Sources section expands showing 2 citation entries
    - Assert each entry shows file name, score, and content preview
    - Click toggle again → assert collapsed

  test('citations persist across page reload')
    - Mock SSE with citations and persist message to DB
    - Reload page
    - Assert citation badges still render in the reloaded message
    - Assert Sources section still available

  test('chat works without RAG when no files uploaded')
    - Mock SSE with text response, no citations in done event
    - Assert message renders normally
    - Assert no citation badges or Sources section

  test('citation hover shows file name tooltip')
    - Mock SSE with citations
    - Hover over citation badge [1]
    - Assert tooltip shows file name

  test('dark mode citation rendering')
    - Set theme to dark mode
    - Mock SSE with citations
    - Assert citation badges have correct dark mode colors
    - Assert Sources section renders correctly in dark mode
```

**UI polish:**

Review and refine citation rendering in both light and dark themes:

- Citation badges: Ensure contrast ratios meet accessibility standards. Light mode: `bg-primary/10 text-primary`. Dark mode: Same semantic tokens should work with the existing theme system.
- Sources section: Clean border separator, muted colors, compact spacing. Score shown as percentage with 1 decimal place (e.g., "92.1%").
- Hover states: Badge hover should have visible feedback (slightly darker background).
- Active/pressed states: `active:scale-[0.97]` on badges for tactile feedback.
- Animation: Sources section expand/collapse should use a smooth height transition or `details`/`summary` native animation.
- Responsive: Citations in narrow chat panel should wrap gracefully. Badges are inline, so they flow with text naturally.
- Streaming: Citation badges should not appear until the full `[N]` pattern is complete (avoid flashing `[` then `1` then `]` during streaming). The simplest approach: only render citation badges on non-streaming messages. During streaming, show `[N]` as plain text. When streaming completes, switch to badge rendering.

Decisions already made:
- E2E tests mock SSE at the network level — faster, more reliable, no API key dependency.
- Citation rendering during streaming uses plain text — badges appear when the message finalizes. This avoids visual glitches.
- UI uses existing design system tokens — no new colors or custom CSS needed.

**Tests:**

See the test specs above in the E2E tests section.

**Verification:**
- `pnpm exec playwright test apps/web/e2e/chat-rag.spec.ts` — all tests pass
- `pnpm typecheck` — no errors
- `pnpm build` — builds successfully
- Manual dark mode check: toggle dark mode, verify citation badges and Sources section render correctly
- Manual responsiveness check: resize chat panel to minimum width, verify citations don't overflow
- Manual streaming check: during streaming, [N] shows as text; after complete, shows as badge

---

## File index

Summary of all files created or modified across Phase 3:

| File | Action | Build Units |
|------|--------|-------------|
| `apps/server/src/db/schema.ts` | Modify | BU-01 |
| `apps/server/src/env.ts` | Modify | BU-01 |
| `apps/server/src/services/text-extraction.ts` | Create | BU-02 |
| `apps/server/src/services/chunking.ts` | Create | BU-03 |
| `apps/server/src/services/embedding.ts` | Create | BU-03 |
| `apps/server/src/services/embedding-pipeline.ts` | Create | BU-03 |
| `apps/server/src/services/vector-search.ts` | Create | BU-04 |
| `apps/server/src/services/ai-tools.ts` | Modify | BU-04 |
| `apps/server/src/services/ai-context.ts` | Modify | BU-05 |
| `apps/server/src/routes/chat-stream.ts` | Modify | BU-05 |
| `apps/server/src/routes/files.ts` | Modify | BU-06 |
| `packages/shared-schemas/src/chat.ts` | Modify | BU-01 |
| `apps/web/src/hooks/useChat.ts` | Modify | BU-07 |
| `apps/web/src/stores/canvas-store.ts` | Modify | BU-07 |
| `apps/web/src/components/canvas/chat-panel.tsx` | Modify | BU-07, BU-08 |
| `apps/web/src/components/canvas/chat-message.tsx` | Modify | BU-07, BU-08 |
| `apps/server/src/__tests__/document-chunks-table.test.ts` | Create | BU-01 |
| `apps/server/src/__tests__/text-extraction.test.ts` | Create | BU-02 |
| `apps/server/src/__tests__/chunking.test.ts` | Create | BU-03 |
| `apps/server/src/__tests__/embedding.test.ts` | Create | BU-03 |
| `apps/server/src/__tests__/embedding-pipeline.test.ts` | Create | BU-03 |
| `apps/server/src/__tests__/vector-search.test.ts` | Create | BU-04 |
| `apps/server/src/__tests__/ai-tools.test.ts` | Modify | BU-04 |
| `apps/server/src/__tests__/ai-context.test.ts` | Modify | BU-05 |
| `apps/server/src/__tests__/chat-stream.test.ts` | Modify | BU-05 |
| `apps/server/src/__tests__/files-embedding.test.ts` | Create | BU-06 |
| `packages/shared-schemas/src/__tests__/chat-schemas.test.ts` | Modify | BU-01 |
| `apps/web/e2e/chat-rag.spec.ts` | Create | BU-08 |
| `apps/server/package.json` | Modify | BU-02, BU-03 |

**Total: 12 files created, 17 files modified**

---

## Phase 3 completion checklist

All of these must be true when BU-01 through BU-08 are complete:

- [x] **BU-01** — `documentChunks` table with blob embedding column exists; `messages` table has `citations` column; `OPENAI_API_KEY` in env; `citationSchema` and extended done event in shared schemas; table and schema tests pass
- [x] **BU-02** — `extractText` handles PDF, CSV, Excel, DOCX, TXT; returns empty string for images and unsupported types; graceful error handling; extraction tests pass
- [x] **BU-03** — `chunkText` splits text with sentence awareness and overlap; `embedTexts` calls OpenAI with batching and retry; `embedFile` orchestrates extract→chunk→embed→store; all pipeline tests pass
- [x] **BU-04** — `searchChunks` computes cosine similarity and returns ranked results; `search_documents` is tool #25 in registry; search handles empty workspaces and missing API key gracefully; search tests pass
- [x] **BU-05** — `buildDocumentContext` creates markdown section with numbered citations; system prompt includes document excerpts when available; done event includes citations; citations persisted in messages table; RAG integration tests pass
- [x] **BU-06** — File upload triggers background embedding (fire-and-forget); file delete removes chunks synchronously; images skip embedding; embedding failure doesn't break upload; file embedding tests pass
- [x] **BU-07** — `[N]` renders as clickable badge; clicking scrolls to file card on canvas; Sources section is collapsible with file names and scores; citations persist across reload; citation rendering tests pass
- [x] **BU-08** — E2E tests cover badge rendering, canvas navigation, Sources toggle, persistence, dark mode; citation UI polished for both themes; streaming shows plain text, finalized shows badges

**Phase 3 success criteria:**
- [x] Upload a bank statement PDF → ask "what did I spend on dining?" → correct answer with [1] citation linking to file card
- [x] Upload multiple documents → cross-document question → response cites multiple sources
- [x] Citations render as clickable badges, not plain text
- [x] Clicking a citation scrolls canvas to source file card and highlights it
- [x] Delete a file → its content is no longer searchable
- [x] Chat works normally when no documents are uploaded (RAG skipped gracefully)
- [x] Chat works normally when OpenAI embedding service is down (RAG fails gracefully)
- [x] `pnpm typecheck` passes across entire monorepo
- [x] `pnpm test` — all unit tests pass
- [x] `pnpm exec playwright test` — all E2E tests pass (25/25)
- [x] `pnpm build` — both apps build successfully
