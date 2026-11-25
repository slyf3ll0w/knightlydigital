import LoadingMoment from "@/components/LoadingMoment";
import { OpenHomeSkeleton } from "@/components/OpenSkeleton";

// Home's own shape while it loads, in kit tokens so it is dark-safe, with the
// loading moment floating over it. Desk: the branded band. Phone: the same
// band at phone size (app/ds-phone-home.css), then open rows.
export default function DashboardLoading() {
  const onBand = (w: string, h: string) => <div className={`${h} ${w} rounded-md bg-white/20`} />;
  const bar = (w: string, h = "h-3") => <div className={`${h} ${w} rounded-md bg-[color:var(--ds-line)]`} />;
  const section = (title: string, rows: number) => (
    <div>
      <div className="flex items-end border-b border-[color:var(--ds-line-strong)] pb-3">{bar(title, "h-5")}</div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-[color:var(--ds-line)] py-3.5">
          {bar("w-10")}
          <div className="flex-1 space-y-2">
            {bar(i % 2 ? "w-36" : "w-44")}
            {bar("w-24", "h-2.5")}
          </div>
          {bar("w-14", "h-5")}
        </div>
      ))}
    </div>
  );
  return (
    <>
      <LoadingMoment />
      <div className="hidden lg:block">
        <OpenHomeSkeleton />
      </div>
      <div className="ds bb-wrap lg:hidden">
        <div className="bb-band">
          <div className="ds bb-page bb-head animate-pulse px-4 pt-4">
            <div className="ds-pagehead">
              {onBand("w-32", "h-3")}
              <div className="mt-3">{onBand("w-56", "h-7")}</div>
              <div className="mt-4 flex gap-2">
                <div className="h-10 w-28 rounded-[10px] bg-white/15" />
                <div className="h-10 w-28 rounded-[10px] bg-white/30" />
              </div>
            </div>
          </div>
        </div>
        <div className="ds bb-page flex animate-pulse flex-col gap-7 px-4 pb-10 pt-6">
          <div className="h-16 rounded-2xl bg-[color:var(--ds-surface-2)]" />
          {section("w-28", 3)}
          {section("w-20", 4)}
        </div>
      </div>
    </>
  );
}
