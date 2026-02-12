export default function FrameworksPage() {
  return (
    <div className="flex h-full items-start justify-center overflow-y-auto pt-[20vh]">
      <div className="mx-auto w-full max-w-4xl px-6 py-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-foreground mb-6">Frameworks</h1>

        <div className="flex flex-col items-center justify-center py-24 animate-scale-in">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/40 mb-5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-10 w-10 text-muted-foreground/40"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <p className="text-[16px] font-bold text-foreground mb-1">Frameworks</p>
          <p className="text-[14px] text-muted-foreground mb-1">
            Browse and import financial templates shared by the community and A4.
          </p>
          <p className="text-[13px] text-muted-foreground/70 mb-5">Coming soon</p>
          <div className="flex flex-wrap justify-center gap-2 mb-5">
            {['DCF Models', 'SaaS Metrics', 'Balance Sheets', 'Q4 Reports', 'Tax Planning', 'Portfolio Tracker'].map((tag) => (
              <span key={tag} className="rounded-lg bg-background border border-border/60 px-3 py-1.5 text-[12px] text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
          <button
            type="button"
            disabled
            className="rounded-full border border-border/60 px-5 py-2 text-[13px] font-medium text-muted-foreground opacity-60 cursor-not-allowed"
          >
            Join Waitlist
          </button>
        </div>
      </div>
    </div>
  );
}
