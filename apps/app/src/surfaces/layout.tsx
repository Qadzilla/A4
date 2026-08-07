import { BRAND } from '@/brand';
import { BasisWordmark } from '@/brand-mark';
import { useSpace } from '@/space/useSpace';
import { ClipboardList, FileText, PanelsTopLeft, PieChart, Receipt } from 'lucide-react';
import { createContext, useContext } from 'react';
import { NavLink, Outlet } from 'react-router';

const SpaceContext = createContext<string | null>(null);

/** The active space id, guaranteed non-null inside the shell. */
export function useSpaceId(): string {
  const id = useContext(SpaceContext);
  if (!id) throw new Error('useSpaceId called outside a loaded shell');
  return id;
}

const SURFACES = [
  { to: '/workspace', label: 'Workspace', icon: PanelsTopLeft },
  { to: '/portfolio', label: 'Portfolio', icon: PieChart },
  { to: '/taxes', label: 'Taxes', icon: Receipt },
  { to: '/filing', label: 'Filing', icon: ClipboardList },
  { to: '/documents', label: 'Documents', icon: FileText },
] as const;

function NavItems({ variant }: { variant: 'rail' | 'tabs' }) {
  return (
    <>
      {SURFACES.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            variant === 'rail'
              ? // A cobalt rule marks the active surface — a tinted pill reads
                // as a stray patch of screen colour on the paper ground.
                `flex items-center gap-3 border-l-2 py-2 pl-3 pr-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted hover:text-ink'
                }`
              : `flex flex-1 flex-col items-center gap-0.5 border-t-2 py-2 text-[11px] font-medium ${
                  isActive ? 'border-accent text-accent' : 'border-transparent text-muted'
                }`
          }
        >
          <Icon size={variant === 'rail' ? 16 : 20} strokeWidth={1.75} />
          {label}
        </NavLink>
      ))}
    </>
  );
}

export function Shell() {
  const { spaceId, isLoading, isError, retry } = useSpace();

  if (isError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <BasisWordmark />
        <p className="max-w-xs text-sm text-muted">
          Can't reach the server right now. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-card border border-hairline bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-accent"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading || !spaceId) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="animate-pulse">
          <BasisWordmark />
        </span>
      </div>
    );
  }

  return (
    <SpaceContext.Provider value={spaceId}>
      <div className="min-h-dvh md:flex">
        {/* Desktop rail */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-hairline bg-surface px-3 py-5 md:flex">
          <div className="mb-8 px-3">
            <BasisWordmark />
          </div>
          <nav className="flex flex-col gap-1">
            <NavItems variant="rail" />
          </nav>
          <div className="mt-auto px-3">
            <p className="eyebrow">{BRAND.tagline}</p>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 pb-16 md:pb-0">
          <Outlet />
        </main>

        {/* Mobile tab bar */}
        <nav className="fixed inset-x-0 bottom-0 flex border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          <NavItems variant="tabs" />
        </nav>
      </div>
    </SpaceContext.Provider>
  );
}
