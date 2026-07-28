import { DEV_AUTH_BYPASS } from '@/lib/clerk';
import { useUser } from '@clerk/clerk-react';

interface DevUser {
  user: {
    firstName: string;
    lastName: string;
    primaryEmailAddress: { emailAddress: string };
  };
  isLoaded: boolean;
  isSignedIn: boolean;
}

const DEV_USER: DevUser = {
  user: {
    firstName: 'Dev',
    lastName: 'User',
    primaryEmailAddress: { emailAddress: 'dev@a4.local' },
  },
  isLoaded: true,
  isSignedIn: true,
};

/**
 * Wraps Clerk's useUser with a mock in dev bypass mode.
 * Replace with `useUser` from `@clerk/clerk-react` once Clerk is configured.
 */
export function useDevUser(): DevUser {
  if (DEV_AUTH_BYPASS) {
    return DEV_USER;
  }
  return useUser() as unknown as DevUser;
}
