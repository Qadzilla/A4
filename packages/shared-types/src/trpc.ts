// This type will be replaced by the actual AppRouter type from the server.
// For now, it serves as a placeholder so the frontend can compile.
// The server will export the real AppRouter type.

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

// Placeholder — will be replaced with the actual import from apps/server
// once the backend is scaffolded. Using `any` here intentionally as a stub.
// biome-ignore lint/suspicious/noExplicitAny: placeholder type
export type AppRouter = any;

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
