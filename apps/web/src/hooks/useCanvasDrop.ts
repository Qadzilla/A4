import { useState, useCallback, useRef, useEffect } from 'react';
import { useCanvasStore } from '../stores/canvas-store';

export const ITEM_DEFAULTS: Record<string, { width: number; height: number }> = {
  'a4-page': { width: 565, height: 800 },
  'secret-card': { width: 320, height: 240 },
  'note': { width: 260, height: 180 },
};

interface DragState {
  type: string;
  ghostX: number;
  ghostY: number;
}

export function useCanvasDrop() {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const addItem = useCanvasStore((s) => s.addItem);

  const startDrag = useCallback((type: string, e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { type, ghostX: e.clientX, ghostY: e.clientY };
    setIsDragging(true);
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
      setIsDragging(false);
    },
    [addItem],
  );

  // Window-level listeners for drag tracking — direct DOM manipulation for ghost
  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      dragRef.current = { ...dragRef.current, ghostX: e.clientX, ghostY: e.clientY };
      // Direct DOM manipulation — bypass React re-renders
      if (ghostRef.current) {
        ghostRef.current.style.left = `${e.clientX - 42}px`;
        ghostRef.current.style.top = `${e.clientY - 60}px`;
      }
    };

    const onMouseUp = () => {
      dragRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  return { isDragging, dragRef, ghostRef, startDrag, handleCanvasDrop };
}
