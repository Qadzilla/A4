import { create } from 'zustand';

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
};

interface CanvasState {
  items: CanvasItem[];
  selectedItemId: string | null;
  pendingRenameId: string | null;
  nextZIndex: number;
  openItemIds: string[];
  activeItemId: string | null;
  addItem: (item: Omit<CanvasItem, 'id' | 'zIndex' | 'name'> & { name?: string }) => void;
  removeItem: (id: string) => void;
  selectItem: (id: string | null) => void;
  moveItem: (id: string, x: number, y: number) => void;
  resizeItem: (id: string, x: number, y: number, width: number, height: number) => void;
  renameItem: (id: string, name: string) => void;
  duplicateItem: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  clearPendingRename: () => void;
  updateItemData: (id: string, data: Record<string, unknown>) => void;
  clearItems: () => void;
  openItem: (id: string) => void;
  closeItem: (id: string) => void;
  setActiveItem: (id: string | null) => void;
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
  resizeItem: (id, x, y, width, height) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, x, y, width, height } : i)),
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
  clearItems: () => set({ items: [], selectedItemId: null, pendingRenameId: null, nextZIndex: 1, openItemIds: [], activeItemId: null }),
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
}));
