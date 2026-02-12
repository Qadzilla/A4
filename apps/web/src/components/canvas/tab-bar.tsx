import { cn } from '@a4/ui';
import { useCanvasStore } from '../../stores/canvas-store';

interface TabBarProps {
  workspaceName: string;
  onCloseWorkspace: () => void;
  onFocusItem: (id: string) => void;
}

export function TabBar({ workspaceName, onCloseWorkspace, onFocusItem }: TabBarProps) {
  const openItemIds = useCanvasStore((s) => s.openItemIds);
  const activeItemId = useCanvasStore((s) => s.activeItemId);
  const items = useCanvasStore((s) => s.items);
  const setActiveItem = useCanvasStore((s) => s.setActiveItem);
  const closeItem = useCanvasStore((s) => s.closeItem);
  const renameItem = useCanvasStore((s) => s.renameItem);
  const isCanvasActive = activeItemId === null;

  return (
    <div className="flex items-center h-9 border-b border-border/60 bg-background/80 backdrop-blur-sm overflow-x-auto scrollbar-none">
      {/* Workspace / canvas tab — always present */}
      <button
        type="button"
        className={cn(
          'group/tab relative flex items-center gap-1.5 h-full px-3 text-[12px] shrink-0 max-w-[160px] border-r border-border/40 transition-colors',
          isCanvasActive
            ? 'bg-background border-b-2 border-b-primary text-foreground'
            : 'text-muted-foreground hover:bg-muted/40',
        )}
        onClick={() => setActiveItem(null)}
      >
        {/* Grid/canvas icon */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0">
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
        </svg>
        <span className="truncate">{workspaceName}</span>

        {/* Close — navigates to parent */}
        <span
          role="button"
          tabIndex={-1}
          className={cn(
            'ml-auto flex items-center justify-center size-4 rounded-sm hover:bg-muted transition-colors shrink-0',
            isCanvasActive ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
          )}
          onClick={(e) => {
            e.stopPropagation();
            onCloseWorkspace();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </span>
      </button>

      {/* Open document tabs */}
      {openItemIds.map((id) => {
        const item = items.find((i) => i.id === id);
        if (!item) return null;
        const isActive = activeItemId === id;

        return (
          <button
            key={id}
            type="button"
            className={cn(
              'group/tab relative flex items-center gap-1.5 h-full px-3 text-[12px] shrink-0 max-w-[160px] border-r border-border/40 transition-colors',
              isActive
                ? 'bg-background border-b-2 border-b-primary text-foreground'
                : 'text-muted-foreground hover:bg-muted/40',
            )}
            onClick={() => {
              setActiveItem(id);
              onFocusItem(id);
            }}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                closeItem(id);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              const newName = window.prompt('Rename', item.name);
              if (newName?.trim()) {
                renameItem(id, newName.trim());
              }
            }}
          >
            {/* File icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>

            <span className="truncate">{item.name}</span>

            {/* Close button */}
            <span
              role="button"
              tabIndex={-1}
              className={cn(
                'ml-auto flex items-center justify-center size-4 rounded-sm hover:bg-muted transition-colors shrink-0',
                isActive ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
              )}
              onClick={(e) => {
                e.stopPropagation();
                closeItem(id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          </button>
        );
      })}
    </div>
  );
}
