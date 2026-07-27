import { accountRouter } from './routers/account';
import { billingRouter } from './routers/billing';
import { budgetRouter } from './routers/budget';
import { canvasRouter } from './routers/canvas';
import { categorizationRuleRouter } from './routers/categorization-rule';
import { categoryRouter } from './routers/category';
import { chatRouter } from './routers/chat';
import { debtRouter } from './routers/debt';
import { financialRouter } from './routers/financial';
import { folderRouter } from './routers/folder';
import { healthRouter } from './routers/health';
import { holdingRouter } from './routers/holding';
import { insightsRouter } from './routers/insights';
import { invoiceRouter } from './routers/invoice';
import { marketDataRouter } from './routers/market-data';
import { networthRouter } from './routers/networth';
import { receiptRouter } from './routers/receipt';
import { subscriptionRouter } from './routers/subscription';
import { entityRouter } from './routers/entity';
import { userRouter } from './routers/user';
import { vaultRouter } from './routers/vault';
import { workspaceRouter } from './routers/workspace';
import { router } from './trpc';

export const appRouter = router({
  account: accountRouter,
  budget: budgetRouter,
  categorizationRule: categorizationRuleRouter,
  debt: debtRouter,
  health: healthRouter,
  holding: holdingRouter,
  insights: insightsRouter,
  invoice: invoiceRouter,
  networth: networthRouter,
  workspace: workspaceRouter,
  folder: folderRouter,
  canvas: canvasRouter,
  category: categoryRouter,
  chat: chatRouter,
  financial: financialRouter,
  entity: entityRouter,
  receipt: receiptRouter,
  subscription: subscriptionRouter,
  user: userRouter,
  billing: billingRouter,
  marketData: marketDataRouter,
  vault: vaultRouter,
});

export type AppRouter = typeof appRouter;
