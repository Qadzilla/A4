import { ROUTES } from '@/constants';
import { useDevUser } from '@/hooks/useDevUser';
import { DEV_AUTH_BYPASS } from '@/lib/clerk';
import { useClerk } from '@clerk/clerk-react';
import { useTRPC } from '@/lib/trpc';
import { useCanvasStore } from '@/stores/canvas-store';
import { useUIStore } from '@/stores/ui-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  cn,
} from '@a4/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

const navItems = [
  {
    label: 'Home',
    href: ROUTES.HOME,
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0"
      >
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: 'Workspaces',
    href: ROUTES.WORKSPACES,
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0"
      >
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Usage',
    href: ROUTES.USAGE,
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0"
      >
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    label: 'Trash',
    href: ROUTES.TRASH,
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </svg>
    ),
  },
  {
    label: 'Frameworks',
    href: ROUTES.FRAMEWORKS,
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0"
      >
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sidebarCollapsed, toggleSidebar, theme, setTheme } = useUIStore();
  const clerk = DEV_AUTH_BYPASS ? null : useClerk();
  const { user } = useDevUser();
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'User';
  const email = user.primaryEmailAddress?.emailAddress ?? '';
  const initial = (user.firstName?.[0] ?? email[0] ?? 'U').toUpperCase();
  const trpc = useTRPC();
  const { data: workspaces = [] } = useQuery(trpc.workspace.list.queryOptions());
  const [workspacesOpen, setWorkspacesOpen] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const canvasItems = useCanvasStore((s) => s.items);
  const selectItem = useCanvasStore((s) => s.selectItem);
  const openItem = useCanvasStore((s) => s.openItem);
  const activeItemId = useCanvasStore((s) => s.activeItemId);
  const selectedItemId = useCanvasStore((s) => s.selectedItemId);

  // Extract workspace ID from the current URL if on a workspace detail page
  const wsMatch = location.pathname.match(/^\/workspaces\/([^/]+)$/);
  const activeWorkspaceId = wsMatch?.[1] ?? null;

  // Auto-expand workspace in sidebar when canvas items are added
  useEffect(() => {
    if (activeWorkspaceId && canvasItems.length > 0) {
      setExpandedFolders((prev) => {
        if (prev.has(activeWorkspaceId)) return prev;
        const next = new Set(prev);
        next.add(activeWorkspaceId);
        return next;
      });
    }
  }, [activeWorkspaceId, canvasItems.length]);

  // Build tree: top-level items + children grouped by parentId (filter out trashed as safety net)
  const activeWorkspaces = workspaces.filter((ws) => !ws.deletedAt);
  const topLevel = activeWorkspaces.filter((ws) => !ws.parentId);
  const childrenByParent = new Map<string, typeof workspaces>();
  for (const ws of activeWorkspaces) {
    if (ws.parentId) {
      const list = childrenByParent.get(ws.parentId) ?? [];
      list.push(ws);
      childrenByParent.set(ws.parentId, list);
    }
  }

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const renderWorkspaceItem = (ws: (typeof workspaces)[number]) => {
    const isFolder = ws.type === 'folder';
    const wsPath = isFolder ? `/workspaces/${ws.id}/folder` : `/workspaces/${ws.id}`;
    const wsActive =
      location.pathname === wsPath || location.pathname.startsWith(`/workspaces/${ws.id}`);
    const isExpanded = expandedFolders.has(ws.id);
    const folderChildren = childrenByParent.get(ws.id) ?? [];

    if (isFolder) {
      return (
        <div key={ws.id} className="space-y-0.5">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => toggleFolder(ws.id)}
              className="flex h-5 w-4 items-center justify-center text-muted-foreground"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  'h-2.5 w-2.5 transition-transform duration-150',
                  isExpanded && 'rotate-90',
                )}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <Link
              to={wsPath}
              className={cn(
                'flex flex-1 items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] transition-all duration-150 truncate',
                wsActive
                  ? 'bg-muted text-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-sidebar-foreground',
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3 shrink-0"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="truncate">{ws.name}</span>
            </Link>
          </div>
          {isExpanded && folderChildren.length > 0 && (
            <div className="ml-4 pl-3 border-l border-border/40 space-y-0.5 py-1">
              {folderChildren.map((child) => renderWorkspaceItem(child))}
            </div>
          )}
        </div>
      );
    }

    // Show canvas items as sub-entries when this workspace is active
    const hasCanvasItems = ws.id === activeWorkspaceId && canvasItems.length > 0;
    const isWsExpanded = expandedFolders.has(ws.id);

    if (hasCanvasItems) {
      return (
        <div key={ws.id} className="space-y-0.5">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => toggleFolder(ws.id)}
              className="flex h-5 w-4 items-center justify-center text-muted-foreground"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  'h-2.5 w-2.5 transition-transform duration-150',
                  isWsExpanded && 'rotate-90',
                )}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <Link
              to={wsPath}
              className={cn(
                'flex flex-1 items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] transition-all duration-150 truncate',
                wsActive
                  ? 'bg-muted text-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-sidebar-foreground',
              )}
            >
              <span className="truncate">{ws.name}</span>
            </Link>
          </div>
          {isWsExpanded && (
            <div className="ml-4 pl-3 border-l border-border/40 space-y-0.5 py-1">
              {[...canvasItems]
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((ci) => (
                  <button
                    key={ci.id}
                    type="button"
                    onClick={() => {
                      navigate(wsPath);
                      selectItem(ci.id);
                    }}
                    onDoubleClick={() => {
                      openItem(ci.id);
                    }}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] transition-all duration-150 truncate',
                      selectedItemId === ci.id
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-sidebar-foreground',
                    )}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3 w-3 shrink-0"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="truncate">{ci.name}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={ws.id}
        to={wsPath}
        className={cn(
          'flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] transition-all duration-150 truncate',
          wsActive
            ? 'bg-muted text-foreground font-medium shadow-sm'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-sidebar-foreground',
        )}
      >
        <span className="truncate">{ws.name}</span>
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'relative z-20 flex flex-col border-r border-border/60 bg-sidebar/80 backdrop-blur-xl text-sidebar-foreground transition-all duration-200',
        sidebarCollapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Top Bar / Profile Section */}
      <div className="p-2 mb-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50 transition-colors w-full outline-none group',
                sidebarCollapsed ? 'justify-center' : 'justify-between',
              )}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                {/* Avatar */}
                <div className="size-8 shrink-0 bg-gradient-to-br from-primary to-primary/60 rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm shadow-sm ring-1 ring-black/5 dark:ring-white/10">
                  {initial}
                </div>

                {/* User Info (Hidden when collapsed) */}
                {!sidebarCollapsed && (
                  <div className="flex flex-col items-start text-left truncate">
                    <span className="font-semibold text-sm leading-none truncate w-full">{displayName}</span>
                    <span className="text-xs text-muted-foreground leading-none mt-1 truncate w-full">
                      {email}
                    </span>
                  </div>
                )}
              </div>

              {/* Chevron (Hidden when collapsed) */}
              {!sidebarCollapsed && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0"
                >
                  <path d="m7 15 5 5 5-5" />
                  <path d="m7 9 5-5 5 5" />
                </svg>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={sidebarCollapsed ? 'right' : 'bottom'}
            align="start"
            className="w-60 ml-1 mt-1 rounded-xl border-border/60 shadow-xl shadow-black/5 bg-background/95 backdrop-blur-md p-1.5"
          >
            <div className="px-2 py-2 flex items-center gap-3">
              <div className="size-10 shrink-0 bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center text-primary-foreground font-bold text-lg shadow-sm ring-1 ring-black/5 dark:ring-white/10">
                {initial}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-sm">{displayName}</span>
                <span className="text-xs text-muted-foreground">{email}</span>
              </div>
            </div>

            <DropdownMenuSeparator className="bg-border/50 my-1" />

            <div className="px-2 py-1.5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Account
              </p>
            </div>

            <Link to="/settings">
              <DropdownMenuItem className="rounded-lg cursor-pointer py-2 focus:bg-primary/10 focus:text-primary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-2 size-4 opacity-70"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Profile
              </DropdownMenuItem>
            </Link>
            <Link to="/settings">
              <DropdownMenuItem className="rounded-lg cursor-pointer py-2 focus:bg-primary/10 focus:text-primary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-2 size-4 opacity-70"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
                Settings
              </DropdownMenuItem>
            </Link>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="rounded-lg cursor-pointer py-2 focus:bg-primary/10 focus:text-primary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-2 size-4 opacity-70"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                Theme
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="rounded-xl border-border/60 shadow-xl bg-background/95 backdrop-blur-md p-1">
                  <DropdownMenuItem
                    className="rounded-lg cursor-pointer py-2"
                    onClick={() => setTheme('light')}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2 size-4 opacity-70"
                    >
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="1" y1="12" x2="3" y2="12" />
                      <line x1="21" y1="12" x2="23" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </svg>
                    Light
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="rounded-lg cursor-pointer py-2"
                    onClick={() => setTheme('dark')}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2 size-4 opacity-70"
                    >
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                    Dark
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="rounded-lg cursor-pointer py-2"
                    onClick={() => setTheme('system')}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2 size-4 opacity-70"
                    >
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    System
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuSeparator className="bg-border/50 my-1" />

            <DropdownMenuItem
              className="rounded-lg cursor-pointer py-2 focus:bg-primary/10 focus:text-primary"
              onClick={() => alert('Help & Support coming soon')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2 size-4 opacity-70"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Help & Support
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-border/50 my-1" />

            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10 rounded-lg cursor-pointer py-2"
              onClick={() => {
                if (DEV_AUTH_BYPASS) {
                  window.location.href = ROUTES.SIGN_IN;
                } else {
                  clerk?.signOut({ redirectUrl: ROUTES.SIGN_IN });
                }
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2 size-4 opacity-70"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {navItems.map((item) => {
          const isWorkspacesItem = item.href === ROUTES.WORKSPACES;
          const isActive =
            item.href === ROUTES.HOME ? location.pathname === ROUTES.HOME : location.pathname.startsWith(item.href);

          if (isWorkspacesItem && !sidebarCollapsed) {
            const hasWorkspaces = topLevel.length > 0;
            return (
              <div key={item.href} className="space-y-0.5">
                {/* Workspaces header row — chevron only when workspaces exist */}
                <div className="flex items-center">
                  {hasWorkspaces && (
                    <button
                      type="button"
                      onClick={() => setWorkspacesOpen((o) => !o)}
                      className="flex h-6 w-4 items-center justify-center text-muted-foreground"
                      aria-label={workspacesOpen ? 'Collapse workspaces' : 'Expand workspaces'}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={cn(
                          'h-3 w-3 transition-transform duration-150',
                          workspacesOpen && 'rotate-90',
                        )}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  )}
                  <Link
                    to={item.href}
                    className={cn(
                      'flex flex-1 items-center gap-2.5 rounded-lg py-1.5 text-[14px] transition-all duration-150',
                      hasWorkspaces ? 'px-2' : 'px-2.5',
                      isActive
                        ? 'bg-muted text-foreground font-medium shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-sidebar-foreground active:scale-[0.98]',
                    )}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                </div>

                {/* Workspace sub-items */}
                {workspacesOpen && topLevel.length > 0 && (
                  <div className="ml-4 pl-3 border-l border-border/40 space-y-0.5 py-1">
                    {topLevel.map((ws) => renderWorkspaceItem(ws))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[14px] transition-all duration-150',
                isActive
                  ? 'bg-muted text-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-sidebar-foreground active:scale-[0.98]',
                sidebarCollapsed && 'justify-center px-2',
              )}
            >
              {item.icon}
              {!sidebarCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom collapse button */}
      <div className="p-3 border-t border-border/50 mt-auto">
        <button
          type="button"
          onClick={toggleSidebar}
          className={cn(
            'flex items-center justify-center rounded-lg p-1 text-muted-foreground hover:bg-muted/60 hover:text-primary transition-all duration-150 active:scale-90',
            sidebarCollapsed && 'w-full',
          )}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="12" y1="3" x2="12" y2="21" />
              <rect
                x="12"
                y="3"
                width="9"
                height="18"
                rx="0"
                fill="currentColor"
                opacity="0.15"
                stroke="none"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="10" y1="3" x2="10" y2="21" />
              <rect
                x="10"
                y="3"
                width="11"
                height="18"
                rx="0"
                fill="currentColor"
                opacity="0.15"
                stroke="none"
              />
            </svg>
          )}
        </button>
      </div>
    </aside>
  );
}
