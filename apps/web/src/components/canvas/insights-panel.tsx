import { cn } from '@a4/ui';
import { memo, useEffect, useState } from 'react';

interface Insight {
  id: string;
  type: string;
  severity: string;
  title: string;
  summary: string;
  data: unknown;
  createdAt: Date | string;
}

interface InsightsPanelProps {
  insights: Insight[];
  isLoading: boolean;
  isGenerating: boolean;
  onDismiss: (id: string) => void;
  onEngage: (id: string) => void;
  onClose: () => void;
  unreadCount: number | undefined;
}

const TYPE_LABELS: Record<string, string> = {
  budget_overspend: 'Budget',
  low_cash: 'Cash Flow',
  debt_deadline: 'Debt',
  portfolio_drift: 'Portfolio',
  networth_change: 'Net Worth',
  subscription_spike: 'Subscriptions',
  high_spending_category: 'Spending',
};

function relativeTime(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

const SEVERITY_CONFIG = {
  critical: {
    label: 'Critical',
    textClass: 'text-destructive',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  warning: {
    label: 'Warning',
    textClass: 'text-amber-500',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  info: {
    label: 'Info',
    textClass: 'text-primary',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
} as const;

type SeverityKey = keyof typeof SEVERITY_CONFIG;

function InsightCard({
  insight,
  onDismiss,
  onEngage,
}: {
  insight: Insight;
  onDismiss: (id: string) => void;
  onEngage: (id: string) => void;
}) {
  const [isDismissing, setIsDismissing] = useState(false);

  const handleDismiss = () => {
    setIsDismissing(true);
    setTimeout(() => onDismiss(insight.id), 200);
  };

  return (
    <div
      className={cn(
        'bg-muted/30 border border-border/40 rounded-lg p-3.5 space-y-2 transition-all duration-200 max-h-[200px]',
        isDismissing && 'opacity-0 max-h-0 overflow-hidden !p-0 !my-0 border-0',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-foreground leading-tight">{insight.title}</span>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
          {relativeTime(insight.createdAt)}
        </span>
      </div>

      <div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          {TYPE_LABELS[insight.type] ?? insight.type}
        </span>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{insight.summary}</p>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={handleDismiss}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => onEngage(insight.id)}
          className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/15"
        >
          Ask Paige
        </button>
      </div>
    </div>
  );
}

function SeverityGroup({
  severity,
  insights,
  onDismiss,
  onEngage,
}: {
  severity: SeverityKey;
  insights: Insight[];
  onDismiss: (id: string) => void;
  onEngage: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const config = SEVERITY_CONFIG[severity];

  if (insights.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-1.5 w-full text-left mb-2',
          config.textClass,
        )}
      >
        {config.icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider">
          {config.label}
        </span>
        <span className="text-[10px] opacity-70">({insights.length})</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('size-3 ml-auto transition-transform', expanded && 'rotate-180')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="space-y-3">
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onDismiss={onDismiss}
              onEngage={onEngage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const InsightsPanel = memo(function InsightsPanel({
  insights,
  isLoading,
  isGenerating,
  onDismiss,
  onEngage,
  onClose,
  unreadCount,
}: InsightsPanelProps) {
  // Close panel on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const critical = insights.filter((i) => i.severity === 'critical');
  const warning = insights.filter((i) => i.severity === 'warning');
  const info = insights.filter((i) => i.severity === 'info');

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--color-foreground)]/6">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-amber-500">
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
          </svg>
          <span className="text-[13px] font-semibold">Insights</span>
          {(unreadCount ?? 0) > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
              {unreadCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Close insights"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>

      {/* Generating indicator */}
      {isGenerating && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-border/40 bg-muted/20">
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60" />
            <span className="relative inline-flex rounded-full size-2 bg-primary" />
          </span>
          <span className="text-[11px] text-muted-foreground">Analyzing workspace...</span>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto chat-scrollbar px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-muted/40 rounded-lg h-24" />
            ))}
          </div>
        ) : insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="size-10 text-muted-foreground/40 mb-3">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
            </svg>
            <p className="text-sm text-muted-foreground">
              No insights right now. Paige will notify you when something needs attention.
            </p>
          </div>
        ) : (
          <>
            <SeverityGroup severity="critical" insights={critical} onDismiss={onDismiss} onEngage={onEngage} />
            <SeverityGroup severity="warning" insights={warning} onDismiss={onDismiss} onEngage={onEngage} />
            <SeverityGroup severity="info" insights={info} onDismiss={onDismiss} onEngage={onEngage} />
          </>
        )}
      </div>
    </>
  );
});
