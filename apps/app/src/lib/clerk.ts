export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export const DEV_AUTH_BYPASS = !CLERK_PUBLISHABLE_KEY && import.meta.env.DEV;

if (!CLERK_PUBLISHABLE_KEY && !import.meta.env.DEV) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required');
}

if (DEV_AUTH_BYPASS) {
  console.warn('[A4] No VITE_CLERK_PUBLISHABLE_KEY found — running with auth bypassed (dev only)');
}
