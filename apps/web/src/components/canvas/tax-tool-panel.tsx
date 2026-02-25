import { memo } from 'react';

const taxTools = [
  {
    type: 'tax-estimator-card',
    label: 'Tax Estimator',
    description: 'US federal & state tax estimate',
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
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="8" y1="6" x2="16" y2="6" />
        <line x1="8" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="12" y2="14" />
        <line x1="8" y1="18" x2="10" y2="18" />
      </svg>
    ),
  },
];

interface TaxToolPanelProps {
  onDragStart: (type: string, e: React.MouseEvent) => void;
}

export const TaxToolPanel = memo(function TaxToolPanel({ onDragStart }: TaxToolPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
        Drag to canvas
      </p>
      <div className="space-y-2">
        {taxTools.map((tool) => (
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
