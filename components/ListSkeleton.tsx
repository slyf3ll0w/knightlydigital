/**
 * Route-level loading skeletons so navigation shows the page's real shape
 * instead of a blank flash. Used from each section's loading.tsx.
 *
 * Three shapes: `ListPageSkeleton` (title, KPIs, filters, rows),
 * `DetailPageSkeleton` (a record's page: title bar, tall main card beside a
 * sidebar card on desktop, one column on phones) and `PagePlaceholder` (the
 * neutral fallback for everything else — title + three card blocks). All
 * colour themselves from the kit tokens so they are dark-safe.
 */

export function DetailPageSkeleton({ sidebar = true }: { sidebar?: boolean }) {
  const line = (w: string, h = "h-3.5") => <div className={`${h} ${w} bg-[color:var(--ds-line)] rounded-lg`} />;
  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto animate-pulse">
      {/* back link + title row + action buttons */}
      <div className="h-3.5 w-20 bg-[color:var(--ds-line)] rounded-lg mb-3" />
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="h-7 w-56 max-w-full bg-[color:var(--ds-line-strong)] rounded-lg mb-2" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-20 bg-[color:var(--ds-line)] rounded-full" />
            <div className="h-3.5 w-28 bg-[color:var(--ds-line)] rounded-lg" />
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-2">
          <div className="h-9 w-24 bg-[color:var(--ds-line)] rounded-lg" />
          <div className="h-9 w-32 bg-[color:var(--ds-line-strong)] rounded-lg" />
        </div>
      </div>
      <div className={`grid gap-4 lg:gap-6 ${sidebar ? "lg:grid-cols-[1fr_320px]" : ""}`}>
        <div className="space-y-4 lg:space-y-6 min-w-0">
          <div className="ds-card ds-glass p-4 lg:p-5">
            <div className="h-4 w-32 bg-[color:var(--ds-line-strong)] rounded-lg mb-4" />
            <div className="space-y-3">
              {line("w-full")}
              {line("w-11/12")}
              {line("w-4/5")}
              {line("w-2/3")}
            </div>
            <div className="h-px bg-[color:var(--ds-line)] my-4" />
            <div className="space-y-3">
              {line("w-3/4")}
              {line("w-1/2")}
            </div>
          </div>
          <div className="ds-card ds-glass p-4 lg:p-5">
            <div className="h-4 w-24 bg-[color:var(--ds-line-strong)] rounded-lg mb-4" />
            <div className="space-y-3">
              {line("w-5/6")}
              {line("w-2/3")}
            </div>
          </div>
        </div>
        {sidebar && (
          <div className="space-y-4 lg:space-y-6 min-w-0">
            <div className="ds-card ds-glass p-4 lg:p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 bg-[color:var(--ds-line)] rounded-full shrink-0" />
                <div className="min-w-0 flex-1">
                  {line("w-32", "h-4")}
                  <div className="mt-1.5">{line("w-24", "h-3")}</div>
                </div>
              </div>
              <div className="space-y-2.5">
                {line("w-full", "h-3")}
                {line("w-5/6", "h-3")}
                {line("w-2/3", "h-3")}
              </div>
            </div>
            <div className="ds-card ds-glass p-4 lg:p-5">
              <div className="h-4 w-20 bg-[color:var(--ds-line-strong)] rounded-lg mb-4" />
              <div className="space-y-2.5">
                {line("w-3/4", "h-3")}
                {line("w-1/2", "h-3")}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PagePlaceholder() {
  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto animate-pulse">
      <div className="h-7 w-44 bg-[color:var(--ds-line-strong)] rounded-lg mb-6" />
      <div className="space-y-4 lg:space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="ds-card ds-glass p-4 lg:p-5">
            <div className="h-4 w-32 bg-[color:var(--ds-line-strong)] rounded-lg mb-4" />
            <div className="space-y-3">
              <div className="h-3.5 w-full bg-[color:var(--ds-line)] rounded-lg" />
              <div className="h-3.5 w-5/6 bg-[color:var(--ds-line)] rounded-lg" />
              <div className="h-3.5 w-2/3 bg-[color:var(--ds-line)] rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
