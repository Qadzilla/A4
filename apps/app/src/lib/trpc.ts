import type { AppRouter } from '@a4/server/trpc';
import { httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import superjson from 'superjson';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export function createTRPCClient(getToken: () => Promise<string | null>) {
  return {
    links: [
      httpBatchLink({
        url: '/trpc',
        transformer: superjson,
        async headers() {
          const token = await getToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  };
}
