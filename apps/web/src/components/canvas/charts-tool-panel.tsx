import { memo } from 'react';

const chartTools = [
  {
    type: 'chart-card',
    label: 'Chart',
    description: 'Data visualization',
    icon: (
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
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="17" x2="9" y2="11" />
        <line x1="12" y1="17" x2="12" y2="8" />
        <line x1="15" y1="17" x2="15" y2="13" />
      </svg>
    ),
  },
];

interface ChartsToolPanelProps {
  onDragStart: (type: string, e: React.MouseEvent) => void;
}

export const ChartsToolPanel = memo(function ChartsToolPanel({ onDragStart }: ChartsToolPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
        Drag to canvas
      </p>
      <div className="space-y-2">
        {chartTools.map((tool) => (
          <div
            key={tool.type}
            className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-3 cursor-grab transition-colors duration-100 hover:border-primary/30 hover:bg-primary/5 active:cursor-grabbing"
            onMouseDown={(e) => onDragStart(tool.type, e)}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
              {tool.icon}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">{tool.label}</p>
              <p className="text-[11px] text-muted-foreground">{tool.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
