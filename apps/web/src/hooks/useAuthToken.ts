import { DEV_AUTH_BYPASS } from '@/lib/clerk';
import { useAuth } from '@clerk/clerk-react';

const noopGetToken = async (): Promise<string | null> => null;

export function useAuthToken(): () => Promise<string | null> {
  if (DEV_AUTH_BYPASS) return noopGetToken;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useAuth().getToken;
}
