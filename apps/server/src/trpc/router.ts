import { billingRouter } from './routers/billing';
import { chatRouter } from './routers/chat';
import { financialRouter } from './routers/financial';
import { folderRouter } from './routers/folder';
import { healthRouter } from './routers/health';
import { userRouter } from './routers/user';
import { workspaceRouter } from './routers/workspace';
import { router } from './trpc';

export const appRouter = router({
  health: healthRouter,
  workspace: workspaceRouter,
  folder: folderRouter,
  chat: chatRouter,
  financial: financialRouter,
  user: userRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
