import { accountRouter } from './routers/account';
import { billingRouter } from './routers/billing';
import { budgetRouter } from './routers/budget';
import { canvasRouter } from './routers/canvas';
import { categoryRouter } from './routers/category';
import { chatRouter } from './routers/chat';
import { debtRouter } from './routers/debt';
import { financialRouter } from './routers/financial';
import { folderRouter } from './routers/folder';
import { healthRouter } from './routers/health';
import { holdingRouter } from './routers/holding';
import { invoiceRouter } from './routers/invoice';
import { marketDataRouter } from './routers/market-data';
import { networthRouter } from './routers/networth';
import { receiptRouter } from './routers/receipt';
import { subscriptionRouter } from './routers/subscription';
import { userRouter } from './routers/user';
import { vaultRouter } from './routers/vault';
import { workspaceRouter } from './routers/workspace';
import { router } from './trpc';

export const appRouter = router({
  account: accountRouter,
  budget: budgetRouter,
  debt: debtRouter,
  health: healthRouter,
  holding: holdingRouter,
  invoice: invoiceRouter,
  networth: networthRouter,
  workspace: workspaceRouter,
  folder: folderRouter,
  canvas: canvasRouter,
  category: categoryRouter,
  chat: chatRouter,
  financial: financialRouter,
  receipt: receiptRouter,
  subscription: subscriptionRouter,
  user: userRouter,
  billing: billingRouter,
  marketData: marketDataRouter,
  vault: vaultRouter,
});

export type AppRouter = typeof appRouter;
