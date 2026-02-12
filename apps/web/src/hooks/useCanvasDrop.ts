import { useState, useCallback, useRef, useEffect } from 'react';
import { useCanvasStore } from '../stores/canvas-store';

export const ITEM_DEFAULTS: Record<string, { width: number; height: number }> = {
  'a4-page': { width: 565, height: 800 },
};

interface DragState {
  type: string;
  ghostX: number;
  ghostY: number;
}

export function useCanvasDrop() {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const addItem = useCanvasStore((s) => s.addItem);

  const startDrag = useCallback((type: string, e: React.MouseEvent) => {
    e.preventDefault();
    const state: DragState = { type, ghostX: e.clientX, ghostY: e.clientY };
    dragRef.current = state;
    setDragState(state);
  }, []);

  const handleCanvasDrop = useCallback(
    (canvasRect: DOMRect, pan: { x: number; y: number }, zoom: number) => {
      const drag = dragRef.current;
      if (!drag) return;

      const defaults = ITEM_DEFAULTS[drag.type] ?? { width: 200, height: 200 };
      const canvasX = (drag.ghostX - canvasRect.left - pan.x) / zoom - defaults.width / 2;
      const canvasY = (drag.ghostY - canvasRect.top - pan.y) / zoom - defaults.height / 2;

      addItem({
        type: drag.type,
        x: canvasX,
        y: canvasY,
        width: defaults.width,
        height: defaults.height,
      });

      dragRef.current = null;
      setDragState(null);
    },
    [addItem],
  );

  // Window-level listeners for drag tracking
  useEffect(() => {
    if (!dragState) return;

    const onMouseMove = (e: MouseEvent) => {
      const next: DragState = { type: dragState.type, ghostX: e.clientX, ghostY: e.clientY };
      dragRef.current = next;
      setDragState(next);
    };

    const onMouseUp = () => {
      // Cancel if mouseup happens outside canvas — page.tsx handles the canvas case
      dragRef.current = null;
      setDragState(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragState]);

  return { dragState, startDrag, handleCanvasDrop };
}
