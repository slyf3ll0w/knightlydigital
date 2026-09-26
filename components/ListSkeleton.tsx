/**
 * Route-level loading skeletons so navigation shows the page's real shape
 * instead of a blank flash. Used from each section's loading.tsx.
 */

export function ListPageSkeleton({
  kpis = 3,
  filters = 4,
  rows = 8,
}: {
  kpis?: number;
  filters?: number;
  rows?: number;
}) {
  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-7 w-36 bg-[color:var(--ds-line-strong)] rounded-lg" />
        <div className="h-9 w-32 bg-[color:var(--ds-line-strong)] rounded-lg" />
      </div>
      {kpis > 0 && (
        <div
          className="grid gap-3 mb-6"
          style={{ gridTemplateColumns: `repeat(${Math.min(kpis, 4)}, minmax(0, 1fr))` }}
        >
          {[...Array(kpis)].map((_, i) => (
            <div key={i} className="h-[88px] ds-card ds-glass p-4">
              <div className="h-3 w-20 bg-[color:var(--ds-line)] rounded-lg mb-3" />
              <div className="h-6 w-16 bg-[color:var(--ds-line-strong)] rounded-lg" />
            </div>
          ))}
        </div>
      )}
      {filters > 0 && (
        <div className="flex items-center gap-1 mb-4">
          {[...Array(filters)].map((_, i) => (
            <div key={i} className="h-8 w-20 bg-[color:var(--ds-line)] rounded-lg" />
          ))}
        </div>
      )}
      <div className="ds-card ds-glass overflow-hidden">
        <div className="h-9 bg-[color:var(--ds-line)] border-b border-[color:var(--ds-line)]" />
        <div className="divide-y divide-[color:var(--ds-line)]">
          {[...Array(rows)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-2.5">
              <div className="flex-1">
                <div className="h-3.5 w-40 bg-[color:var(--ds-line-strong)] rounded-lg mb-1.5" />
                <div className="h-3 w-24 bg-[color:var(--ds-line)] rounded-lg" />
              </div>
              <div className="h-5 w-24 bg-[color:var(--ds-line)] rounded-full" />
              <div className="h-3.5 w-16 bg-[color:var(--ds-line)] rounded-lg hidden lg:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
