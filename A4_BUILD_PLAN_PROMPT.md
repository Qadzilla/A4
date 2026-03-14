# Prompt: Generate Phase 2 Build Plan for A4

Copy everything below the `---` line. Attach `A4_AI_PIPELINE.md` and `A4_AI_PHASE_1_BUILD_PLAN.md` as reference files. Submit to Claude.

---

You are a senior software architect planning implementation work for A4, an AI-powered financial workspace application. Your job is to take a high-level phase description from our AI pipeline roadmap and produce a detailed, executable build plan that a developer (human or AI) can follow session by session.

## Reference documents (attached)

1. **A4_AI_PIPELINE.md** — the full AI pipeline architecture, all phase descriptions, database schema additions, tool definitions, SSE protocol, system prompt strategy, security model, and success metrics. This is the source of truth for *what* needs to be built.
2. **A4_AI_PHASE_1_BUILD_PLAN.md** — a completed Phase 1 build plan. This is the structural template you must match exactly. Study its format, depth, conventions, and level of specificity before writing anything.

## Your task

Produce the build plan for **Phase 2: Tool use — AI takes actions**.

Phase goal from the pipeline doc: "Claude can call A4 tools to create canvas items, query data, and run calculations. The user says 'create a budget' and it appears on the canvas."

## Output structure — match Phase 1 exactly

Your output must be a single markdown document with this structure:

### Header
- Title: `# A4 — AI Pipeline: Phase 2 Detailed Build Plan`
- Metadata block: Created date, Status ("Pre-implementation — ready to begin BU-01"), Architecture reference pointing to A4_AI_PIPELINE.md
- "How to use this document" section — identical to Phase 1's (BU workflow, format explanation, "No code in this document" rule)

### Dependency graph
- ASCII art showing all BUs and their dependency edges
- Mark which BUs can safely run in parallel
- Every BU must appear in this graph

### Build units (BU-01 through BU-N)

Each BU must contain exactly these sections:

**Goal** — one sentence describing the deliverable outcome

**Inputs** — which prior BUs must be complete (or "None" for the first)

**Creates / Modifies** — exact file paths. Use the real project structure:
- Server code: `apps/server/src/...`
- Web code: `apps/web/src/...`
- Shared schemas: `packages/shared-schemas/src/...`
- Shared types: `packages/shared-types/src/...`
- Tests: `apps/server/src/__tests__/...` or `apps/web/e2e/...`

**Description** — the bulk of each BU. Must include:
- What to build (functionality, not code)
- Decisions already made (architectural choices, library picks, patterns to follow)
- Edge cases to handle
- What NOT to do (scope boundaries)
- References to existing patterns in the codebase when relevant (e.g., "follow the same pattern as X")
- Integration points with prior phases' code

**Tests** — full test specifications:
- Exact file path for the test file
- `describe`/`it` block names
- Setup/teardown pattern (reference existing test patterns like in-memory SQLite)
- What to assert — specific expected values, not vague "verify it works"
- Note when unit tests are impractical and E2E covers the gap instead

**Verification** — checklist of commands and manual steps:
- `pnpm vitest run <path>` — specific test file
- `pnpm typecheck` — must pass
- `pnpm build` — must pass
- Manual verification steps (specific actions, not vague "test it")

### File index
- Table of all files created or modified, which BUs touch them
- Total count: N files created, M files modified

### Phase completion checklist
- One checkbox per BU with a summary of what "done" means
- Success criteria from A4_AI_PIPELINE.md for this phase (copy them verbatim)
- CI verification commands

## Critical rules

1. **No code.** The plan tells developers *what* to build and *how to verify it's correct*, never *how to write it*. No code snippets, no pseudocode, no implementation details at the syntax level.

2. **One BU = one coding session.** Each BU should be completable in a single focused session (1-3 hours of work). If a BU feels too large, split it. If it feels trivial, merge it with an adjacent one.

3. **Decisions, not options.** Don't present alternatives — make the call. Say "Use library X because Y" not "You could use X or Y". The developer should never need to make architectural decisions during implementation.

4. **Reference existing patterns.** A4 has established conventions (Drizzle ORM, tRPC routers, Zustand stores, TanStack Query, Zod schemas, in-memory SQLite tests, Playwright E2E). Every BU should reference which existing pattern to follow. Never introduce new patterns without stating why.

5. **Exact file paths.** Never say "create a new file in the services directory". Say "create `apps/server/src/services/vector-search.ts`".

6. **Edge cases are requirements.** Every BU must list edge cases explicitly. "Handle errors gracefully" is not acceptable. "If the embedding API returns 429, queue the chunk for retry with exponential backoff capped at 5 minutes" is.

7. **Tests are specifications.** Test descriptions must be detailed enough that a developer can write the test without reading the implementation. Include setup data, expected values, and assertion patterns.

8. **Dependencies are strict.** If BU-04 depends on BU-02, that means BU-02's tests must pass before BU-04 begins. No partial dependencies.

9. **Scope discipline.** Only include work described in this phase's section of A4_AI_PIPELINE.md. Don't pull in work from future phases. Don't add "nice to have" features. If something is needed but belongs to a different phase, note it as a future dependency and move on.

10. **Account for what Phase 1 already built.** Phase 1 created: conversations + messages + aiUsage tables, chat tRPC router (CRUD), Anthropic SDK wrapper, workspace context builder, SSE streaming endpoint, useChat hook, ChatPanel with conversation management, markdown rendering, E2E tests. Your plan builds ON TOP of this existing infrastructure — reference it, extend it, but don't rebuild it.

## Codebase context

- Monorepo: pnpm workspaces, Turborepo
- Server: Express + tRPC, Drizzle ORM, SQLite (better-sqlite3), Vitest
- Web: React + Vite, TanStack Router + Query, Zustand, Tailwind CSS, Playwright
- Shared: Zod schemas (source of truth for types), TypeScript strict mode
- Auth: Clerk (production), dev bypass mode (DEV_AUTH_BYPASS env var)
- AI: Anthropic SDK (@anthropic-ai/sdk), Claude Sonnet 4.6 default / Opus 4.6 for deep reasoning
- Canvas: infinite canvas with 27 item types, Zustand store, bezier connections
- Testing: Vitest for unit (in-memory SQLite), Playwright for E2E
- CI: Biome lint → typecheck → unit tests → E2E → build → security audit

## Current file counts (for sizing reference)
- 61 canvas components, 30 lib utility files, 6 tool panels
- 21 DB tables, 20 tRPC routers
- Server tests use in-memory SQLite pattern (createTestDb, manual CREATE TABLE, Drizzle wrapper)
