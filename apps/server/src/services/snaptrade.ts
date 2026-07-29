import { and, eq } from 'drizzle-orm';
import { Snaptrade, SnaptradeAuth } from 'snaptrade-typescript-sdk';
import type { DB } from '../db';
import { accounts, holdings, snaptradeUsers } from '../db/schema';
import { env } from '../env';

/**
 * SnapTrade brokerage connections (P3). Presence-gated like BYOK/R2: no
 * credentials, no feature — the router degrades to { enabled: false } and the
 * client keeps showing the statement-upload path.
 *
 * Sync mirrors statement-import semantics: positions live exclusively in
 * holdings (upsert by symbol, preserving targetPct and any acquiredAt learned
 * from statements), and each brokerage account contributes a CASH-ONLY
 * 'brokerage-cash' account row — so portfolio totals never count twice.
 */

export const SNAPTRADE_ENABLED = !!(env.SNAPTRADE_CLIENT_ID && env.SNAPTRADE_CONSUMER_KEY);

function buildClient() {
  return new Snaptrade({
    auth: SnaptradeAuth.commercialApiKey({
      clientId: env.SNAPTRADE_CLIENT_ID as string,
      consumerKey: env.SNAPTRADE_CONSUMER_KEY as string,
    }),
  });
}

let _client: ReturnType<typeof buildClient> | null = null;

function getClient(): ReturnType<typeof buildClient> {
  if (!SNAPTRADE_ENABLED) {
    throw new Error('SnapTrade is not configured');
  }
  if (!_client) {
    _client = buildClient();
  }
  return _client;
}

interface StIdentity {
  stUserId: string;
  userSecret: string;
}

/**
 * Get-or-create the SnapTrade identity for an A4 user. If our row is missing
 * but SnapTrade already knows the user (e.g. a wiped local DB), recover by
 * rotating the secret — the old one is unrecoverable by design.
 */
export async function ensureSnaptradeUser(db: DB, userId: string): Promise<StIdentity> {
  const [existing] = await db
    .select()
    .from(snaptradeUsers)
    .where(eq(snaptradeUsers.userId, userId));
  if (existing) return { stUserId: existing.stUserId, userSecret: existing.userSecret };

  const client = getClient();
  let stUserId = userId;
  let userSecret: string | undefined;
  try {
    const reg = await client.authentication.registerSnapTradeUser({ userId });
    stUserId = reg.data.userId ?? userId;
    userSecret = reg.data.userSecret ?? undefined;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== 400) throw err;
    // Already registered remotely but we lost the secret. Reset requires the
    // old secret, so the only recovery is delete + re-register (verified live;
    // remote connections are unusable without the secret anyway).
    await client.authentication.deleteSnapTradeUser({ userId });
    const reg = await client.authentication.registerSnapTradeUser({ userId });
    stUserId = reg.data.userId ?? userId;
    userSecret = reg.data.userSecret ?? undefined;
  }
  if (!userSecret) {
    throw new Error('SnapTrade registration returned no user secret');
  }

  const now = new Date();
  await db.insert(snaptradeUsers).values({
    id: crypto.randomUUID(),
    userId,
    stUserId,
    userSecret,
    createdAt: now,
    updatedAt: now,
  });
  return { stUserId, userSecret };
}

/** Connection-portal URL the user opens to link a brokerage. */
export async function getConnectPortalUrl(
  db: DB,
  userId: string,
  customRedirect?: string,
): Promise<string> {
  const identity = await ensureSnaptradeUser(db, userId);
  const login = await getClient().authentication.loginSnapTradeUser({
    userId: identity.stUserId,
    userSecret: identity.userSecret,
    ...(customRedirect ? { customRedirect } : {}),
  });
  const url = (login.data as { redirectURI?: string }).redirectURI;
  if (!url) throw new Error('SnapTrade returned no portal URL');
  return url;
}

export interface BrokerageConnection {
  id: string;
  brokerage: string;
  disabled: boolean;
  createdAt: string | null;
}

// Minimal shapes of the SDK responses we consume (the SDK types them loosely)
interface StAuthorization {
  id?: string;
  disabled?: boolean;
  created_date?: string;
  brokerage?: { name?: string; display_name?: string };
}
interface StBalance {
  cash?: number | null;
}
interface StPosition {
  symbol?: { symbol?: { symbol?: string; description?: string } };
  units?: number | null;
  fractional_units?: number | null;
  price?: number | null;
  average_purchase_price?: number | null;
}

export async function listConnections(db: DB, userId: string): Promise<BrokerageConnection[]> {
  const [row] = await db.select().from(snaptradeUsers).where(eq(snaptradeUsers.userId, userId));
  if (!row) return []; // never registered — no API call needed
  const res = await getClient().connections.listBrokerageAuthorizations({
    userId: row.stUserId,
    userSecret: row.userSecret,
  });
  return ((res.data ?? []) as StAuthorization[]).map((a) => ({
    id: a.id ?? '',
    brokerage: a.brokerage?.display_name ?? a.brokerage?.name ?? 'Unknown brokerage',
    disabled: a.disabled ?? false,
    createdAt: (a.created_date as string | undefined) ?? null,
  }));
}

export async function disconnectConnection(
  db: DB,
  userId: string,
  authorizationId: string,
): Promise<void> {
  const [row] = await db.select().from(snaptradeUsers).where(eq(snaptradeUsers.userId, userId));
  if (!row) return;
  await getClient().connections.removeBrokerageAuthorization({
    userId: row.stUserId,
    userSecret: row.userSecret,
    authorizationId,
  });
}

/** Normalized shape of one brokerage account's holdings — SDK-independent for testability. */
export interface NormalizedBrokerageAccount {
  institution: string;
  positions: Array<{
    symbol: string;
    name: string;
    units: number;
    price: number | null;
    /** per-unit average purchase price, when the brokerage reports it */
    averagePurchasePrice: number | null;
  }>;
  cash: number | null;
}

export interface SyncSummary {
  accountsSynced: number;
  positionsCreated: number;
  positionsUpdated: number;
  cashAccountsUpserted: number;
}

/**
 * Apply normalized brokerage data to the portfolio. Pure DB logic, shared by
 * the live sync and tests. Preserves targetPct and acquiredAt on update —
 * brokerage positions APIs don't carry lot dates, statements do.
 */
export async function applyBrokerageSync(
  db: DB,
  userId: string,
  workspaceId: string,
  data: NormalizedBrokerageAccount[],
): Promise<SyncSummary> {
  const now = new Date();
  const summary: SyncSummary = {
    accountsSynced: data.length,
    positionsCreated: 0,
    positionsUpdated: 0,
    cashAccountsUpserted: 0,
  };

  for (const account of data) {
    for (const position of account.positions) {
      if (!position.symbol || position.units <= 0) continue;
      const symbol = position.symbol.toUpperCase();
      const value = position.price !== null ? position.units * position.price : null;
      const costBasis =
        position.averagePurchasePrice !== null
          ? position.units * position.averagePurchasePrice
          : null;

      const [existing] = await db
        .select({ id: holdings.id, value: holdings.value })
        .from(holdings)
        .where(
          and(
            eq(holdings.workspaceId, workspaceId),
            eq(holdings.userId, userId),
            eq(holdings.symbol, symbol),
          ),
        );

      if (existing) {
        await db
          .update(holdings)
          .set({
            name: position.name,
            value: value ?? existing.value,
            quantity: position.units,
            ...(costBasis !== null ? { costBasis } : {}),
            updatedAt: now,
          })
          .where(eq(holdings.id, existing.id));
        summary.positionsUpdated += 1;
      } else {
        await db.insert(holdings).values({
          id: crypto.randomUUID(),
          workspaceId,
          userId,
          symbol,
          name: position.name,
          value: value ?? 0,
          targetPct: 0,
          quantity: position.units,
          costBasis,
          acquiredAt: null,
          createdAt: now,
          updatedAt: now,
        });
        summary.positionsCreated += 1;
      }
    }

    if (account.cash !== null) {
      const [existingAccount] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.workspaceId, workspaceId),
            eq(accounts.userId, userId),
            eq(accounts.institution, account.institution),
            eq(accounts.type, 'brokerage-cash'),
          ),
        );
      if (existingAccount) {
        await db
          .update(accounts)
          .set({ balance: account.cash, updatedAt: now })
          .where(eq(accounts.id, existingAccount.id));
      } else {
        await db.insert(accounts).values({
          id: crypto.randomUUID(),
          workspaceId,
          userId,
          name: `${account.institution} (cash)`,
          institution: account.institution,
          type: 'brokerage-cash',
          balance: account.cash,
          createdAt: now,
          updatedAt: now,
        });
      }
      summary.cashAccountsUpserted += 1;
    }
  }

  return summary;
}

/** Pull live positions from every connected brokerage account into the workspace. */
export async function syncBrokerageHoldings(
  db: DB,
  userId: string,
  workspaceId: string,
): Promise<SyncSummary> {
  const [row] = await db.select().from(snaptradeUsers).where(eq(snaptradeUsers.userId, userId));
  if (!row) {
    return { accountsSynced: 0, positionsCreated: 0, positionsUpdated: 0, cashAccountsUpserted: 0 };
  }
  const client = getClient();
  const identity = { userId: row.stUserId, userSecret: row.userSecret };

  const accountList = await client.accountInformation.listUserAccounts(identity);
  const normalized: NormalizedBrokerageAccount[] = [];

  for (const account of accountList.data ?? []) {
    if (!account.id) continue;
    const res = await client.accountInformation.getUserHoldings({
      ...identity,
      accountId: account.id,
    });
    const holdingsData = res.data;
    const cash = ((holdingsData.balances ?? []) as StBalance[])
      .map((b) => b.cash ?? 0)
      .reduce<number | null>((sum, c) => (sum ?? 0) + c, null);

    normalized.push({
      institution: account.institution_name ?? 'Brokerage',
      positions: ((holdingsData.positions ?? []) as StPosition[]).map((p) => ({
        symbol: p.symbol?.symbol?.symbol ?? '',
        name: p.symbol?.symbol?.description ?? p.symbol?.symbol?.symbol ?? '',
        units: (p.units ?? p.fractional_units ?? 0) as number,
        price: (p.price as number | null) ?? null,
        averagePurchasePrice: (p.average_purchase_price as number | null) ?? null,
      })),
      cash,
    });
  }

  return applyBrokerageSync(db, userId, workspaceId, normalized);
}
