import LoadingMoment from "@/components/LoadingMoment";

// Home's own shape (KPI ledger, chart, side cards) in kit tokens so it is
// dark-safe, with the loading moment floating over it.
export default function DashboardLoading() {
  return (
    <>
      <LoadingMoment />
      <div className="p-4 lg:p-8 max-w-6xl mx-auto animate-pulse">
        <div className="mb-6">
          <div className="h-3.5 w-44 bg-[color:var(--ds-line)] rounded-lg mb-2" />
          <div className="h-7 w-64 bg-[color:var(--ds-line-strong)] rounded-lg" />
        </div>
        <div className="h-3 w-20 bg-[color:var(--ds-line)] rounded-lg mb-2" />
        <div className="card-ledger grid grid-cols-2 lg:grid-cols-4 overflow-hidden mb-8">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="border-[color:var(--ds-line)] max-lg:odd:border-r max-lg:[&:nth-child(n+3)]:border-t lg:border-l lg:first:border-l-0"
            >
              <div className="p-4">
                <div className="h-3.5 w-24 bg-[color:var(--ds-line)] rounded-lg mb-4" />
                <div className="h-8 w-12 bg-[color:var(--ds-line-strong)] rounded-lg mb-2" />
                <div className="h-5 w-28 bg-[color:var(--ds-line)] rounded-lg" />
              </div>
              <div className="border-t border-[color:var(--ds-line)] px-4 py-2">
                <div className="h-3 w-20 bg-[color:var(--ds-line)] rounded-lg" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          <div className="h-72 card-ledger" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 card-ledger" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
