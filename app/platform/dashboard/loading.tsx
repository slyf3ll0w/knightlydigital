export default function DashboardLoading() {
  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto animate-pulse">
      <div className="mb-6">
        <div className="h-3.5 w-44 bg-gray-100 rounded-lg mb-2" />
        <div className="h-7 w-64 bg-gray-200 rounded-lg" />
      </div>
      <div className="h-3 w-20 bg-gray-100 rounded-lg mb-2" />
      <div className="card-ledger grid grid-cols-2 lg:grid-cols-4 overflow-hidden mb-8">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="border-gray-200/80 max-lg:odd:border-r max-lg:[&:nth-child(n+3)]:border-t lg:border-l lg:first:border-l-0"
          >
            <div className="p-4">
              <div className="h-3.5 w-24 bg-gray-100 rounded-lg mb-4" />
              <div className="h-8 w-12 bg-gray-200 rounded-lg mb-2" />
              <div className="h-5 w-28 bg-gray-100 rounded-lg" />
            </div>
            <div className="border-t border-gray-100 px-4 py-2">
              <div className="h-3 w-20 bg-gray-100 rounded-lg" />
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
  );
}
