export const ROUTES = {
  // Auth
  SIGN_IN: '/sign-in',
  SIGN_UP: '/sign-up',
  SSO_CALLBACK: '/sso-callback',

  // Dashboard
  HOME: '/dashboard',
  WORKSPACES: '/workspaces',
  WORKSPACE_DETAIL: '/workspaces/:id',
  TRASH: '/trash',
  FRAMEWORKS: '/frameworks',
  USAGE: '/usage',
  SETTINGS: '/settings',
} as const;
