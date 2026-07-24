import { ROUTES } from '@/constants';
import { AuthGuard } from '@/features/auth';
import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import ErrorBoundaryPage from '@/routes/_errors/error-boundary';

// Auth pages
const SignInPage = lazy(() => import('@/routes/_auth/sign-in'));
const SignUpPage = lazy(() => import('@/routes/_auth/sign-up'));
const SSOCallbackPage = lazy(() => import('@/routes/_auth/sso-callback'));

// Public pages
const RootGate = lazy(() => import('@/routes/_public/root-gate'));
const EarlyAccessPage = lazy(() => import('@/routes/_public/early-access'));

// PRE-LAUNCH: the product (dashboard/workspaces/etc.) is unplugged from the
// router while a4ai.io runs in early-access mode — signed-in users land on the
// coming-soon wall at /dashboard, and the product chunks are excluded from the
// bundle. To re-enable, restore the dashboard routes from git history.

// Error pages
const NotFoundPage = lazy(() => import('@/routes/_errors/not-found'));

export const router = createBrowserRouter([
  {
    errorElement: <ErrorBoundaryPage />,
    children: [
      // Public root — landing page or redirect to the early-access wall
      { index: true, Component: RootGate },

      // Auth routes (no layout)
      { path: ROUTES.SIGN_IN, Component: SignInPage },
      { path: ROUTES.SIGN_UP, Component: SignUpPage },
      { path: ROUTES.SSO_CALLBACK, Component: SSOCallbackPage },

      // Early-access wall — keeps the /dashboard path so every existing
      // post-auth redirect (sign-in, sign-up, SSO callback, RootGate) lands
      // here without changes to those files
      {
        path: 'dashboard',
        element: (
          <AuthGuard>
            <Suspense>
              <EarlyAccessPage />
            </Suspense>
          </AuthGuard>
        ),
      },

      // 404 catch-all (must be last)
      {
        path: '*',
        element: (
          <Suspense>
            <NotFoundPage />
          </Suspense>
        ),
      },
    ],
  },
]);
