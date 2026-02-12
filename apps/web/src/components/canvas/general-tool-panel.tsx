const availableTools = [
  {
    type: 'a4-page',
    label: 'A4 Page',
    description: 'Blank document page',
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
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
  },
];

interface GeneralToolPanelProps {
  onDragStart: (type: string, e: React.MouseEvent) => void;
}

export function GeneralToolPanel({ onDragStart }: GeneralToolPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
        Drag to canvas
      </p>
      <div className="space-y-2">
        {availableTools.map((tool) => (
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
}
