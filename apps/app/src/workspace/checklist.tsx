import { useTRPC } from '@/lib/trpc';
import { type SummonKind, isSummonKind } from '@/workspace/panel';
import { useQuery } from '@tanstack/react-query';
import { Check, Circle, CircleDashed, Minus } from 'lucide-react';

/**
 * Where the year stands. The desk's default view, and the thing that turns a
 * blank workspace into something that knows what's outstanding.
 *
 * The four states carry different weight on purpose: attention is the only
 * one that gets colour, because a checklist where everything shouts is a
 * checklist nobody reads.
 */

type LineStatus = 'resolved' | 'attention' | 'not-started' | 'unknown';

const STATUS: Record<LineStatus, { icon: typeof Check; className: string; label: string }> = {
  resolved: { icon: Check, className: 'text-good', label: 'Settled' },
  attention: { icon: Circle, className: 'text-accent', label: 'Worth a look' },
  'not-started': { icon: CircleDashed, className: 'text-faint', label: 'Not started' },
  unknown: { icon: Minus, className: 'text-faint', label: "Can't tell yet" },
};

export function DeskChecklist({
  spaceId,
  taxYear,
  onOpen,
}: {
  spaceId: string;
  taxYear: number;
  /** Put the panel that justifies a line on the desk. */
  onOpen: (kind: SummonKind) => void;
}) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.desk.status.queryOptions({ workspaceId: spaceId, taxYear }),
  );

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-11 rounded-card bg-hairline/40" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const needsLook = data.counts.attention;

  return (
    <section className="rounded-card bg-surface shadow-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-hairline px-4 py-3">
        <h2 className="eyebrow">Where {taxYear} stands</h2>
        <span className="text-xs text-muted">
          {needsLook === 0 ? `${data.counts.resolved} settled` : `${needsLook} worth a look`}
        </span>
      </header>

      <ul className="divide-y divide-hairline">
        {data.lines.map((l) => {
          const spec = STATUS[l.status as LineStatus];
          const Icon = spec.icon;
          // A line only opens if there's a panel that actually justifies it.
          // The rest stay plain rather than offering a click that does nothing.
          const openable = l.panel !== null && isSummonKind(l.panel);
          const body = (
            <>
              <Icon
                size={14}
                strokeWidth={2}
                className={`mt-0.5 shrink-0 ${spec.className}`}
                aria-label={spec.label}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">{l.label}</p>
                <p className="text-xs leading-relaxed text-muted">{l.detail}</p>
              </div>
            </>
          );

          return (
            <li key={l.id}>
              {openable ? (
                <button
                  type="button"
                  onClick={() => onOpen(l.panel as SummonKind)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-paper"
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-start gap-3 px-4 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
