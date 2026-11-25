import LoadingMoment from "@/components/LoadingMoment";
import { OpenDetailSkeleton, OpenListSkeleton, OpenPageSkeleton } from "@/components/OpenSkeleton";

/**
 * Route-level loading skeletons so navigation shows the page's real shape
 * instead of a blank flash. Used from each section's loading.tsx.
 *
 * Three shapes: `ListPageSkeleton` (title, KPIs, filters, rows),
 * `DetailPageSkeleton` (a record's page: title bar, tall main card beside a
 * sidebar card on desktop, one column on phones; the open look at every size) and `PagePlaceholder` (the
 * neutral fallback for everything else — title + three card blocks). All
 * colour themselves from the kit tokens so they are dark-safe. Each floats
 * the LoadingMoment bar (a thin brand-color line across the top) beside the
 * pulsing skeleton, as a sibling so the pulse never dims the pill.
 */

// ── The exports: the new open look at every size (phones too, 2026-11-25) ──
export function DetailPageSkeleton({ sidebar = true }: { sidebar?: boolean }) {
  return (
    <>
      <LoadingMoment />
      <OpenDetailSkeleton sidebar={sidebar} />
    </>
  );
}

export function PagePlaceholder() {
  return (
    <>
      <LoadingMoment />
      <OpenPageSkeleton />
    </>
  );
}

export function ListPageSkeleton({ kpis = 3, filters = 4, rows = 8 }: { kpis?: number; filters?: number; rows?: number }) {
  return (
    <>
      <LoadingMoment />
      <OpenListSkeleton picture={kpis > 0} tabs={filters} rows={rows} />
    </>
  );
}
