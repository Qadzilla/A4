/**
 * The "One Basis Point" mark — the selected logo direction (BASIS DESIGN,
 * route 04). Two measuring posts spanning a cobalt point: the one basis
 * point that matters, measured. Geometry is fixed; color comes from
 * currentColor (posts) and the accent token (the point).
 */
export function BasisMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true">
      <rect x="115" y="168" width="26" height="176" rx="3" fill="currentColor" />
      <rect x="371" y="168" width="26" height="176" rx="3" fill="currentColor" />
      <rect x="141" y="243" width="59" height="26" fill="currentColor" />
      <rect x="312" y="243" width="59" height="26" fill="currentColor" />
      <circle cx="256" cy="256" r="44" fill="var(--color-accent, #2b59ff)" />
    </svg>
  );
}

/** Mark + lowercase wordmark + cobalt point, per the lockup sheet. */
export function BasisWordmark({
  markSize = 18,
  textClassName = 'font-mono text-[15px] font-bold tracking-tight',
}: {
  markSize?: number;
  textClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <BasisMark size={markSize} />
      <span className={textClassName}>
        basis<span className="text-accent">.</span>
      </span>
    </span>
  );
}
