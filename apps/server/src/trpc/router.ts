import { accountRouter } from './routers/account';
import { billingRouter } from './routers/billing';
import { brokerageRouter } from './routers/brokerage';
import { categorizationRuleRouter } from './routers/categorization-rule';
import { categoryRouter } from './routers/category';
import { chatRouter } from './routers/chat';
import { deskRouter } from './routers/desk';
import { entityRouter } from './routers/entity';
import { fileRouter } from './routers/file';
import { filingRouter } from './routers/filing';
import { financialRouter } from './routers/financial';
import { healthRouter } from './routers/health';
import { holdingRouter } from './routers/holding';
import { insightsRouter } from './routers/insights';
import { marketDataRouter } from './routers/market-data';
import { panelRouter } from './routers/panel';
import { taxRouter } from './routers/tax';
import { userRouter } from './routers/user';
import { workspaceRouter } from './routers/workspace';
import { router } from './trpc';

export const appRouter = router({
  account: accountRouter,
  brokerage: brokerageRouter,
  categorizationRule: categorizationRuleRouter,
  category: categoryRouter,
  chat: chatRouter,
  desk: deskRouter,
  entity: entityRouter,
  file: fileRouter,
  filing: filingRouter,
  financial: financialRouter,
  health: healthRouter,
  holding: holdingRouter,
  insights: insightsRouter,
  marketData: marketDataRouter,
  panel: panelRouter,
  tax: taxRouter,
  user: userRouter,
  billing: billingRouter,
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
