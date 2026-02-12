import type { CanvasItem } from '../../stores/canvas-store';

interface DocumentViewProps {
  item: CanvasItem;
}

export function DocumentView({ item }: DocumentViewProps) {
  return (
    <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-8">
      <div
        className="bg-white dark:bg-zinc-50 shadow-lg border border-border/40 rounded-sm"
        style={{ width: 816, minHeight: 1056 }}
      >
        <div className="p-16">
          <p className="text-[14px] text-muted-foreground/50 select-none">
            {item.name}
          </p>
        </div>
      </div>
    </div>
  );
}
