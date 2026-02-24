import { create } from 'zustand';
import type { AlignmentGuide, AnchorPosition, CanvasConnection, SpacingGuide } from '../lib/canvas-utils';
import { createDefaultTableData } from '../lib/table-utils';
import { createDefaultKpiData } from '../lib/kpi-utils';
import { createDefaultChartData } from '../lib/chart-utils';
import { createDefaultTimerData } from '../lib/timer-utils';
import { createDefaultInvoiceData } from '../lib/invoice-utils';
import { createDefaultBudgetData } from '../lib/budget-utils';
import { createDefaultLedgerData } from '../lib/ledger-utils';
import { createDefaultReceiptData } from '../lib/receipt-utils';
import { createDefaultSubscriptionData } from '../lib/subscription-utils';
import { createDefaultAccountData } from '../lib/account-utils';
import { createDefaultPnlData } from '../lib/pnl-utils';
import { createDefaultBSData } from '../lib/balance-sheet-utils';
import { createDefaultCFData } from '../lib/cash-flow-utils';
import { createDefaultTaxEstimatorData } from '../lib/tax-estimator-utils';
import { createDefaultLoanCalculatorData } from '../lib/loan-calculator-utils';

export type { CanvasConnection, AlignmentGuide, SpacingGuide };

export interface CanvasItem {
  id: string;
  type: 'a4-page' | (string & {});
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  data?: Record<string, unknown>;
}

const defaultNames: Record<string, string> = {
  'a4-page': 'Untitled Page',
  'secret-card': 'Untitled Credential',
  'note': 'Untitled Note',
  'table-card': 'Untitled Table',
  'kpi-card': 'Untitled KPI',
  'chart-card': 'Untitled Chart',
  'file-card': 'Untitled File',
  'timer-card': 'Untitled Timer',
  'invoice-card': 'Untitled Invoice',
  'budget-card': 'Untitled Budget',
  'ledger-card': 'Untitled Ledger',
  'receipt-card': 'Untitled Receipts',
  'subscription-card': 'Untitled Subscriptions',
  'account-card': 'Untitled Accounts',
  'pnl-card': 'Untitled P&L',
  'balance-sheet-card': 'Untitled Balance Sheet',
  'cash-flow-card': 'Untitled Cash Flow',
  'tax-estimator-card': 'Untitled Tax Estimate',
  'loan-calculator-card': 'Untitled Loan Calculator',
};

interface CanvasState {
  items: CanvasItem[];
  connections: CanvasConnection[];
  alignmentGuides: AlignmentGuide[];
  spacingGuides: SpacingGuide[];
  selectedItemId: string | null;
  pendingRenameId: string | null;
  nextZIndex: number;
  openItemIds: string[];
  activeItemId: string | null;
  highlightedItemIds: Set<string>;
  addItem: (item: Omit<CanvasItem, 'id' | 'zIndex' | 'name'> & { name?: string }) => void;
  removeItem: (id: string) => void;
  selectItem: (id: string | null) => void;
  moveItem: (id: string, x: number, y: number) => void;
  moveItemWithGuides: (id: string, x: number, y: number, alignmentGuides: AlignmentGuide[], spacingGuides: SpacingGuide[]) => void;
  resizeItem: (id: string, x: number, y: number, width: number, height: number) => void;
  resizeItemWithGuides: (id: string, x: number, y: number, width: number, height: number, alignmentGuides: AlignmentGuide[], spacingGuides: SpacingGuide[]) => void;
  renameItem: (id: string, name: string) => void;
  duplicateItem: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  clearPendingRename: () => void;
  updateItemData: (id: string, data: Record<string, unknown>) => void;
  clearItems: () => void;
  loadItems: (items: CanvasItem[], connections?: CanvasConnection[]) => void;
  addConnection: (conn: Omit<CanvasConnection, 'id'>) => void;
  removeConnection: (id: string) => void;
  openItem: (id: string) => void;
  closeItem: (id: string) => void;
  setActiveItem: (id: string | null) => void;
  setAlignmentGuides: (guides: AlignmentGuide[]) => void;
  clearAlignmentGuides: () => void;
  setSpacingGuides: (guides: SpacingGuide[]) => void;
  clearSpacingGuides: () => void;
  highlightItem: (id: string) => void;
  unhighlightItem: (id: string) => void;
  clearHighlights: () => void;
  toggleHighlight: (id: string) => void;
  setHighlightedItemIds: (ids: string[]) => void;
}

function getAdjacentTab(openItemIds: string[], closedId: string): string | null {
  const idx = openItemIds.indexOf(closedId);
  if (idx === -1) return null;
  const remaining = openItemIds.filter((id) => id !== closedId);
  if (remaining.length === 0) return null;
  // prefer right neighbor, fallback left
  return remaining[Math.min(idx, remaining.length - 1)] ?? null;
}

export const useCanvasStore = create<CanvasState>()((set) => ({
  items: [],
  connections: [],
  alignmentGuides: [],
  spacingGuides: [],
  selectedItemId: null,
  pendingRenameId: null,
  nextZIndex: 1,
  openItemIds: [],
  activeItemId: null,
  highlightedItemIds: new Set<string>(),
  addItem: (item) =>
    set((s) => {
      const id = crypto.randomUUID();
      const name = item.name ?? defaultNames[item.type] ?? 'Untitled';
      const data = item.type === 'table-card' && !item.data
        ? (createDefaultTableData() as unknown as Record<string, unknown>)
        : item.type === 'kpi-card' && !item.data
          ? (createDefaultKpiData() as unknown as Record<string, unknown>)
          : item.type === 'chart-card' && !item.data
            ? (createDefaultChartData() as unknown as Record<string, unknown>)
            : item.type === 'timer-card' && !item.data
              ? (createDefaultTimerData() as unknown as Record<string, unknown>)
              : item.type === 'invoice-card' && !item.data
                ? (createDefaultInvoiceData() as unknown as Record<string, unknown>)
                : item.type === 'budget-card' && !item.data
                  ? (createDefaultBudgetData() as unknown as Record<string, unknown>)
                  : item.type === 'ledger-card' && !item.data
                    ? (createDefaultLedgerData() as unknown as Record<string, unknown>)
                    : item.type === 'receipt-card' && !item.data
                      ? (createDefaultReceiptData() as unknown as Record<string, unknown>)
                      : item.type === 'subscription-card' && !item.data
                        ? (createDefaultSubscriptionData() as unknown as Record<string, unknown>)
                        : item.type === 'account-card' && !item.data
                          ? (createDefaultAccountData() as unknown as Record<string, unknown>)
                          : item.type === 'pnl-card' && !item.data
                            ? (createDefaultPnlData() as unknown as Record<string, unknown>)
                            : item.type === 'balance-sheet-card' && !item.data
                              ? (createDefaultBSData() as unknown as Record<string, unknown>)
                              : item.type === 'cash-flow-card' && !item.data
                                ? (createDefaultCFData() as unknown as Record<string, unknown>)
                                : item.type === 'tax-estimator-card' && !item.data
                                  ? (createDefaultTaxEstimatorData() as unknown as Record<string, unknown>)
                                  : item.type === 'loan-calculator-card' && !item.data
                                    ? (createDefaultLoanCalculatorData() as unknown as Record<string, unknown>)
                                    : item.data;
      return {
        items: [...s.items, { ...item, id, name, data, zIndex: s.nextZIndex }],
        nextZIndex: s.nextZIndex + 1,
        selectedItemId: id,
        pendingRenameId: id,
        activeItemId: null,
      };
    }),
  removeItem: (id) =>
    set((s) => {
      const nextActive = s.activeItemId === id ? getAdjacentTab(s.openItemIds, id) : s.activeItemId;
      const nextHighlighted = s.highlightedItemIds.has(id)
        ? (() => { const n = new Set(s.highlightedItemIds); n.delete(id); return n; })()
        : s.highlightedItemIds;
      return {
        items: s.items.filter((i) => i.id !== id),
        connections: s.connections.filter((c) => c.fromItemId !== id && c.toItemId !== id),
        selectedItemId: s.selectedItemId === id ? nextActive : s.selectedItemId,
        openItemIds: s.openItemIds.filter((i) => i !== id),
        activeItemId: nextActive,
        highlightedItemIds: nextHighlighted,
      };
    }),
  selectItem: (id) => set({ selectedItemId: id }),
  moveItem: (id, x, y) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, x, y } : i)),
    })),
  moveItemWithGuides: (id, x, y, alignmentGuides, spacingGuides) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, x, y } : i)),
      alignmentGuides,
      spacingGuides,
    })),
  resizeItem: (id, x, y, width, height) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, x, y, width, height } : i)),
    })),
  resizeItemWithGuides: (id, x, y, width, height, alignmentGuides, spacingGuides) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, x, y, width, height } : i)),
      alignmentGuides,
      spacingGuides,
    })),
  renameItem: (id, name) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, name } : i)),
    })),
  duplicateItem: (id) =>
    set((s) => {
      const source = s.items.find((i) => i.id === id);
      if (!source) return s;
      const newId = crypto.randomUUID();
      const offset = 30;
      return {
        items: [
          ...s.items,
          { ...source, id: newId, x: source.x + offset, y: source.y + offset, zIndex: s.nextZIndex },
        ],
        nextZIndex: s.nextZIndex + 1,
        selectedItemId: newId,
        openItemIds: [...s.openItemIds, newId],
        activeItemId: newId,
      };
    }),
  bringToFront: (id) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, zIndex: s.nextZIndex } : i)),
      nextZIndex: s.nextZIndex + 1,
    })),
  sendToBack: (id) =>
    set((s) => {
      const minZ = Math.min(...s.items.map((i) => i.zIndex));
      return {
        items: s.items.map((i) => (i.id === id ? { ...i, zIndex: minZ - 1 } : i)),
      };
    }),
  updateItemData: (id, data) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, data: { ...i.data, ...data } } : i,
      ),
    })),
  clearPendingRename: () => set({ pendingRenameId: null }),
  clearItems: () => set({ items: [], connections: [], alignmentGuides: [], spacingGuides: [], selectedItemId: null, pendingRenameId: null, nextZIndex: 1, openItemIds: [], activeItemId: null, highlightedItemIds: new Set<string>() }),
  loadItems: (items, connections) => set({
    items,
    connections: connections ?? [],
    selectedItemId: null,
    pendingRenameId: null,
    nextZIndex: items.length > 0 ? Math.max(...items.map((i) => i.zIndex)) + 1 : 1,
    openItemIds: [],
    activeItemId: null,
    highlightedItemIds: new Set<string>(),
  }),
  addConnection: (conn) =>
    set((s) => {
      const duplicate = s.connections.some(
        (c) =>
          c.fromItemId === conn.fromItemId &&
          c.fromAnchor === conn.fromAnchor &&
          c.toItemId === conn.toItemId &&
          c.toAnchor === conn.toAnchor,
      );
      if (duplicate) return s;
      return {
        connections: [...s.connections, { ...conn, id: crypto.randomUUID() }],
      };
    }),
  removeConnection: (id) =>
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
    })),
  openItem: (id) =>
    set((s) => ({
      openItemIds: s.openItemIds.includes(id) ? s.openItemIds : [...s.openItemIds, id],
      activeItemId: id,
      selectedItemId: id,
    })),
  closeItem: (id) =>
    set((s) => {
      const nextActive = s.activeItemId === id ? getAdjacentTab(s.openItemIds, id) : s.activeItemId;
      return {
        openItemIds: s.openItemIds.filter((i) => i !== id),
        activeItemId: nextActive,
        selectedItemId: nextActive,
      };
    }),
  setActiveItem: (id) =>
    set({ activeItemId: id, selectedItemId: id ?? null }),
  setAlignmentGuides: (guides) => set({ alignmentGuides: guides }),
  clearAlignmentGuides: () => set((s) => s.alignmentGuides.length === 0 ? s : { alignmentGuides: [] }),
  setSpacingGuides: (guides) => set({ spacingGuides: guides }),
  clearSpacingGuides: () => set((s) => s.spacingGuides.length === 0 ? s : { spacingGuides: [] }),
  highlightItem: (id) =>
    set((s) => {
      if (s.highlightedItemIds.has(id)) return s;
      const next = new Set(s.highlightedItemIds);
      next.add(id);
      return { highlightedItemIds: next };
    }),
  unhighlightItem: (id) =>
    set((s) => {
      if (!s.highlightedItemIds.has(id)) return s;
      const next = new Set(s.highlightedItemIds);
      next.delete(id);
      return { highlightedItemIds: next };
    }),
  clearHighlights: () =>
    set((s) => s.highlightedItemIds.size === 0 ? s : { highlightedItemIds: new Set<string>() }),
  toggleHighlight: (id) =>
    set((s) => {
      const next = new Set(s.highlightedItemIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { highlightedItemIds: next };
    }),
  setHighlightedItemIds: (ids) =>
    set({ highlightedItemIds: new Set(ids) }),
}));
