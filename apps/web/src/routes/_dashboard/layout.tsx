import { Sidebar } from '@/components/Sidebar';
import { AuthGuard } from '@/features/auth';
import { Suspense } from 'react';
import { Outlet } from 'react-router';

function DashboardSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export default function DashboardLayout() {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden selection:bg-primary/20 selection:text-primary">
        <Sidebar />

        <main className="flex-1 overflow-y-auto bg-background relative flex flex-col">
          <Suspense fallback={<DashboardSkeleton />}>
            <div className="h-full animate-fade-in">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
    </AuthGuard>
  );
}
