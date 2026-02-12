import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react';
import {
  Button,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  cn,
} from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useWorkspaceThumbnail } from '../../../../hooks/useWorkspaceThumbnail';
import { useCanvasDrop } from '../../../../hooks/useCanvasDrop';
import { useCanvasStore } from '../../../../stores/canvas-store';
import { CanvasItemRenderer } from '../../../../components/canvas/canvas-item-renderer';
import { GeneralToolPanel } from '../../../../components/canvas/general-tool-panel';
import { TabBar } from '../../../../components/canvas/tab-bar';
import { DocumentView } from '../../../../components/canvas/document-view';
import { useTRPC } from '../../../../lib/trpc';

const BASE_DOT = 1;
const BASE_GRID = 24;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

const tools = [
  {
    id: 'general',
    label: 'General',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
      </svg>
    ),
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    id: 'tax',
    label: 'Tax',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    id: 'data',
    label: 'Data',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
  {
    id: 'charts',
    label: 'Charts',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="17" x2="9" y2="11" />
        <line x1="12" y1="17" x2="12" y2="8" />
        <line x1="15" y1="17" x2="15" y2="13" />
      </svg>
    ),
  },
  {
    id: 'import',
    label: 'Import',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
];

export default function WorkspaceDetailPage() {
  const { id } = useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: workspace } = useQuery(trpc.workspace.getById.queryOptions({ id: id! }));
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [topic, setTopic] = useState('general');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [importedFiles, setImportedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Canvas zoom & pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  // Tool selector & highlights
  const [activeTool, setActiveTool] = useState<'cursor' | 'grab'>('cursor');
  const [highlight, setHighlight] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [drawingRect, setDrawingRect] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  // Canvas items
  const { items, selectedItemId, selectItem, openItemIds, openItem, setActiveItem, activeItemId } = useCanvasStore();
  const { dragState, startDrag, handleCanvasDrop } = useCanvasDrop();

  useWorkspaceThumbnail(canvasRef, id);

  const restoreMutation = useMutation(
    trpc.workspace.restore.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.listTrashed.queryKey() });
        await queryClient.invalidateQueries({
          queryKey: trpc.workspace.getById.queryKey({ id: id! }),
        });
      },
    }),
  );

  const permanentDeleteMutation = useMutation(
    trpc.workspace.permanentDelete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.listTrashed.queryKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.list.queryKey() });
        navigate('/workspaces');
      },
    }),
  );

  // Redirect folders to their folder page
  if (workspace?.type === 'folder') {
    return <Navigate to={`/workspaces/${id}/folder`} replace />;
  }

  // Trashed workspace access guard
  if (workspace?.deletedAt) {
    return (
      <Modal open onOpenChange={() => navigate('/workspaces')}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Workspace in Trash</ModalTitle>
          </ModalHeader>
          <p className="text-[13px] text-muted-foreground">
            This workspace is in the trash and cannot be accessed.
          </p>
          <ModalFooter>
            <Button
              variant="outline"
              disabled={restoreMutation.isPending}
              onClick={() =>
                restoreMutation.mutate(
                  { id: id! },
                  { onSuccess: () => navigate(`/workspaces/${id}`) },
                )
              }
            >
              Restore
            </Button>
            <Button
              variant="destructive"
              disabled={permanentDeleteMutation.isPending}
              onClick={() => permanentDeleteMutation.mutate({ id: id! })}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  }

  // Wheel: pinch/ctrl+scroll = zoom, trackpad two-finger = pan, mouse scroll = zoom
  // biome-ignore lint/correctness/useExhaustiveDependencies: canvas ref is stable
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const zoomAtCursor = (e: WheelEvent, sensitivity: number) => {
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = 1 - e.deltaY * sensitivity;

      setZoom((prev) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * factor));
        const s = next / prev;
        setPan((p) => ({ x: mx - s * (mx - p.x), y: my - s * (my - p.y) }));
        return next;
      });
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.ctrlKey || e.metaKey) {
        zoomAtCursor(e, 0.01);
      } else if (e.deltaX !== 0) {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      } else {
        zoomAtCursor(e, 0.005);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    selectItem(null);
    if (activeTool === 'grab') {
      isPanning.current = true;
      lastPoint.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left - pan.x) / zoom;
      const canvasY = (e.clientY - rect.top - pan.y) / zoom;
      setHighlight(null);
      setDrawingRect({ startX: canvasX, startY: canvasY, currentX: canvasX, currentY: canvasY });
    }
  }, [activeTool, pan, zoom, selectItem]);

  const onCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'grab') {
      if (!isPanning.current) return;
      const dx = e.clientX - lastPoint.current.x;
      const dy = e.clientY - lastPoint.current.y;
      lastPoint.current = { x: e.clientX, y: e.clientY };
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else {
      if (!drawingRect) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left - pan.x) / zoom;
      const canvasY = (e.clientY - rect.top - pan.y) / zoom;
      setDrawingRect((prev) => prev ? { ...prev, currentX: canvasX, currentY: canvasY } : null);
    }
  }, [activeTool, drawingRect, pan, zoom]);

  const onCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragState) {
      const rect = e.currentTarget.getBoundingClientRect();
      handleCanvasDrop(rect, pan, zoom);
      return;
    }
    if (activeTool === 'grab') {
      isPanning.current = false;
      (e.currentTarget as HTMLElement).style.cursor = 'grab';
    } else {
      if (!drawingRect) return;
      const x = Math.min(drawingRect.startX, drawingRect.currentX);
      const y = Math.min(drawingRect.startY, drawingRect.currentY);
      const width = Math.abs(drawingRect.currentX - drawingRect.startX);
      const height = Math.abs(drawingRect.currentY - drawingRect.startY);
      if (width > 2 || height > 2) {
        setHighlight({ x, y, width, height });
      }
      setDrawingRect(null);
    }
  }, [activeTool, drawingRect, dragState, handleCanvasDrop, pan, zoom]);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.style.cursor = '';
    }
  }, [activeTool]);

  const onCanvasDoubleClick = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const focusItem = useCallback((id: string) => {
    setActiveItem(id);
    const item = items.find((i) => i.id === id);
    if (!item || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const targetX = rect.width / 2 - (item.x + item.width / 2) * zoom;
    const targetY = rect.height / 2 - (item.y + item.height / 2) * zoom;
    setPan({ x: targetX, y: targetY });
  }, [items, zoom, setActiveItem]);


  const activeItem = activeItemId ? items.find((i) => i.id === activeItemId) ?? null : null;

  const dotSize = BASE_DOT * zoom;
  const gridSize = BASE_GRID * zoom;

  const onFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setImportedFiles((prev) => [...prev, ...Array.from(files)]);
    e.target.value = '';
  }, []);

  const removeFile = useCallback((index: number) => {
    setImportedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-red-400 shrink-0">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-green-400 shrink-0">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  };

  const handleSend = () => {
    if (!message.trim()) return;
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative flex h-full flex-col">
      {/* Tab bar — always visible on canvas */}
      <TabBar
        workspaceName={workspace?.name ?? 'Workspace'}
        onCloseWorkspace={() => {
          const parentId = workspace?.parentId;
          navigate(parentId ? `/workspaces/${parentId}/folder` : '/workspaces');
        }}
        onFocusItem={focusItem}
      />

      {activeItem ? (
        <DocumentView item={activeItem} />
      ) : (
      <div className="relative flex flex-1 min-h-0">
      {/* Main area — workspace canvas */}
      <div
        ref={canvasRef}
        className={cn('relative flex-1 select-none overflow-hidden', activeTool === 'grab' ? 'cursor-grab' : '')}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onCanvasMouseMove}
        onMouseUp={onCanvasMouseUp}
        onMouseLeave={onCanvasMouseUp}
        onDoubleClick={onCanvasDoubleClick}
        style={{
          backgroundImage: `radial-gradient(circle, color-mix(in srgb, var(--color-muted-foreground) 30%, transparent) ${dotSize}px, transparent ${dotSize}px)`,
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Floating pill toolbar */}
        <div className="absolute top-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border/50 bg-background/80 backdrop-blur-md px-1.5 py-1 shadow-xl">
          <button
            type="button"
            onClick={() => setActiveTool('cursor')}
            className={cn(
              'flex items-center justify-center rounded-full p-2.5 transition-all duration-100',
              activeTool === 'cursor'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            title="Cursor"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="size-4">
              <path d="M4 1l14 10.5-6.5 1.5 3.5 7-2.5 1.2-3.5-7L4 18.5V1z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('grab')}
            className={cn(
              'flex items-center justify-center rounded-full p-2.5 transition-all duration-100',
              activeTool === 'grab'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            title="Grab (pan)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
              <polyline points="5 9 2 12 5 15" />
              <polyline points="9 5 12 2 15 5" />
              <polyline points="15 19 12 22 9 19" />
              <polyline points="19 9 22 12 19 15" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="12" y1="2" x2="12" y2="22" />
            </svg>
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button
            type="button"
            onClick={handleResetView}
            className="flex items-center justify-center rounded-full p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-100"
            title="Reset view"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
              <line x1="11" y1="8" x2="11" y2="14" />
            </svg>
          </button>
        </div>

        {/* Maximize button when panel collapsed */}
        {isPanelCollapsed && (
          <button
            type="button"
            onClick={() => setIsPanelCollapsed(false)}
            className="absolute top-4 right-4 z-50 bg-background border border-border p-2 rounded-lg shadow-lg hover:bg-muted transition-colors"
            title="Open panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        )}

        {/* Canvas items */}
        {items.map((item) => (
          <CanvasItemRenderer
            key={item.id}
            item={item}
            zoom={zoom}
            pan={pan}
            isSelected={selectedItemId === item.id}
            activeTool={activeTool}
            onSelect={selectItem}
            onOpen={openItem}
          />
        ))}

        {/* Highlight overlay */}
        <div className="pointer-events-none absolute inset-0">
          {highlight && !drawingRect && (
            <div
              className="absolute rounded-lg border-2 border-primary bg-primary/10 shadow-sm backdrop-blur-[2px]"
              style={{
                left: highlight.x * zoom + pan.x,
                top: highlight.y * zoom + pan.y,
                width: highlight.width * zoom,
                height: highlight.height * zoom,
              }}
            />
          )}
          {drawingRect && (
            <div
              className="absolute rounded-lg border-2 border-dashed border-primary bg-primary/10"
              style={{
                left: Math.min(drawingRect.startX, drawingRect.currentX) * zoom + pan.x,
                top: Math.min(drawingRect.startY, drawingRect.currentY) * zoom + pan.y,
                width: Math.abs(drawingRect.currentX - drawingRect.startX) * zoom,
                height: Math.abs(drawingRect.currentY - drawingRect.startY) * zoom,
              }}
            />
          )}
        </div>
      </div>

      {/* Right panel — Floating Chat Card */}
      <aside
        className={cn(
          'relative z-10 flex flex-col rounded-2xl border border-border/60 bg-card/90 backdrop-blur-xl shadow-2xl animate-slide-in transition-all duration-300 ease-in-out',
          isPanelCollapsed
            ? 'w-0 pr-0 opacity-0 overflow-hidden'
            : 'w-[360px] py-4 pr-4',
        )}
      >
        <div className={cn(
          'flex flex-col h-full rounded-2xl border border-border/60 bg-card/90 backdrop-blur-xl shadow-2xl overflow-hidden',
          isPanelCollapsed && 'invisible',
        )}>
          {/* Tools header + minimize */}
          <div className="border-b border-border/60">
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tools</span>
              <button
                type="button"
                onClick={() => setIsPanelCollapsed(true)}
                className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Minimize panel"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
            </div>
            <nav className="space-y-0.5 px-2 pb-2">
              {tools.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTopic(t.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-all duration-100',
                    topic === t.id
                      ? 'bg-accent text-primary font-medium shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {topic === 'import' ? (
            <>
              {/* Import header */}
              <div className="border-b border-border/60 px-4 py-3">
                <h2 className="font-bold text-sm truncate flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-primary">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Import Files
                </h2>
              </div>

              {/* Import content */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                {/* Dropzone */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".csv,.xlsx,.xls,.pdf"
                  onChange={onFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-3 border-2 border-dashed border-border/60 rounded-2xl p-8 transition-colors duration-200 hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                >
                  <div className="size-10 rounded-xl bg-muted/30 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5 text-muted-foreground/60">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-medium text-foreground">Click to upload files</p>
                    <p className="text-[11px] text-muted-foreground mt-1">CSV, Excel, PDF</p>
                  </div>
                </button>

                {/* File list */}
                {importedFiles.length > 0 && (
                  <div className="space-y-1.5">
                    {importedFiles.map((file, i) => (
                      <div
                        key={`${file.name}-${file.size}-${i}`}
                        className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 py-2"
                      >
                        {getFileIcon(file.name)}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-foreground truncate">{file.name}</p>
                          <p className="text-[11px] text-muted-foreground">{formatFileSize(file.size)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Import action */}
              <div className="border-t border-border/60 p-3">
                <button
                  type="button"
                  disabled={importedFiles.length === 0}
                  className={cn(
                    'w-full py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150',
                    importedFiles.length > 0
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]'
                      : 'bg-muted/40 text-muted-foreground cursor-not-allowed',
                  )}
                >
                  Import{importedFiles.length > 0 ? ` (${importedFiles.length})` : ''}
                </button>
              </div>
            </>
          ) : topic === 'general' ? (
            <>
              {/* General / Tools header */}
              <div className="border-b border-border/60 px-4 py-3">
                <h2 className="font-bold text-sm truncate flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-primary">
                    <rect width="7" height="7" x="3" y="3" rx="1" />
                    <rect width="7" height="7" x="14" y="3" rx="1" />
                    <rect width="7" height="7" x="3" y="14" rx="1" />
                    <rect width="7" height="7" x="14" y="14" rx="1" />
                  </svg>
                  Tools
                </h2>
              </div>
              <GeneralToolPanel onDragStart={startDrag} />
            </>
          ) : (
            <>
              {/* Chat header */}
              <div className="border-b border-border/60 px-4 py-3">
                <h2 className="font-bold text-sm truncate flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-primary">
                    <rect width="7" height="7" x="3" y="3" rx="1" />
                    <rect width="7" height="7" x="14" y="3" rx="1" />
                    <rect width="7" height="7" x="3" y="14" rx="1" />
                    <rect width="7" height="7" x="14" y="14" rx="1" />
                  </svg>
                  {workspace?.name ?? 'Workspace'}
                </h2>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center space-y-3 animate-fade-in">
                      <div className="size-12 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="size-6 text-muted-foreground/40">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Ask anything about this workspace
                      </p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div
                      key={`msg-${msg.role}-${i}`}
                      className={cn('flex w-full animate-slide-up', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[85%] p-3.5 text-sm rounded-2xl shadow-sm',
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-muted/80 backdrop-blur-sm text-foreground rounded-bl-sm border border-border/50',
                        )}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Chat input */}
              <div className="border-t border-border/60 p-3">
                <div className="relative">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask A4..."
                    rows={2}
                    className="w-full min-h-[50px] max-h-[120px] resize-none py-3 pl-4 pr-12 bg-background border border-border/80 rounded-2xl text-[13px] text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/40"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!message.trim()}
                    className={cn(
                      'absolute bottom-2.5 right-2.5 p-2 rounded-xl transition-all duration-150',
                      message.trim()
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-90'
                        : 'bg-muted/40 text-muted-foreground',
                    )}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                      <path d="m5 12 7-7 7 7" />
                      <path d="M12 19V5" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
      </div>
      )}

      {/* Drag ghost */}
      {dragState && (
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{
            left: dragState.ghostX - 42,
            top: dragState.ghostY - 60,
            width: 85,
            height: 120,
          }}
        >
          <div className="h-full w-full rounded-sm border border-primary/40 bg-white shadow-xl dark:bg-zinc-50" />
        </div>
      )}
    </div>
  );
}
