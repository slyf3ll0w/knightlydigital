export default function ScheduleLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse p-4 lg:p-8">
      <div className="mb-5 flex items-center justify-between">
        <div className="h-8 w-36 rounded bg-gray-200" />
        <div className="flex gap-2">
          <div className="h-9 w-32 rounded bg-gray-200" />
          <div className="h-9 w-28 rounded bg-gray-200" />
        </div>
      </div>
      <div className="mb-4 flex items-center gap-2">
        <div className="h-8 w-40 rounded bg-gray-200" />
        <div className="ml-auto h-8 w-44 rounded bg-gray-200" />
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-7 gap-px bg-gray-100">
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="min-h-[80px] bg-white p-2 lg:min-h-[104px]">
              <div className="h-5 w-5 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
