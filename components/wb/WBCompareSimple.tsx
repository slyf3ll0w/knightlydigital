import { EXAMPLE_SHOPS, SAVINGS_AS_OF, dollars, estimate } from "@/lib/wb-savings";

/**
 * The price comparison, made plain (David 2026-11-18: "the price comparison
 * is very confusing"). One worked example from lib/wb-savings.ts, the same
 * math as the calculator: a three-person shop's whole monthly bill
 * (software + card fees) on WorkBench, Jobber and Housecall Pro, as bars,
 * and what it keeps in a year. The calculator stays one click away for
 * anyone who wants their own numbers.
 */
export default function WBCompareSimple() {
  const shop = EXAMPLE_SHOPS[1];
  const e = estimate({ ...shop, model: "company" });
  const rows = [
    { name: "WorkBench", cents: e.workbench.totalCents, ours: true },
    ...e.competitors.map((c) => ({ name: c.name, cents: c.totalCents, ours: false })),
  ];
  const max = Math.max(...rows.map((r) => r.cents));
  const keep = Math.min(...e.competitors.map((c) => c.savingsYearCents));
  const asOf = new Date(SAVINGS_AS_OF + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const volume = dollars(shop.monthlyVolumeCents);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
      <p className="text-[15px] font-bold text-gray-500">
        {shop.label} taking {volume} a month by card
      </p>
      <p className="mt-1 text-[22px] font-extrabold text-gray-900 sm:text-[26px]">The whole monthly bill, card fees included</p>
      <ul className="mt-7 space-y-5">
        {rows.map((r) => (
          <li key={r.name}>
            <div className="flex items-baseline justify-between gap-4">
              <span className={`text-[16px] font-extrabold ${r.ours ? "text-[#0B57D8]" : "text-gray-700"}`}>{r.name}</span>
              <span className={`text-[18px] font-extrabold tabular-nums ${r.ours ? "text-[#0B57D8]" : "text-gray-900"}`}>{dollars(r.cents)}</span>
            </div>
            <div className="mt-2 h-4 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${r.ours ? "bg-[#0B57D8]" : "bg-gray-400"}`} style={{ width: `${Math.max(6, (r.cents / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-7 rounded-lg bg-[#FFF4EC] px-5 py-4 text-[17px] font-extrabold text-gray-900">
        That shop keeps about <span className="text-[#E85D04]">{dollars(keep)} a year</span> on WorkBench.
      </p>
      <p className="mt-4 text-[13px] leading-relaxed text-gray-500">
        Estimate using each company&apos;s cheapest published plan for {shop.users} people and their card rates, as of {asOf}.
      </p>
    </div>
  );
}
