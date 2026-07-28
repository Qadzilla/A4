export function TaxesSurface() {
  return (
    <div className="rise mx-auto max-w-3xl px-5 py-8 md:py-12">
      <p className="eyebrow mb-1.5">Taxes</p>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">
        If the year ended today, you'd owe…
      </h1>
      <p className="mb-8 max-w-md text-sm text-muted">
        The year-round tax meter lands in the tax pillar build: withholding vs. projected liability,
        realized gains split short/long-term, and quarterly deadlines — all 50 states.
      </p>

      <div className="max-w-md rounded-card border border-hairline bg-surface p-5">
        <p className="eyebrow mb-3">Preview of the meter</p>
        <div className="tnum mb-1 font-mono text-3xl font-bold text-faint">$—,———</div>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-paper">
          <div className="h-full w-1/3 rounded-full bg-accent opacity-30" />
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs text-muted">
          <div>
            <p className="eyebrow mb-0.5">Withheld</p>
            <p className="tnum font-mono">$—</p>
          </div>
          <div>
            <p className="eyebrow mb-0.5">Realized gains</p>
            <p className="tnum font-mono">$—</p>
          </div>
        </div>
      </div>
      <p className="eyebrow mt-4">The engine is already built — this surface wires up in P4</p>
    </div>
  );
}
