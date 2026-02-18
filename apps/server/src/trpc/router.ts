import { billingRouter } from './routers/billing';
import { canvasRouter } from './routers/canvas';
import { chatRouter } from './routers/chat';
import { financialRouter } from './routers/financial';
import { folderRouter } from './routers/folder';
import { healthRouter } from './routers/health';
import { marketDataRouter } from './routers/market-data';
import { userRouter } from './routers/user';
import { vaultRouter } from './routers/vault';
import { workspaceRouter } from './routers/workspace';
import { router } from './trpc';

export const appRouter = router({
  health: healthRouter,
  workspace: workspaceRouter,
  folder: folderRouter,
  canvas: canvasRouter,
  chat: chatRouter,
  financial: financialRouter,
  user: userRouter,
  billing: billingRouter,
  marketData: marketDataRouter,
  vault: vaultRouter,
});

export type AppRouter = typeof appRouter;
