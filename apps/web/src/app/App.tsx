import { useTheme } from '@/hooks/useTheme';
import { Suspense } from 'react';
import { RouterProvider } from 'react-router';
import { Providers } from './providers';
import { router } from './router';

function LoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function ThemeSync() {
  useTheme();
  return null;
}

export function App() {
  return (
    <Providers>
      <ThemeSync />
      <Suspense fallback={<LoadingFallback />}>
        <RouterProvider router={router} />
      </Suspense>
    </Providers>
  );
}
