import { ROUTES } from '@/constants';
import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';

// Auth pages
const SignInPage = lazy(() => import('@/routes/_auth/sign-in'));
const SignUpPage = lazy(() => import('@/routes/_auth/sign-up'));
const SSOCallbackPage = lazy(() => import('@/routes/_auth/sso-callback'));

// Dashboard pages
const DashboardLayout = lazy(() => import('@/routes/_dashboard/layout'));
const HomePage = lazy(() => import('@/routes/_dashboard/page'));
const WorkspacesPage = lazy(() => import('@/routes/_dashboard/workspaces/page'));
const WorkspaceDetailPage = lazy(() => import('@/routes/_dashboard/workspaces/[id]/page'));
const FolderDetailPage = lazy(() => import('@/routes/_dashboard/workspaces/[id]/folder'));
const TrashPage = lazy(() => import('@/routes/_dashboard/trash/page'));
const FrameworksPage = lazy(() => import('@/routes/_dashboard/frameworks/page'));
const UsagePage = lazy(() => import('@/routes/_dashboard/usage/page'));
const SettingsPage = lazy(() => import('@/routes/_dashboard/settings/page'));

export const router = createBrowserRouter([
  // Auth routes (no layout)
  { path: ROUTES.SIGN_IN, Component: SignInPage },
  { path: ROUTES.SIGN_UP, Component: SignUpPage },
  { path: ROUTES.SSO_CALLBACK, Component: SSOCallbackPage },

  // Dashboard routes (with layout + auth guard)
  {
    Component: DashboardLayout,
    children: [
      { index: true, Component: HomePage },
      { path: 'workspaces', Component: WorkspacesPage },
      { path: 'workspaces/:id', Component: WorkspaceDetailPage },
      { path: 'workspaces/:id/folder', Component: FolderDetailPage },
      { path: 'trash', Component: TrashPage },
      { path: 'frameworks', Component: FrameworksPage },
      { path: 'usage', Component: UsagePage },
      { path: 'settings', Component: SettingsPage },
    ],
  },
]);
