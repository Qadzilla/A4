import { and, eq } from 'drizzle-orm';
import { Router, type Router as RouterType } from 'express';
import { db } from '../db';
import { holdings, trades } from '../db/schema';
import { DEV_AUTH_BYPASS } from '../env';
import { computeRealizedGains } from '../lib/calc';
import { costBasisCsv, form8949Csv } from '../lib/calc/exports';
import { manifestHtml } from '../lib/calc/filing/manifest-html';
import { manifestFor } from '../services/manifest';

/**
 * Documents Basis produces rather than reads. Everything here is derived from
 * figures the product already computes — the lot engine and the holdings
 * table — so an export can never say something the app doesn't.
 *
 * A route rather than a tRPC procedure because the browser has to receive it
 * as a file: Content-Disposition is the whole point.
 */
export const exportsRouter: RouterType = Router();

// biome-ignore lint/suspicious/noExplicitAny: matches the auth shape used by the other routes
function getUserId(req: any): string | null {
  if (DEV_AUTH_BYPASS) return 'dev-user-001';
  return req.auth?.userId ?? null;
}

function sendCsv(
  res: Parameters<Parameters<typeof exportsRouter.get>[1]>[1],
  name: string,
  body: string,
) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  // Byte-order mark so Excel reads the em dashes and accents correctly
  res.send(`﻿${body}`);
}

// GET /api/exports/form-8949?workspaceId=&taxYear=
exportsRouter.get('/form-8949', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const workspaceId = String(req.query.workspaceId ?? '');
  const taxYear = Number.parseInt(String(req.query.taxYear ?? ''), 10);
  if (!workspaceId || !Number.isFinite(taxYear)) {
    res.status(400).json({ error: 'workspaceId and taxYear are required' });
    return;
  }

  const rows = await db
    .select()
    .from(trades)
    .where(and(eq(trades.workspaceId, workspaceId), eq(trades.userId, userId)));

  const summary = computeRealizedGains(
    rows.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      side: t.side as 'buy' | 'sell',
      tradeDate: t.tradeDate,
      units: t.units,
      price: t.price,
      fees: t.fees,
    })),
    taxYear,
  );

  sendCsv(res, `basis-form-8949-${taxYear}.csv`, form8949Csv(summary.sales, taxYear));
});

// GET /api/exports/cost-basis?workspaceId=
exportsRouter.get('/cost-basis', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const workspaceId = String(req.query.workspaceId ?? '');
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }

  const rows = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.workspaceId, workspaceId), eq(holdings.userId, userId)))
    .orderBy(holdings.symbol);

  const csv = costBasisCsv(
    rows.map((h) => ({
      symbol: h.symbol,
      name: h.name,
      quantity: h.quantity,
      costBasis: h.costBasis,
      acquiredAt: h.acquiredAt,
      value: h.value,
    })),
  );

  sendCsv(res, `basis-cost-basis-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

// ─── H1: the manifest, as a page and as data ───────────────────────
// Two shapes of the same object. The HTML is what someone prints and
// sits with while filing; the JSON is what a preparer's software or a
// script consumes. Both are the manifest verbatim — the renderer
// decides how the year looks and never what it says.

// GET /api/exports/manifest?workspaceId=&taxYear=&format=html|json
exportsRouter.get('/manifest', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const workspaceId = String(req.query.workspaceId ?? '');
  const taxYear = Number.parseInt(String(req.query.taxYear ?? ''), 10);
  if (!workspaceId || !Number.isFinite(taxYear)) {
    res.status(400).json({ error: 'workspaceId and taxYear are required' });
    return;
  }

  const manifest = await manifestFor(db, { userId, workspaceId }, taxYear);

  if (String(req.query.format ?? 'html') === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="basis-${taxYear}.json"`);
    res.send(JSON.stringify(manifest, null, 2));
    return;
  }

  // Inline rather than attachment: this one is meant to be READ, and a
  // file that lands in Downloads without opening is a file nobody reads.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(manifestHtml(manifest));
});
