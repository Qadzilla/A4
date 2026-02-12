import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@a4/ui';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

const MIN_SIZE = 50;
const HANDLE_SIZE = 8;

type HandleDir = 'nw' | 'ne' | 'sw' | 'se';

const handleCursors: Record<HandleDir, string> = {
  nw: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  se: 'nwse-resize',
};

interface CanvasItemRendererProps {
  item: CanvasItem;
  zoom: number;
  pan: { x: number; y: number };
  isSelected: boolean;
  activeTool: 'cursor' | 'grab';
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

/** The document editor renders at 816px wide with p-16 (64px) padding. */
const DOC_WIDTH = 816;

function getBlockText(block: any): string {
  if (!block?.content) return '';
  if (Array.isArray(block.content)) {
    return block.content
      .map((c: any) => (c.type === 'text' ? c.text : ''))
      .join('');
  }
  return '';
}

function BlockPreview({ blocks }: { blocks: any[] }) {
  return (
    <div className="p-16 space-y-[3px]">
      {blocks.map((block, i) => {
        const text = getBlockText(block);
        if (!text && block.type !== 'checkListItem') return null;
        const type = block.type as string;
        const level = block.props?.level;

        if (type === 'heading') {
          const cls =
            level === 1
              ? 'text-[42px] font-bold leading-tight'
              : level === 2
                ? 'text-[28px] font-semibold leading-tight'
                : 'text-[18px] font-semibold leading-tight';
          return <p key={i} className={cn(cls, 'text-zinc-900')}>{text}</p>;
        }

        if (type === 'bulletListItem') {
          return (
            <div key={i} className="flex items-baseline gap-[6px] pl-[24px]">
              <span className="text-[14px] text-zinc-500 leading-snug shrink-0">&#8226;</span>
              <p className="text-[14px] text-zinc-700 leading-snug">{text}</p>
            </div>
          );
        }

        if (type === 'numberedListItem') {
          return (
            <div key={i} className="flex items-baseline gap-[6px] pl-[24px]">
              <span className="text-[14px] text-zinc-500 leading-snug shrink-0">{(block.props?.index ?? i) + 1}.</span>
              <p className="text-[14px] text-zinc-700 leading-snug">{text}</p>
            </div>
          );
        }

        if (type === 'checkListItem') {
          return (
            <div key={i} className="flex items-center gap-[6px] pl-[24px]">
              <span className="text-[14px] leading-none shrink-0">{block.props?.checked ? '\u2611' : '\u2610'}</span>
              <p className="text-[14px] text-zinc-700 leading-snug">{text}</p>
            </div>
          );
        }

        return (
          <p key={i} className="text-[14px] text-zinc-700 leading-snug">{text}</p>
        );
      })}
    </div>
  );
}

function A4PageContent({ item, zoom }: { item: CanvasItem; zoom: number }) {
  const blocks = (item.data?.content as any[] | undefined) ?? [];
  const hasContent = blocks.some((b) => getBlockText(b).length > 0);
  const scale = (item.width * zoom) / DOC_WIDTH;

  return (
    <div className="h-full w-full bg-white dark:bg-zinc-50 border border-black/80 dark:border-border/40 shadow-md overflow-hidden">
      {hasContent && (
        <div
          className="pointer-events-none select-none origin-top-left"
          style={{ width: DOC_WIDTH, transform: `scale(${scale})` }}
        >
          <BlockPreview blocks={blocks} />
        </div>
      )}
    </div>
  );
}

export function CanvasItemRenderer({ item, zoom, pan, isSelected, activeTool, onSelect, onOpen }: CanvasItemRendererProps) {
  const moveItem = useCanvasStore((s) => s.moveItem);
  const resizeItem = useCanvasStore((s) => s.resizeItem);
  const renameItem = useCanvasStore((s) => s.renameItem);
  const removeItem = useCanvasStore((s) => s.removeItem);
  const duplicateItem = useCanvasStore((s) => s.duplicateItem);
  const bringToFront = useCanvasStore((s) => s.bringToFront);
  const sendToBack = useCanvasStore((s) => s.sendToBack);
  const pendingRenameId = useCanvasStore((s) => s.pendingRenameId);
  const clearPendingRename = useCanvasStore((s) => s.clearPendingRename);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Auto-enter rename mode when this item was just created
  useEffect(() => {
    if (pendingRenameId === item.id) {
      setRenameValue(item.name);
      setIsRenaming(true);
      clearPendingRename();
    }
  }, [pendingRenameId, item.id, item.name, clearPendingRename]);

  // Refs to track drag state without re-renders during movement
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    handle?: HandleDir;
    startMouseX: number;
    startMouseY: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const left = item.x * zoom + pan.x;
  const top = item.y * zoom + pan.y;
  const width = item.width * zoom;
  const height = item.height * zoom;

  // Focus rename input when it appears
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== item.name) {
      renameItem(item.id, trimmed);
    } else {
      setRenameValue(item.name);
    }
    setIsRenaming(false);
  };

  const onWindowMouseMove = useCallback(
    (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;

      const dx = (e.clientX - d.startMouseX) / zoom;
      const dy = (e.clientY - d.startMouseY) / zoom;

      if (d.mode === 'move') {
        moveItem(item.id, d.startX + dx, d.startY + dy);
      } else if (d.mode === 'resize' && d.handle) {
        const aspect = d.startW / d.startH;

        // Use the dominant axis to drive proportional resize
        let delta: number;
        if (d.handle === 'se') {
          delta = Math.abs(dx) > Math.abs(dy) ? dx : dy * aspect;
        } else if (d.handle === 'sw') {
          delta = Math.abs(-dx) > Math.abs(dy) ? -dx : dy * aspect;
        } else if (d.handle === 'ne') {
          delta = Math.abs(dx) > Math.abs(-dy) ? dx : -dy * aspect;
        } else {
          // nw
          delta = Math.abs(-dx) > Math.abs(-dy) ? -dx : -dy * aspect;
        }

        let newW = d.startW + delta;
        let newH = newW / aspect;

        // Enforce minimum size
        if (newW < MIN_SIZE) {
          newW = MIN_SIZE;
          newH = newW / aspect;
        }

        // Compute position based on anchor corner (opposite to handle)
        let newX = d.startX;
        let newY = d.startY;
        if (d.handle === 'nw') {
          newX = d.startX + d.startW - newW;
          newY = d.startY + d.startH - newH;
        } else if (d.handle === 'ne') {
          newY = d.startY + d.startH - newH;
        } else if (d.handle === 'sw') {
          newX = d.startX + d.startW - newW;
        }
        // se: position stays at top-left, no adjustment needed

        resizeItem(item.id, newX, newY, newW, newH);
      }
    },
    [item.id, zoom, moveItem, resizeItem],
  );

  const onWindowMouseUp = useCallback(() => {
    dragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // Attach/detach window listeners
  useEffect(() => {
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [onWindowMouseMove, onWindowMouseUp]);

  const handleBodyMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(item.id);
    if (activeTool !== 'grab') return;
    bringToFront(item.id);
    dragRef.current = {
      mode: 'move',
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: item.x,
      startY: item.y,
      startW: item.width,
      startH: item.height,
    };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  };

  const startResize = (handle: HandleDir, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeTool !== 'grab') return;
    onSelect(item.id);
    dragRef.current = {
      mode: 'resize',
      handle,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: item.x,
      startY: item.y,
      startW: item.width,
      startH: item.height,
    };
    document.body.style.cursor = handleCursors[handle];
    document.body.style.userSelect = 'none';
  };

  const handles: { dir: HandleDir; style: React.CSSProperties }[] = [
    { dir: 'nw', style: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 } },
    { dir: 'ne', style: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 } },
    { dir: 'sw', style: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 } },
    { dir: 'se', style: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 } },
  ];

  return (
    <div
      className={cn(
        'absolute group',
        isSelected && 'ring-2 ring-primary ring-offset-1',
      )}
      style={{ left, top, width, height, zIndex: item.zIndex }}
    >
      {/* Item body — draggable in grab mode, selectable in cursor mode */}
      <div
        className={cn(
          'h-full w-full',
          activeTool === 'grab' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        )}
        onMouseDown={handleBodyMouseDown}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpen(item.id);
        }}
      >
        {item.type === 'a4-page' ? (
          <A4PageContent item={item} zoom={zoom} />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-sm border border-border/40 bg-muted/20 text-xs text-muted-foreground">
            {item.type}
          </div>
        )}
      </div>

      {/* 3-dot context menu — visible on hover or when selected */}
      <div
        className={cn(
          'absolute -top-3 -right-3 transition-opacity',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        style={{ zIndex: 2 }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded-full border border-border bg-background shadow-sm hover:bg-muted transition-colors"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item.id);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-3.5 text-muted-foreground">
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4} className="w-40">
            <DropdownMenuItem
              className="gap-2 text-[13px]"
              onSelect={() => {
                setRenameValue(item.name);
                setIsRenaming(true);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-[13px]"
              onSelect={() => duplicateItem(item.id)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-[13px]"
              onSelect={() => bringToFront(item.id)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                <path d="m5 12 7-7 7 7" />
                <path d="M12 19V5" />
              </svg>
              Bring to front
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-[13px]"
              onSelect={() => sendToBack(item.id)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                <path d="m19 12-7 7-7-7" />
                <path d="M12 5v14" />
              </svg>
              Send to back
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-[13px] text-destructive focus:text-destructive"
              onSelect={() => removeItem(item.id)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Floating name label / inline rename — above top-left */}
      <div
        className="absolute left-0 z-10 pointer-events-none"
        style={{ bottom: height + 4 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setRenameValue(item.name);
                setIsRenaming(false);
              }
            }}
            className="pointer-events-auto w-44 rounded-md border border-border bg-background px-2 py-1 text-[12px] text-primary font-medium shadow-md outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
          />
        ) : (
          <span className="text-[12px] font-medium text-black dark:text-primary truncate max-w-[200px] block">
            {item.name}
          </span>
        )}
      </div>

      {/* Resize handles — only when selected in grab mode */}
      {isSelected && activeTool === 'grab' &&
        handles.map((h) => (
          <div
            key={h.dir}
            className="absolute rounded-full border-2 border-primary bg-background shadow-sm"
            style={{
              ...h.style,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              cursor: handleCursors[h.dir],
              zIndex: 1,
            }}
            onMouseDown={(e) => startResize(h.dir, e)}
          />
        ))}
    </div>
  );
}
