import { AuthGuard } from '@/auth/AuthGuard';
import { ChatSurface } from '@/surfaces/chat';
import { DocumentsSurface } from '@/surfaces/documents';
import { Shell } from '@/surfaces/layout';
import { PortfolioSurface } from '@/surfaces/portfolio';
import { TaxesSurface } from '@/surfaces/taxes';
import { Navigate, createBrowserRouter } from 'react-router';

function ErrorPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="eyebrow">Something broke</p>
      <p className="max-w-xs text-sm text-muted">
        An unexpected error occurred. Reloading usually fixes it.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-card border border-hairline bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-accent"
      >
        Reload
      </button>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    errorElement: <ErrorPage />,
    element: (
      <AuthGuard>
        <Shell />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/portfolio" replace /> },
      { path: 'portfolio', element: <PortfolioSurface /> },
      { path: 'taxes', element: <TaxesSurface /> },
      { path: 'chat', element: <ChatSurface /> },
      { path: 'documents', element: <DocumentsSurface /> },
      { path: '*', element: <Navigate to="/portfolio" replace /> },
    ],
  },
]);
