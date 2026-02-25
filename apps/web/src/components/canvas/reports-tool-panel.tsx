import { memo } from 'react';

const reportsTools = [
  {
    type: 'pnl-card',
    label: 'P&L Statement',
    description: 'Profit & loss report',
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
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    type: 'balance-sheet-card',
    label: 'Balance Sheet',
    description: 'Assets, liabilities & equity',
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
        <path d="M12 3v18" />
        <path d="M8 7H5a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h3" />
        <path d="M16 7h3a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-3" />
        <path d="M8 13H4a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h4" />
        <path d="M16 13h4a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-4" />
      </svg>
    ),
  },
  {
    type: 'cash-flow-card',
    label: 'Cash Flow',
    description: 'Cash flow statement',
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
        <path d="M12 2v20" />
        <path d="m17 5-5-3-5 3" />
        <path d="m17 19-5 3-5-3" />
        <path d="M2 12h20" />
        <path d="m5 9-3 3 3 3" />
        <path d="m19 9 3 3-3 3" />
      </svg>
    ),
  },
];

interface ReportsToolPanelProps {
  onDragStart: (type: string, e: React.MouseEvent) => void;
}

export const ReportsToolPanel = memo(function ReportsToolPanel({
  onDragStart,
}: ReportsToolPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
        Drag to canvas
      </p>
      <div className="space-y-2">
        {reportsTools.map((tool) => (
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
