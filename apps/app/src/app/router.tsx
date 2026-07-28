import { AuthGuard } from '@/auth/AuthGuard';
import { ChatSurface } from '@/surfaces/chat';
import { DocumentsSurface } from '@/surfaces/documents';
import { Shell } from '@/surfaces/layout';
import { PortfolioSurface } from '@/surfaces/portfolio';
import { TaxesSurface } from '@/surfaces/taxes';
import { Navigate, createBrowserRouter } from 'react-router';

export const router = createBrowserRouter([
  {
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
