import { CLERK_PUBLISHABLE_KEY, DEV_AUTH_BYPASS } from '@/lib/clerk';
import { createQueryClient } from '@/lib/query-client';
import { TRPCProvider, createTRPCClient } from '@/lib/trpc';
import type { AppRouter } from '@a4/server/trpc';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient as createClient } from '@trpc/client';
import { type ReactNode, useState } from 'react';

function TRPCWrapper({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const [queryClient] = useState(() => createQueryClient());
  const [trpcClient] = useState(() => createClient<AppRouter>(createTRPCClient(getToken)));

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

function DevProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());
  const [trpcClient] = useState(() => createClient<AppRouter>(createTRPCClient(async () => null)));

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  if (DEV_AUTH_BYPASS) {
    return <DevProviders>{children}</DevProviders>;
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <TRPCWrapper>{children}</TRPCWrapper>
    </ClerkProvider>
  );
}
