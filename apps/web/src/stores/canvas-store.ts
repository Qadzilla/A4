import { create } from 'zustand';
import type { AlignmentGuide, AnchorPosition, CanvasConnection, SpacingGuide } from '../lib/canvas-utils';

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
  addItem: (item) =>
    set((s) => {
      const id = crypto.randomUUID();
      const name = item.name ?? defaultNames[item.type] ?? 'Untitled';
      return {
        items: [...s.items, { ...item, id, name, zIndex: s.nextZIndex }],
        nextZIndex: s.nextZIndex + 1,
        selectedItemId: id,
        pendingRenameId: id,
        activeItemId: null,
      };
    }),
  removeItem: (id) =>
    set((s) => {
      const nextActive = s.activeItemId === id ? getAdjacentTab(s.openItemIds, id) : s.activeItemId;
      return {
        items: s.items.filter((i) => i.id !== id),
        connections: s.connections.filter((c) => c.fromItemId !== id && c.toItemId !== id),
        selectedItemId: s.selectedItemId === id ? nextActive : s.selectedItemId,
        openItemIds: s.openItemIds.filter((i) => i !== id),
        activeItemId: nextActive,
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
  clearItems: () => set({ items: [], connections: [], alignmentGuides: [], spacingGuides: [], selectedItemId: null, pendingRenameId: null, nextZIndex: 1, openItemIds: [], activeItemId: null }),
  loadItems: (items, connections) => set({
    items,
    connections: connections ?? [],
    selectedItemId: null,
    pendingRenameId: null,
    nextZIndex: items.length > 0 ? Math.max(...items.map((i) => i.zIndex)) + 1 : 1,
    openItemIds: [],
    activeItemId: null,
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
}));
