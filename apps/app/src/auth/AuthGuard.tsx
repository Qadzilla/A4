import { DEV_AUTH_BYPASS } from '@/lib/clerk';
import { RedirectToSignIn, SignedIn, SignedOut } from '@clerk/clerk-react';
import type { ReactNode } from 'react';

/**
 * Dev bypass matches the server's: no Clerk key in dev → mock user, no
 * redirect. Production requires a signed-in Clerk session.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  if (DEV_AUTH_BYPASS) return <>{children}</>;

  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
