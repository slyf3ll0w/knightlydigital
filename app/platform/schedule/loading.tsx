import LoadingMoment from "@/components/LoadingMoment";

// The calendar's shape (toolbar, view switch, a month grid) in kit tokens so
// it is dark-safe, with the loading moment floating over it.
export default function ScheduleLoading() {
  return (
    <>
      <LoadingMoment />
      <div className="mx-auto max-w-6xl animate-pulse p-4 lg:p-8">
        <div className="mb-5 flex items-center justify-between">
          <div className="h-8 w-36 rounded-lg bg-[color:var(--ds-line-strong)]" />
          <div className="flex gap-2">
            <div className="h-9 w-32 rounded-lg bg-[color:var(--ds-line)]" />
            <div className="h-9 w-28 rounded-lg bg-[color:var(--ds-line-strong)]" />
          </div>
        </div>
        <div className="mb-4 flex items-center gap-2">
          <div className="h-8 w-40 rounded-lg bg-[color:var(--ds-line)]" />
          <div className="ml-auto h-8 w-44 rounded-lg bg-[color:var(--ds-line)]" />
        </div>
        <div className="ds-card overflow-hidden">
          <div className="grid grid-cols-7 gap-px bg-[color:var(--ds-line)]">
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="min-h-[80px] bg-[color:var(--ds-surface)] p-2 lg:min-h-[104px]">
                <div className="h-5 w-5 rounded-full bg-[color:var(--ds-line)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
