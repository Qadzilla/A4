import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle, cn } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { AccountCardView } from '../../../../components/canvas/account-card-view';
import { BalanceSheetCardView } from '../../../../components/canvas/balance-sheet-card-view';
import { BudgetCardView } from '../../../../components/canvas/budget-card-view';
import { CanvasItemRenderer } from '../../../../components/canvas/canvas-item-renderer';
import { CanvasMinimap } from '../../../../components/canvas/canvas-minimap';
import { CashFlowCardView } from '../../../../components/canvas/cash-flow-card-view';
import { ChartCardView } from '../../../../components/canvas/chart-card-view';
import { DataToolPanel } from '../../../../components/canvas/data-tool-panel';
import { DocumentView } from '../../../../components/canvas/document-view';
import { FileCardView } from '../../../../components/canvas/file-card-view';
import { FinanceToolPanel } from '../../../../components/canvas/finance-tool-panel';
import { GeneralToolPanel } from '../../../../components/canvas/general-tool-panel';
import { InvoiceCardView } from '../../../../components/canvas/invoice-card-view';
import { KpiCardView } from '../../../../components/canvas/kpi-card-view';
import { LedgerCardView } from '../../../../components/canvas/ledger-card-view';
import { LoanCalculatorCardView } from '../../../../components/canvas/loan-calculator-card-view';
import { PnlCardView } from '../../../../components/canvas/pnl-card-view';
import { ReceiptCardView } from '../../../../components/canvas/receipt-card-view';
import { ReportsToolPanel } from '../../../../components/canvas/reports-tool-panel';
import { SecretCardView } from '../../../../components/canvas/secret-card-view';
import { SecretToolPanel } from '../../../../components/canvas/secret-tool-panel';
import { SubscriptionCardView } from '../../../../components/canvas/subscription-card-view';
import { TabBar } from '../../../../components/canvas/tab-bar';
import { TableCardView } from '../../../../components/canvas/table-card-view';
import { TaxEstimatorCardView } from '../../../../components/canvas/tax-estimator-card-view';
import { TaxToolPanel } from '../../../../components/canvas/tax-tool-panel';
import { TimerCardView } from '../../../../components/canvas/timer-card-view';
import { VaultSetupModal } from '../../../../components/vault/vault-setup-modal';
import { VaultUnlockModal } from '../../../../components/vault/vault-unlock-modal';
import { useAuthToken } from '../../../../hooks/useAuthToken';
import { useCanvasDrop } from '../../../../hooks/useCanvasDrop';
import { useWorkspaceThumbnail } from '../../../../hooks/useWorkspaceThumbnail';
import { bezierPath, getAnchorScreenPos } from '../../../../lib/canvas-utils';
import type { AnchorPosition, CanvasConnection } from '../../../../lib/canvas-utils';
import {
  formatFileSize,
  generatePreview,
  getFileTypeLabel,
  uploadFile,
} from '../../../../lib/file-utils';
import type { FileCardData } from '../../../../lib/file-utils';
import { useTRPC } from '../../../../lib/trpc';
import { getCachedKey } from '../../../../lib/vault-crypto';
import { useCanvasStore } from '../../../../stores/canvas-store';

const BASE_GRID = 24;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

const tools = [
  {
    id: 'general',
    label: 'General',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
      </svg>
    ),
  },
  {
    id: 'vault',
    label: 'Vault',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    id: 'data',
    label: 'Data',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    id: 'tax',
    label: 'Tax',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="8" y1="6" x2="16" y2="6" />
        <line x1="8" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="12" y2="14" />
        <line x1="8" y1="18" x2="10" y2="18" />
      </svg>
    ),
  },
  {
    id: 'import',
    label: 'Import',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
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
  const [uploadedFiles, setUploadedFiles] = useState<FileCardData[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const getToken = useAuthToken();

  // Canvas zoom & pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState(0); // counter to trigger grid redraws on resize
  const isPanning = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  // Tool selector & highlights
  const [activeTool, setActiveTool] = useState<'cursor' | 'grab'>('cursor');
  const [highlight, setHighlight] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [drawingRect, setDrawingRect] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Canvas items — individual selectors to avoid re-rendering on unrelated state changes
  const items = useCanvasStore((s) => s.items);
  const connections = useCanvasStore((s) => s.connections);
  const alignmentGuides = useCanvasStore((s) => s.alignmentGuides);
  const spacingGuides = useCanvasStore((s) => s.spacingGuides);
  const selectedItemId = useCanvasStore((s) => s.selectedItemId);
  const highlightedItemIds = useCanvasStore((s) => s.highlightedItemIds);
  const setHighlightedItemIds = useCanvasStore((s) => s.setHighlightedItemIds);
  const clearHighlights = useCanvasStore((s) => s.clearHighlights);
  const selectItem = useCanvasStore((s) => s.selectItem);
  const openItemIds = useCanvasStore((s) => s.openItemIds);
  const openItem = useCanvasStore((s) => s.openItem);
  const setActiveItem = useCanvasStore((s) => s.setActiveItem);
  const activeItemId = useCanvasStore((s) => s.activeItemId);
  const loadItems = useCanvasStore((s) => s.loadItems);
  const addConnection = useCanvasStore((s) => s.addConnection);
  const removeConnection = useCanvasStore((s) => s.removeConnection);

  // Vault modal state — modals are conditionally rendered (not always mounted)
  // to avoid extra useSyncExternalStore subscriptions from their internal hooks
  // (useQuery/useMutation) which cause tearing cascades with React 19.
  const [showVaultSetup, setShowVaultSetup] = useState(false);
  const [showVaultUnlock, setShowVaultUnlock] = useState(false);
  const pendingSecretCardRef = useRef<string | null>(null);

  // Check vault config lazily via queryClient (no useQuery subscription).
  // Adding useQuery(vault.getConfig) here added a useSyncExternalStore subscription
  // whose state transitions (loading→success) during commit caused tearing cascades
  // across 16+ existing subscriptions → infinite loop on any openItem call.
  const requestVaultUnlock = useCallback(async () => {
    if (getCachedKey()) return;
    try {
      const config = await queryClient.fetchQuery(trpc.vault.getConfig.queryOptions());
      if (config) {
        setShowVaultUnlock(true);
      } else {
        setShowVaultSetup(true);
      }
    } catch {
      setShowVaultSetup(true);
    }
  }, [queryClient, trpc]);

  const handleOpenItem = useCallback(
    (id: string) => {
      const item = useCanvasStore.getState().items.find((i) => i.id === id);
      if (item?.type === 'secret-card') {
        if (!getCachedKey()) {
          pendingSecretCardRef.current = id;
          requestVaultUnlock();
          return;
        }
      }
      openItem(id);
    },
    [openItem, requestVaultUnlock],
  );

  // Connection drawing state
  const [drawingConnection, setDrawingConnection] = useState<{
    fromItemId: string;
    fromAnchor: AnchorPosition;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Load canvas from server, auto-save via subscribe, save + clear on leave
  const { data: canvasData } = useQuery(trpc.canvas.load.queryOptions({ workspaceId: id! }));
  const saveMutation = useMutation(trpc.canvas.save.mutationOptions());

  // Center the viewport on a set of items
  const fitViewToItems = useCallback(
    (itemsList: { x: number; y: number; width: number; height: number }[]) => {
      if (itemsList.length === 0 || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const minX = Math.min(...itemsList.map((i) => i.x));
      const minY = Math.min(...itemsList.map((i) => i.y));
      const maxX = Math.max(...itemsList.map((i) => i.x + i.width));
      const maxY = Math.max(...itemsList.map((i) => i.y + i.height));
      const contentW = maxX - minX;
      const contentH = maxY - minY;
      const centerX = minX + contentW / 2;
      const centerY = minY + contentH / 2;

      // Fit with padding (80% of viewport), but clamp zoom to [MIN_ZOOM, 1] — don't zoom in past 1x
      const padded = 0.8;
      const fitZoom = Math.min(
        1,
        Math.min((rect.width * padded) / contentW, (rect.height * padded) / contentH),
      );
      const clampedZoom = Math.max(MIN_ZOOM, fitZoom);

      zoomRef.current = clampedZoom;
      setZoom(clampedZoom);
      setPan({
        x: rect.width / 2 - centerX * clampedZoom,
        y: rect.height / 2 - centerY * clampedZoom,
      });
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: scoped to workspace id + server data
  useEffect(() => {
    if (!canvasData) return;

    // One-time migration: if server is empty but localStorage has data, migrate it
    const key = `a4-canvas-${id}`;
    if (canvasData.items.length === 0) {
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const legacyItems = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
          const legacyConnections = Array.isArray(parsed) ? [] : (parsed.connections ?? []);
          if (legacyItems.length > 0) {
            loadItems(legacyItems, legacyConnections);
            saveMutation.mutate({
              workspaceId: id!,
              items: legacyItems,
              connections: legacyConnections,
            });
            localStorage.removeItem(key);
            fitViewToItems(legacyItems);
            return;
          }
        } catch {
          // ignore corrupt localStorage
        }
        localStorage.removeItem(key);
      }
      loadItems([]);
    } else {
      // Clean up any stale localStorage
      localStorage.removeItem(key);
      loadItems(canvasData.items, canvasData.connections);
      fitViewToItems(canvasData.items);
    }
  }, [canvasData, id]);

  // Debounced auto-save to server via subscribe
  // biome-ignore lint/correctness/useExhaustiveDependencies: scoped to workspace id
  useEffect(() => {
    if (!id) return;

    let saveTimer: ReturnType<typeof setTimeout>;
    const unsubscribe = useCanvasStore.subscribe((state, prev) => {
      if ((state.items !== prev.items || state.connections !== prev.connections) && id) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveMutation.mutate({
            workspaceId: id,
            items: state.items,
            connections: state.connections,
          });
        }, 500);
      }
    });

    return () => {
      unsubscribe();
      clearTimeout(saveTimer);
      // Flush final state on cleanup
      const s = useCanvasStore.getState();
      if (s.items.length > 0) {
        saveMutation.mutate({ workspaceId: id, items: s.items, connections: s.connections });
      }
      loadItems([]);
    };
  }, [id]);
  const { isDragging, dragRef, ghostRef, startDrag, handleCanvasDrop, onDropRef } = useCanvasDrop();

  // Remove uploaded file from import panel after it's dropped on canvas
  onDropRef.current = (drag) => {
    const fileId = (drag.data as Record<string, unknown> | undefined)?.fileId as string | undefined;
    if (fileId) {
      setUploadedFiles((prev) => prev.filter((f) => f.fileId !== fileId));
    }
  };

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

    const zoomWithAnchor = (e: WheelEvent, dy: number, sensitivity: number) => {
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const factor = 1 - dy * sensitivity;
      const prev = zoomRef.current;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * factor));
      if (next === prev) return;

      const zoomingIn = next > prev;
      const ax = zoomingIn ? mouseX : centerX;
      const ay = zoomingIn ? mouseY : centerY;
      const s = next / prev;

      zoomRef.current = next;
      setZoom(next);
      setPan((p) => ({
        x: ax - s * (ax - p.x),
        y: ay - s * (ay - p.y),
      }));
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Normalize deltaY: line-mode mice send small values (e.g. 3 lines)
      const lineMultiplier = e.deltaMode === 1 ? 16 : 1;
      const dy = e.deltaY * lineMultiplier;
      const dx = e.deltaX * lineMultiplier;

      if (e.ctrlKey || e.metaKey) {
        // Pinch gesture: zoom in toward cursor, zoom out toward viewport center
        zoomWithAnchor(e, dy, 0.01);
      } else if (dx !== 0) {
        setPan((p) => ({ x: p.x - dx, y: p.y - dy }));
      } else {
        // Mouse wheel: zoom in toward cursor, zoom out toward viewport center
        zoomWithAnchor(e, dy, 0.003);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
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
        clearHighlights();
        setDrawingRect({ startX: canvasX, startY: canvasY, currentX: canvasX, currentY: canvasY });
      }
    },
    [activeTool, pan, zoom, selectItem, clearHighlights],
  );

  const onCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
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
        setDrawingRect((prev) => (prev ? { ...prev, currentX: canvasX, currentY: canvasY } : null));
      }
    },
    [activeTool, drawingRect, pan, zoom],
  );

  const onCanvasMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (dragRef.current) {
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
          const hitIds = useCanvasStore
            .getState()
            .items.filter(
              (item) =>
                !(
                  item.x + item.width < x ||
                  item.x > x + width ||
                  item.y + item.height < y ||
                  item.y > y + height
                ),
            )
            .map((item) => item.id);
          if (hitIds.length > 0) {
            setHighlight({ x, y, width, height });
            setHighlightedItemIds(hitIds);
          } else {
            setHighlight(null);
          }
        }
        setDrawingRect(null);
      }
    },
    [activeTool, drawingRect, dragRef, handleCanvasDrop, pan, zoom, setHighlightedItemIds],
  );

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.style.cursor = '';
    }
  }, [activeTool]);

  // ResizeObserver — trigger grid redraw when container resizes
  // biome-ignore lint/correctness/useExhaustiveDependencies: canvasRef is stable
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCanvasSize((c) => c + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw dot grid on <canvas> — coalesced via rAF to avoid blocking
  // biome-ignore lint/correctness/useExhaustiveDependencies: canvasSize triggers redraw on resize
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      const canvas = gridCanvasRef.current;
      const container = canvasRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = rect.height;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      // Adaptive grid spacing — double when too dense
      let spacing = BASE_GRID * zoom;
      while (spacing < 12) spacing *= 2;

      // Dark mode detection
      const isDark = document.documentElement.classList.contains('dark');
      ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.18)';

      // Draw 2px dots at integer positions
      const dotSize = 2;
      const startX = ((pan.x % spacing) + spacing) % spacing;
      const startY = ((pan.y % spacing) + spacing) % spacing;

      for (let x = startX; x < w; x += spacing) {
        for (let y = startY; y < h; y += spacing) {
          ctx.fillRect(Math.round(x), Math.round(y), dotSize, dotSize);
        }
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [zoom, pan, canvasSize]);

  const onCanvasDoubleClick = useCallback(() => {
    zoomRef.current = 1;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleResetView = useCallback(() => {
    zoomRef.current = 1;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const focusItem = useCallback(
    (id: string) => {
      setActiveItem(id);
      // Read items imperatively to avoid `items` dep that would invalidate this callback every frame
      const item = useCanvasStore.getState().items.find((i) => i.id === id);
      if (!item || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const targetX = rect.width / 2 - (item.x + item.width / 2) * zoom;
      const targetY = rect.height / 2 - (item.y + item.height / 2) * zoom;
      setPan({ x: targetX, y: targetY });
    },
    [zoom, setActiveItem],
  );

  const onCloseWorkspace = useCallback(() => {
    const parentId = workspace?.parentId;
    navigate(parentId ? `/workspaces/${parentId}/folder` : '/workspaces');
  }, [workspace?.parentId, navigate]);

  // Connection drawing — anchor mousedown starts a draw
  const onAnchorMouseDown = useCallback(
    (itemId: string, anchor: AnchorPosition, e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDrawingConnection({
        fromItemId: itemId,
        fromAnchor: anchor,
        currentX: e.clientX - rect.left,
        currentY: e.clientY - rect.top,
      });
    },
    [],
  );

  // Connection drawing — anchor mouseup completes a connection
  const onAnchorMouseUp = useCallback(
    (itemId: string, anchor: AnchorPosition) => {
      if (!drawingConnection) return;
      if (drawingConnection.fromItemId !== itemId) {
        addConnection({
          fromItemId: drawingConnection.fromItemId,
          fromAnchor: drawingConnection.fromAnchor,
          toItemId: itemId,
          toAnchor: anchor,
        });
      }
      setDrawingConnection(null);
    },
    [drawingConnection, addConnection],
  );

  // Connection drawing — window mousemove/mouseup while drawing
  useEffect(() => {
    if (!drawingConnection) return;
    const onMove = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDrawingConnection((prev) =>
        prev ? { ...prev, currentX: e.clientX - rect.left, currentY: e.clientY - rect.top } : null,
      );
    };
    const onUp = () => setDrawingConnection(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drawingConnection]);

  const activeItem = activeItemId ? (items.find((i) => i.id === activeItemId) ?? null) : null;

  const handleImportUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setUploadError(null);
      try {
        const result = await uploadFile(file, id!, getToken);
        const preview = await generatePreview(file);
        const fileCardData: FileCardData = {
          fileId: result.fileId,
          fileName: result.fileName,
          fileSize: result.fileSize,
          mimeType: result.mimeType,
          ...preview,
        };
        setUploadedFiles((prev) => [...prev, fileCardData]);
      } catch (err: any) {
        setUploadError(err.message ?? 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [id, getToken],
  );

  const removeUploadedFile = useCallback((index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

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
        onCloseWorkspace={onCloseWorkspace}
        onFocusItem={focusItem}
      />

      {activeItem &&
        (activeItem.type === 'secret-card' ? (
          <SecretCardView item={activeItem} onRequestUnlock={requestVaultUnlock} />
        ) : activeItem.type === 'table-card' ? (
          <TableCardView item={activeItem} />
        ) : activeItem.type === 'kpi-card' ? (
          <KpiCardView item={activeItem} />
        ) : activeItem.type === 'chart-card' ? (
          <ChartCardView item={activeItem} />
        ) : activeItem.type === 'file-card' ? (
          <FileCardView item={activeItem} workspaceId={id!} />
        ) : activeItem.type === 'timer-card' ? (
          <TimerCardView item={activeItem} />
        ) : activeItem.type === 'invoice-card' ? (
          <InvoiceCardView item={activeItem} />
        ) : activeItem.type === 'budget-card' ? (
          <BudgetCardView item={activeItem} />
        ) : activeItem.type === 'ledger-card' ? (
          <LedgerCardView item={activeItem} />
        ) : activeItem.type === 'receipt-card' ? (
          <ReceiptCardView item={activeItem} workspaceId={id!} />
        ) : activeItem.type === 'subscription-card' ? (
          <SubscriptionCardView item={activeItem} />
        ) : activeItem.type === 'account-card' ? (
          <AccountCardView item={activeItem} />
        ) : activeItem.type === 'pnl-card' ? (
          <PnlCardView item={activeItem} />
        ) : activeItem.type === 'balance-sheet-card' ? (
          <BalanceSheetCardView item={activeItem} />
        ) : activeItem.type === 'cash-flow-card' ? (
          <CashFlowCardView item={activeItem} />
        ) : activeItem.type === 'tax-estimator-card' ? (
          <TaxEstimatorCardView item={activeItem} />
        ) : activeItem.type === 'loan-calculator-card' ? (
          <LoanCalculatorCardView item={activeItem} />
        ) : (
          <DocumentView item={activeItem} />
        ))}
      <div className={cn('relative flex flex-1 min-h-0', activeItem && 'hidden')}>
        {/* Main area — workspace canvas */}
        <div
          ref={canvasRef}
          className={cn(
            'relative flex-1 select-none overflow-hidden bg-canvas',
            activeTool === 'grab' ? 'cursor-grab' : '',
          )}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
          onDoubleClick={onCanvasDoubleClick}
        >
          {/* Pixel-perfect dot grid */}
          <canvas ref={gridCanvasRef} className="pointer-events-none absolute inset-0" />
          {/* Floating pill toolbar */}
          <div className="absolute top-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border/50 bg-background/80 backdrop-blur-md px-1.5 py-1 shadow-xl">
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="none"
                className="size-4"
              >
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
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
              className="absolute top-4 right-4 z-50 flex items-center gap-1.5 bg-card/90 backdrop-blur-md border border-border/60 px-3 py-2 rounded-xl shadow-lg hover:bg-muted transition-colors"
              title="Open tools panel"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              <span className="text-[12px] font-medium">Tools</span>
            </button>
          )}

          {/* Minimap */}
          <CanvasMinimap
            zoom={zoom}
            pan={pan}
            canvasRef={canvasRef}
            isPanelCollapsed={isPanelCollapsed}
          />

          {/* Canvas content layer — isolated stacking context so items never overlap UI chrome */}
          <div className="absolute inset-0 z-0" style={{ isolation: 'isolate' }}>
            <svg
              className="pointer-events-none absolute inset-0"
              style={{ width: '100%', height: '100%' }}
            >
              {/* Persisted connections */}
              {connections.map((conn) => {
                const fromItem = items.find((i) => i.id === conn.fromItemId);
                const toItem = items.find((i) => i.id === conn.toItemId);
                if (!fromItem || !toItem) return null;
                const from = getAnchorScreenPos(fromItem, conn.fromAnchor, zoom, pan);
                const to = getAnchorScreenPos(toItem, conn.toAnchor, zoom, pan);
                const d = bezierPath(from, conn.fromAnchor, to, conn.toAnchor);
                return (
                  <g key={conn.id}>
                    {/* Invisible wide hit area for click-to-delete */}
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={12}
                      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      onClick={() => removeConnection(conn.id)}
                    />
                    {/* Visible green curve */}
                    <path d={d} fill="none" stroke="#22c55e" strokeWidth={2} />
                  </g>
                );
              })}
              {/* In-progress drawing curve */}
              {drawingConnection &&
                (() => {
                  const fromItem = items.find((i) => i.id === drawingConnection.fromItemId);
                  if (!fromItem) return null;
                  const from = getAnchorScreenPos(
                    fromItem,
                    drawingConnection.fromAnchor,
                    zoom,
                    pan,
                  );
                  const to = { x: drawingConnection.currentX, y: drawingConnection.currentY };
                  const dist = Math.hypot(to.x - from.x, to.y - from.y);
                  const offset = Math.max(40, Math.min(dist * 0.4, 200));
                  const fd = {
                    top: { x: 0, y: -1 },
                    bottom: { x: 0, y: 1 },
                    left: { x: -1, y: 0 },
                    right: { x: 1, y: 0 },
                  }[drawingConnection.fromAnchor];
                  const cx1 = from.x + fd.x * offset;
                  const cy1 = from.y + fd.y * offset;
                  const dx = from.x - to.x;
                  const dy = from.y - to.y;
                  const cx2 = Math.abs(dx) > Math.abs(dy) ? to.x + Math.sign(dx) * offset : to.x;
                  const cy2 = Math.abs(dy) >= Math.abs(dx) ? to.y + Math.sign(dy) * offset : to.y;
                  const d = `M ${from.x},${from.y} C ${cx1},${cy1} ${cx2},${cy2} ${to.x},${to.y}`;
                  return (
                    <path
                      d={d}
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                    />
                  );
                })()}
              {/* Alignment snap guides */}
              {alignmentGuides.map((guide, i) => {
                if (guide.type === 'vertical') {
                  const x = guide.position * zoom + pan.x;
                  return (
                    <line
                      key={`ag-v-${i}`}
                      x1={x}
                      y1={0}
                      x2={x}
                      y2="100%"
                      stroke="#ec4899"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                  );
                }
                const y = guide.position * zoom + pan.y;
                return (
                  <line
                    key={`ag-h-${i}`}
                    x1={0}
                    y1={y}
                    x2="100%"
                    y2={y}
                    stroke="#ec4899"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                );
              })}
              {/* Equal spacing guides */}
              {spacingGuides.map((sg, i) => {
                if (sg.axis === 'horizontal') {
                  const x1 = sg.from * zoom + pan.x;
                  const x2 = sg.to * zoom + pan.x;
                  const cy = sg.cross * zoom + pan.y;
                  const gap = Math.round(sg.to - sg.from);
                  return (
                    <g key={`sg-h-${i}`}>
                      <line x1={x1} y1={cy} x2={x2} y2={cy} stroke="#ec4899" strokeWidth={1} />
                      <line
                        x1={x1}
                        y1={cy - 4}
                        x2={x1}
                        y2={cy + 4}
                        stroke="#ec4899"
                        strokeWidth={1}
                      />
                      <line
                        x1={x2}
                        y1={cy - 4}
                        x2={x2}
                        y2={cy + 4}
                        stroke="#ec4899"
                        strokeWidth={1}
                      />
                      <text
                        x={(x1 + x2) / 2}
                        y={cy - 6}
                        textAnchor="middle"
                        fill="#ec4899"
                        fontSize={10}
                        fontFamily="system-ui"
                      >
                        {gap}
                      </text>
                    </g>
                  );
                }
                const y1 = sg.from * zoom + pan.y;
                const y2 = sg.to * zoom + pan.y;
                const cx = sg.cross * zoom + pan.x;
                const gap = Math.round(sg.to - sg.from);
                return (
                  <g key={`sg-v-${i}`}>
                    <line x1={cx} y1={y1} x2={cx} y2={y2} stroke="#ec4899" strokeWidth={1} />
                    <line
                      x1={cx - 4}
                      y1={y1}
                      x2={cx + 4}
                      y2={y1}
                      stroke="#ec4899"
                      strokeWidth={1}
                    />
                    <line
                      x1={cx - 4}
                      y1={y2}
                      x2={cx + 4}
                      y2={y2}
                      stroke="#ec4899"
                      strokeWidth={1}
                    />
                    <text
                      x={cx + 8}
                      y={(y1 + y2) / 2 + 3}
                      fill="#ec4899"
                      fontSize={10}
                      fontFamily="system-ui"
                    >
                      {gap}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Canvas items */}
            {items.map((item) => (
              <CanvasItemRenderer
                key={item.id}
                item={item}
                zoom={zoom}
                pan={pan}
                isSelected={selectedItemId === item.id}
                isHighlighted={highlightedItemIds.has(item.id)}
                activeTool={activeTool}
                onSelect={selectItem}
                onOpen={handleOpenItem}
                onAnchorMouseDown={onAnchorMouseDown}
                onAnchorMouseUp={onAnchorMouseUp}
                isDrawingConnection={!!drawingConnection}
                onRequestUnlock={requestVaultUnlock}
              />
            ))}

            {/* Highlight overlay */}
            <div className="pointer-events-none absolute inset-0">
              {highlight && !drawingRect && (
                <div
                  className="absolute border-2 border-primary bg-primary/10 shadow-sm backdrop-blur-[2px]"
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
                  className="absolute border-2 border-primary bg-primary/10"
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
        </div>

        {/* Right panel — Floating Chat Card */}
        <aside
          className={cn(
            'absolute right-0 top-0 bottom-0 z-40 flex flex-col animate-slide-in transition-all duration-300 ease-in-out',
            isPanelCollapsed ? 'w-0 pr-0 opacity-0 overflow-hidden' : 'w-[360px] py-4 pr-4',
          )}
        >
          <div
            className={cn(
              'flex flex-col h-full rounded-2xl border border-border/60 bg-card/90 backdrop-blur-xl shadow-2xl overflow-hidden',
              isPanelCollapsed && 'invisible',
            )}
          >
            {/* Tools header + minimize */}
            <div className="border-b border-border/60">
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Tools
                </span>
                <button
                  type="button"
                  onClick={() => setIsPanelCollapsed(true)}
                  className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Minimize panel"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5"
                  >
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
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 text-primary"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Import Files
                  </h2>
                </div>

                {/* Import content */}
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                  {/* Uploaded files — drag to canvas */}
                  {uploadedFiles.length > 0 && (
                    <>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                        Drag to canvas
                      </p>
                      <div className="space-y-2">
                        {uploadedFiles.map((f, i) => (
                          <div
                            key={f.fileId}
                            className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-3 cursor-grab transition-colors duration-100 hover:border-primary/30 hover:bg-primary/5 active:cursor-grabbing"
                            onMouseDown={(e) =>
                              startDrag('file-card', e, {
                                data: f as unknown as Record<string, unknown>,
                                name: f.fileName,
                              })
                            }
                          >
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground overflow-hidden">
                              {f.previewData ? (
                                <img
                                  src={f.previewData}
                                  alt=""
                                  className="size-9 object-cover rounded-lg"
                                />
                              ) : (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="size-5"
                                >
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-foreground truncate">
                                {f.fileName}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {getFileTypeLabel(f.mimeType)} · {formatFileSize(f.fileSize)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeUploadedFile(i);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="size-3"
                              >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Upload error */}
                  {uploadError && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
                      <p className="text-[11px] text-destructive">{uploadError}</p>
                    </div>
                  )}

                  {/* Upload button */}
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".pdf,.csv,.xlsx,.xls,.docx,.png,.jpg,.jpeg,.webp,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportUpload(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => importFileInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-3 border-2 border-dashed border-border/60 rounded-2xl p-8 transition-colors duration-200 hover:border-primary/40 hover:bg-primary/5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? (
                      <>
                        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        <p className="text-[13px] text-muted-foreground">Uploading...</p>
                      </>
                    ) : (
                      <>
                        <div className="size-10 rounded-xl bg-muted/30 flex items-center justify-center">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="size-5 text-muted-foreground/60"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        </div>
                        <div className="text-center">
                          <p className="text-[13px] font-medium text-foreground">Click to upload</p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            PDF, CSV, Excel, Word, images, text
                          </p>
                        </div>
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : topic === 'general' ? (
              <>
                {/* General / Tools header */}
                <div className="border-b border-border/60 px-4 py-3">
                  <h2 className="font-bold text-sm truncate flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 text-primary"
                    >
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
            ) : topic === 'vault' ? (
              <>
                <div className="border-b border-border/60 px-4 py-3">
                  <h2 className="font-bold text-sm truncate flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 text-primary"
                    >
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Vault
                  </h2>
                </div>
                <SecretToolPanel onDragStart={startDrag} />
              </>
            ) : topic === 'data' ? (
              <>
                <div className="border-b border-border/60 px-4 py-3">
                  <h2 className="font-bold text-sm truncate flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 text-primary"
                    >
                      <ellipse cx="12" cy="5" rx="9" ry="3" />
                      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                    </svg>
                    Data
                  </h2>
                </div>
                <DataToolPanel onDragStart={startDrag} />
              </>
            ) : topic === 'finance' ? (
              <>
                <div className="border-b border-border/60 px-4 py-3">
                  <h2 className="font-bold text-sm truncate flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 text-primary"
                    >
                      <line x1="12" y1="1" x2="12" y2="23" />
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                    Finance
                  </h2>
                </div>
                <FinanceToolPanel onDragStart={startDrag} />
              </>
            ) : topic === 'reports' ? (
              <>
                <div className="border-b border-border/60 px-4 py-3">
                  <h2 className="font-bold text-sm truncate flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 text-primary"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    Reports
                  </h2>
                </div>
                <ReportsToolPanel onDragStart={startDrag} />
              </>
            ) : topic === 'tax' ? (
              <>
                <div className="border-b border-border/60 px-4 py-3">
                  <h2 className="font-bold text-sm truncate flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 text-primary"
                    >
                      <rect x="4" y="2" width="16" height="20" rx="2" />
                      <line x1="8" y1="6" x2="16" y2="6" />
                      <line x1="8" y1="10" x2="16" y2="10" />
                      <line x1="8" y1="14" x2="12" y2="14" />
                      <line x1="8" y1="18" x2="10" y2="18" />
                    </svg>
                    Tax
                  </h2>
                </div>
                <TaxToolPanel onDragStart={startDrag} />
              </>
            ) : (
              <>
                {/* Chat header */}
                <div className="border-b border-border/60 px-4 py-3">
                  <h2 className="font-bold text-sm truncate flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 text-primary"
                    >
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
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="size-6 text-muted-foreground/40"
                          >
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
                        className={cn(
                          'flex w-full animate-slide-up',
                          msg.role === 'user' ? 'justify-end' : 'justify-start',
                        )}
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
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-4"
                      >
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

      {/* Drag ghost — positioned via direct DOM manipulation in useCanvasDrop */}
      {isDragging && (
        <div
          ref={ghostRef}
          className="pointer-events-none fixed z-[9999]"
          style={{
            left: dragRef.current ? dragRef.current.ghostX - 42 : 0,
            top: dragRef.current ? dragRef.current.ghostY - 60 : 0,
            width: 85,
            height: 120,
          }}
        >
          <div className="h-full w-full rounded-sm border border-primary/40 bg-white shadow-xl dark:bg-zinc-50" />
        </div>
      )}

      {/* Vault modals — conditionally rendered to avoid extra useSyncExternalStore
          subscriptions from their internal useQuery/useMutation hooks */}
      {showVaultSetup && (
        <VaultSetupModal
          open={showVaultSetup}
          onOpenChange={setShowVaultSetup}
          onSetupComplete={() => {
            setShowVaultSetup(false);
            queryClient.invalidateQueries({ queryKey: trpc.vault.getConfig.queryKey() });
            if (pendingSecretCardRef.current) {
              const pendingId = pendingSecretCardRef.current;
              pendingSecretCardRef.current = null;
              openItem(pendingId);
            }
          }}
        />
      )}
      {showVaultUnlock && (
        <VaultUnlockModal
          open={showVaultUnlock}
          onOpenChange={setShowVaultUnlock}
          onUnlockComplete={() => {
            setShowVaultUnlock(false);
            if (pendingSecretCardRef.current) {
              const pendingId = pendingSecretCardRef.current;
              pendingSecretCardRef.current = null;
              openItem(pendingId);
            }
          }}
        />
      )}
    </div>
  );
}
