import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@a4/ui';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';
import { computeAlignment, computeSpacing } from '../../lib/canvas-utils';
import { useTheme } from '../../hooks/useTheme';
import { SecretCardContent } from './secret-card-content';
import { NoteCardContent } from './note-card-content';
import { TableCardContent } from './table-card-content';
import { KpiCardContent } from './kpi-card-content';
import { ChartCardContent } from './chart-card-content';
import { FileCardContent } from './file-card-content';

const MIN_SIZE = 50;
const HANDLE_SIZE = 8;

type HandleDir = 'nw' | 'ne' | 'sw' | 'se';

const handleCursors: Record<HandleDir, string> = {
  nw: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  se: 'nwse-resize',
};

const handles: { dir: HandleDir; style: React.CSSProperties }[] = [
  { dir: 'nw', style: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 } },
  { dir: 'ne', style: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 } },
  { dir: 'sw', style: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 } },
  { dir: 'se', style: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 } },
];

const anchorConfigs = [
  { anchor: 'top' as const, style: { top: -5, left: '50%', marginLeft: -5 } },
  { anchor: 'bottom' as const, style: { bottom: -5, left: '50%', marginLeft: -5 } },
  { anchor: 'left' as const, style: { left: -5, top: '50%', marginTop: -5 } },
  { anchor: 'right' as const, style: { right: -5, top: '50%', marginTop: -5 } },
];

interface CanvasItemRendererProps {
  item: CanvasItem;
  zoom: number;
  pan: { x: number; y: number };
  isSelected: boolean;
  isHighlighted?: boolean;
  activeTool: 'cursor' | 'grab';
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onAnchorMouseDown?: (itemId: string, anchor: 'top' | 'bottom' | 'left' | 'right', e: React.MouseEvent) => void;
  onAnchorMouseUp?: (itemId: string, anchor: 'top' | 'bottom' | 'left' | 'right') => void;
  isDrawingConnection?: boolean;
  onRequestUnlock?: () => void;
}

/** The document editor renders at 816px wide with p-16 (64px) padding. */
const DOC_WIDTH = 816;

function A4PageContent({ item }: { item: CanvasItem }) {
  const blocks = (item.data?.content as any[] | undefined) ?? undefined;
  const { resolvedTheme } = useTheme();

  const initialContent = useMemo(() => blocks, [item.id]);
  const editor = useCreateBlockNote({ initialContent }, [item.id]);

  const hasContent = blocks && blocks.some((b: any) => {
    if (['divider', 'image', 'video', 'audio', 'table'].includes(b.type)) return true;
    if (!b.content) return false;
    if (Array.isArray(b.content))
      return b.content.some((c: any) => (c.type === 'text' && c.text) || (c.type === 'link'));
    if (b.content?.type === 'tableContent') return true;
    return false;
  });

  // Scale from the editor's native width (816px) down to the item's logical canvas width.
  // Zoom is handled by the universal scale wrapper in CanvasItemRenderer.
  const scale = item.width / DOC_WIDTH;

  return (
    <div className="h-full w-full bg-white dark:bg-zinc-50 border border-border/60 shadow-md overflow-hidden">
      {hasContent && (
        <div
          className="pointer-events-none select-none origin-top-left"
          style={{ width: DOC_WIDTH, transform: `scale(${scale})` }}
        >
          <div className="p-16">
            <BlockNoteView
              editor={editor}
              editable={false}
              theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export const CanvasItemRenderer = memo(function CanvasItemRenderer({ item, zoom, pan, isSelected, isHighlighted, activeTool, onSelect, onOpen, onAnchorMouseDown, onAnchorMouseUp, isDrawingConnection, onRequestUnlock }: CanvasItemRendererProps) {
  const moveItemWithGuides = useCanvasStore((s) => s.moveItemWithGuides);
  const resizeItemWithGuides = useCanvasStore((s) => s.resizeItemWithGuides);
  const renameItem = useCanvasStore((s) => s.renameItem);
  const removeItem = useCanvasStore((s) => s.removeItem);
  const duplicateItem = useCanvasStore((s) => s.duplicateItem);
  const bringToFront = useCanvasStore((s) => s.bringToFront);
  const sendToBack = useCanvasStore((s) => s.sendToBack);
  const pendingRenameId = useCanvasStore((s) => s.pendingRenameId);
  const clearPendingRename = useCanvasStore((s) => s.clearPendingRename);
  const clearAlignmentGuides = useCanvasStore((s) => s.clearAlignmentGuides);
  const clearSpacingGuides = useCanvasStore((s) => s.clearSpacingGuides);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.name);
  const [isEditingNote, setIsEditingNote] = useState(false);
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

  // Ref-based listener pattern: update handler every render (cheap), mount listeners once
  const mouseMoveRef = useRef<((e: MouseEvent) => void) | undefined>(undefined);
  mouseMoveRef.current = (e: MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;

    const dx = (e.clientX - d.startMouseX) / zoom;
    const dy = (e.clientY - d.startMouseY) / zoom;

    if (d.mode === 'move') {
      const tentative: CanvasItem = { ...item, x: d.startX + dx, y: d.startY + dy };
      // Read allItems imperatively to avoid O(N) subscription per item
      const allItems = useCanvasStore.getState().items;
      const alignment = computeAlignment(tentative, allItems);
      const spacing = computeSpacing(tentative, allItems);

      let finalSnapX = alignment.snapDeltaX;
      if (spacing.snapDeltaX !== 0) {
        if (alignment.snapDeltaX === 0 || Math.abs(spacing.snapDeltaX) <= Math.abs(alignment.snapDeltaX)) {
          finalSnapX = spacing.snapDeltaX;
        }
      }
      let finalSnapY = alignment.snapDeltaY;
      if (spacing.snapDeltaY !== 0) {
        if (alignment.snapDeltaY === 0 || Math.abs(spacing.snapDeltaY) <= Math.abs(alignment.snapDeltaY)) {
          finalSnapY = spacing.snapDeltaY;
        }
      }

      const guides = [
        ...(finalSnapX === alignment.snapDeltaX && alignment.snapDeltaX !== 0
          ? alignment.guides.filter(g => g.type === 'vertical') : []),
        ...(finalSnapY === alignment.snapDeltaY && alignment.snapDeltaY !== 0
          ? alignment.guides.filter(g => g.type === 'horizontal') : []),
      ];
      // Single batched store update instead of 3 separate set() calls
      moveItemWithGuides(item.id, tentative.x + finalSnapX, tentative.y + finalSnapY, guides, spacing.spacingGuides);
    } else if (d.mode === 'resize' && d.handle) {
      const freeResize = item.type === 'note' || item.type === 'table-card' || item.type === 'kpi-card' || item.type === 'chart-card' || item.type === 'file-card';

      let newW: number;
      let newH: number;

      if (freeResize) {
        const dxSign = d.handle === 'nw' || d.handle === 'sw' ? -1 : 1;
        const dySign = d.handle === 'nw' || d.handle === 'ne' ? -1 : 1;
        newW = Math.max(MIN_SIZE, d.startW + dx * dxSign);
        newH = Math.max(MIN_SIZE, d.startH + dy * dySign);
      } else {
        const aspect = d.startW / d.startH;

        let delta: number;
        if (d.handle === 'se') {
          delta = Math.abs(dx) > Math.abs(dy) ? dx : dy * aspect;
        } else if (d.handle === 'sw') {
          delta = Math.abs(-dx) > Math.abs(dy) ? -dx : dy * aspect;
        } else if (d.handle === 'ne') {
          delta = Math.abs(dx) > Math.abs(-dy) ? dx : -dy * aspect;
        } else {
          delta = Math.abs(-dx) > Math.abs(-dy) ? -dx : -dy * aspect;
        }

        newW = d.startW + delta;
        newH = newW / aspect;

        if (newW < MIN_SIZE) {
          newW = MIN_SIZE;
          newH = newW / aspect;
        }
      }

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

      const tentative: CanvasItem = { ...item, x: newX, y: newY, width: newW, height: newH };
      const allItems = useCanvasStore.getState().items;
      const alignment = computeAlignment(tentative, allItems);
      const spacing = computeSpacing(tentative, allItems);

      let finalSnapX = alignment.snapDeltaX;
      if (spacing.snapDeltaX !== 0) {
        if (alignment.snapDeltaX === 0 || Math.abs(spacing.snapDeltaX) <= Math.abs(alignment.snapDeltaX)) {
          finalSnapX = spacing.snapDeltaX;
        }
      }
      let finalSnapY = alignment.snapDeltaY;
      if (spacing.snapDeltaY !== 0) {
        if (alignment.snapDeltaY === 0 || Math.abs(spacing.snapDeltaY) <= Math.abs(alignment.snapDeltaY)) {
          finalSnapY = spacing.snapDeltaY;
        }
      }

      const guides = [
        ...(finalSnapX === alignment.snapDeltaX && alignment.snapDeltaX !== 0
          ? alignment.guides.filter(g => g.type === 'vertical') : []),
        ...(finalSnapY === alignment.snapDeltaY && alignment.snapDeltaY !== 0
          ? alignment.guides.filter(g => g.type === 'horizontal') : []),
      ];
      // Single batched store update
      resizeItemWithGuides(item.id, newX + finalSnapX, newY + finalSnapY, newW, newH, guides, spacing.spacingGuides);
    }
  };

  const mouseUpRef = useRef<(() => void) | undefined>(undefined);
  mouseUpRef.current = () => {
    dragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    clearAlignmentGuides();
    clearSpacingGuides();
  };

  // Mount window listeners once — never re-added
  useEffect(() => {
    const onMove = (e: MouseEvent) => mouseMoveRef.current?.(e);
    const onUp = () => mouseUpRef.current?.();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

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

  return (
    <div
      className={cn(
        'absolute group',
        isSelected && !isHighlighted && 'ring-2 ring-primary ring-offset-1',
        isHighlighted && 'ring-2 ring-primary rounded-sm',
      )}
      style={{ left, top, width, height, zIndex: item.zIndex }}
    >
      {/* Item body — draggable in grab mode, selectable in cursor mode */}
      <div
        className={cn(
          'h-full w-full overflow-hidden',
          activeTool === 'grab' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        )}
        onMouseDown={handleBodyMouseDown}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (item.type === 'note') {
            setIsEditingNote(true);
          } else {
            onOpen(item.id);
          }
        }}
      >
        {/* Universal scale wrapper — content renders at logical canvas size,
            CSS transform handles zoom. GPU-composited, no reflow on zoom. */}
        <div
          className="origin-top-left"
          style={{ width: item.width, height: item.height, transform: `scale(${zoom})` }}
        >
          {item.type === 'a4-page' ? (
            <A4PageContent item={item} />
          ) : item.type === 'secret-card' ? (
            <SecretCardContent item={item} onRequestUnlock={onRequestUnlock ?? (() => {})} />
          ) : item.type === 'note' ? (
            <NoteCardContent
              item={item}
              isEditing={isEditingNote}
              onStartEdit={() => setIsEditingNote(true)}
              onStopEdit={() => setIsEditingNote(false)}
            />
          ) : item.type === 'table-card' ? (
            <TableCardContent item={item} />
          ) : item.type === 'kpi-card' ? (
            <KpiCardContent item={item} />
          ) : item.type === 'chart-card' ? (
            <ChartCardContent item={item} />
          ) : item.type === 'file-card' ? (
            <FileCardContent item={item} />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-sm border border-border/40 bg-muted/20 text-xs text-muted-foreground">
              {item.type}
            </div>
          )}
        </div>
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
          <span className="text-[12px] font-medium text-foreground truncate max-w-[200px] block">
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

      {/* Connection anchor dots — cursor mode only */}
      {activeTool === 'cursor' && (
        <>
          {anchorConfigs.map((a) => (
            <div
              key={a.anchor}
              className={cn(
                'absolute rounded-full bg-green-500 border-2 border-white dark:border-zinc-900 shadow-sm transition-opacity duration-150 z-[2]',
                isDrawingConnection || isSelected
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100',
              )}
              style={{ ...a.style, width: 10, height: 10, cursor: 'crosshair' }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onAnchorMouseDown?.(item.id, a.anchor, e);
              }}
              onMouseUp={(e) => {
                e.stopPropagation();
                onAnchorMouseUp?.(item.id, a.anchor);
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}, (prev, next) => {
  return prev.item === next.item
    && prev.zoom === next.zoom
    && prev.pan.x === next.pan.x && prev.pan.y === next.pan.y
    && prev.isSelected === next.isSelected
    && prev.isHighlighted === next.isHighlighted
    && prev.activeTool === next.activeTool
    && prev.isDrawingConnection === next.isDrawingConnection
    && prev.onSelect === next.onSelect
    && prev.onOpen === next.onOpen
    && prev.onAnchorMouseDown === next.onAnchorMouseDown
    && prev.onAnchorMouseUp === next.onAnchorMouseUp
    && prev.onRequestUnlock === next.onRequestUnlock;
});
