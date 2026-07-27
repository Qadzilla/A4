import { useCallback, useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../stores/canvas-store';

export const ITEM_DEFAULTS: Record<string, { width: number; height: number }> = {
  'a4-page': { width: 565, height: 800 },
  'secret-card': { width: 320, height: 240 },
  note: { width: 260, height: 180 },
  'table-card': { width: 400, height: 300 },
  'kpi-card': { width: 240, height: 140 },
  'chart-card': { width: 480, height: 320 },
  'file-card': { width: 280, height: 200 },
  'timer-card': { width: 240, height: 140 },
  'invoice-card': { width: 320, height: 400 },
  'budget-card': { width: 320, height: 360 },
  'ledger-card': { width: 320, height: 360 },
  'receipt-card': { width: 320, height: 360 },
  'subscription-card': { width: 320, height: 360 },
  'account-card': { width: 320, height: 360 },
  'pnl-card': { width: 360, height: 280 },
  'balance-sheet-card': { width: 340, height: 280 },
  'cash-flow-card': { width: 360, height: 280 },
  'tax-estimator-card': { width: 320, height: 300 },
  'loan-calculator-card': { width: 340, height: 300 },
  'projection-card': { width: 340, height: 280 },
  'breakeven-card': { width: 320, height: 260 },
  'depreciation-card': { width: 340, height: 280 },
  'embed-card': { width: 480, height: 320 },
  'networth-card': { width: 340, height: 280 },
  'debt-planner-card': { width: 340, height: 300 },
  'rent-vs-buy-card': { width: 340, height: 300 },
  'entity-card': { width: 280, height: 180 },
  'document-node': { width: 260, height: 200 },
  'portfolio-card': { width: 340, height: 280 },
  'header-card': { width: 300, height: 50 },
};

interface DragState {
  type: string;
  ghostX: number;
  ghostY: number;
  data?: Record<string, unknown>;
  name?: string;
}

export function useCanvasDrop() {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const addItem = useCanvasStore((s) => s.addItem);

  const startDrag = useCallback(
    (
      type: string,
      e: React.MouseEvent,
      opts?: { data?: Record<string, unknown>; name?: string },
    ) => {
      e.preventDefault();
      dragRef.current = {
        type,
        ghostX: e.clientX,
        ghostY: e.clientY,
        data: opts?.data,
        name: opts?.name,
      };
      setIsDragging(true);
    },
    [],
  );

  const onDropRef = useRef<((drag: DragState) => void) | undefined>(undefined);

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
        ...(drag.data ? { data: drag.data } : {}),
        ...(drag.name ? { name: drag.name } : {}),
      });

      onDropRef.current?.(drag);

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

  return { isDragging, dragRef, ghostRef, startDrag, handleCanvasDrop, onDropRef };
}
