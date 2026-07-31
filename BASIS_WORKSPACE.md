# P7 — The Workspace

> Chat stops being a surface beside the product and becomes the place the
> product is used. Conversation on the right; on the left, the documents and
> figures the conversation is actually about.

## Why this is cheaper than it looks

Three things already exist and are unused:

1. **Tool results already stream to the browser.** `routes/chat-stream.ts`
   emits a `tool_result` event carrying each tool's full JSON payload.
   `useChat` ignores it. Every panel's data is already arriving over the wire —
   `pre_trade_check` returns per-lot holding periods and days-to-long-term,
   `benchmark_comparison` returns per-position counterfactuals, and so on.
2. **PDF page rasterisation is already in the pipeline.** `page-embedding.ts`
   opens documents with `mupdf` and renders pages to pixmaps purely to feed
   Voyage embeddings, then discards the pixels. Displaying a page is a matter
   of keeping them.
3. **The retrieval and entity engines survived the Cut** — hybrid search, the
   entity graph, reconciliation. None of it has a surface.

## Decisions (locked)

- The workspace **persists**. Panels belong to a conversation and are still
  there when you come back to it.
- You can **start from a document**, not only from a question.
- Portfolio and Taxes **stay** as dashboards and remain the source of truth,
  but everything they show can be summoned into the workspace and worked with
  there.
- **Creation is in v1**: the workspace can produce a document you can download.

## Status

All five slices shipped. S1 the frame, S2 persistence, S3 documents, S4
summoning the dashboards, S5 creation and export.

Three bugs worth remembering, all the same family: a write that reached the
server with the wrong value, or never reached it, while the screen looked
correct. The pin read its next value out of a setState updater; opening a
document on a cold load created a conversation of its own; the hydration
fetch replaced local state and swallowed a panel placed while it was in
flight. **Anything that writes through to the server gets a database check,
not a screenshot.**

## Slices

**S1 — The frame.** Two panes on `/chat`: workspace left, conversation right,
collapsible. `useChat` captures `tool_result` into panels. Renderers for
lots, tax picture, benchmark, realized gains, holdings and document search.
Ephemeral — panels live for the session.

**S2 — Persistence.** `panels` table keyed by conversation, with order and a
pinned flag. Panels survive reload; reorder, pin, remove.

**S3 — Documents in the workspace.** Persist rendered pages (extend the
existing mupdf pass), a document panel with page navigation, and entry from
both directions: open a file from Documents, or have Bip cite one.

**S4 — Summoning the dashboards.** Holdings and the tax meter as panels that
read live from the existing routers; "open in workspace" from Portfolio and
Taxes.

**S5 — Creation.** Generate from the lot engine and tax picture: an 8949
worksheet, a realized-gains CSV, a year-end cost-basis report. Download from
a panel. CSV first; PDF once the shape is settled.

## Deliberately not in v1

Freeform x/y dragging. The panel model carries position from the start, so a
spatial layer can land later — but a stack that reorders and pins is more
useful than a canvas you have to tidy, and it is not what made the old canvas
worth missing.
