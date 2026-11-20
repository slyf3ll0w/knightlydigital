import { BENCHMARK, COMPETITORS, EXAMPLE_SHOPS, SAVINGS_AS_OF, dollars, estimate, type Competitor } from "@/lib/wb-savings";
import WBVsYearBars, { type YearBarRow } from "./WBVsYearBars";

/**
 * A year of cost for one typical shop (EXAMPLE_SHOPS[1] in lib/wb-savings.ts),
 * WorkBench next to the competitors that publish a price — the same math the
 * old calculator ran, every figure computed (lib/plans for WorkBench, the
 * dated list prices in lib/wb-savings for the others). Used on /pricing,
 * /vs/* and /alternatives/*. `only` narrows it to one competitor.
 */

/** The shop the site calls "average": three people, the middle worked example. */
export const TYPICAL_SHOP = EXAMPLE_SHOPS[1];

export function typicalSavings(only?: Competitor["id"]) {
  const e = estimate({ ...TYPICAL_SHOP, model: "company" });
  const competitors = e.competitors.filter((c) => !only || c.id === only);
  const rows: YearBarRow[] = [
    {
      name: "WorkBench",
      ours: true,
      plan: e.workbench.label,
      software: dollars(e.workbench.softwareCents * 12),
      softwareCents: e.workbench.softwareCents * 12,
      card: dollars(e.workbench.processingCents * 12),
      cardCents: e.workbench.processingCents * 12,
    },
    ...competitors.map((c) => ({
      name: c.name,
      ours: false,
      plan: c.label,
      software: dollars(c.softwareCents * 12),
      softwareCents: c.softwareCents * 12,
      card: dollars(c.processingCents * 12),
      cardCents: c.processingCents * 12,
    })),
  ];
  // The headline is the SMALLEST saving among the competitors shown, so it never oversells.
  const keptYearCents = Math.min(...competitors.map((c) => c.savingsYearCents));
  return { rows, keptYearCents, competitors };
}

export function savingsAsOf(): string {
  return new Date(SAVINGS_AS_OF + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** "3 people, $25,000 a month in card payments, $450 average invoice". */
export function typicalShopLine(): string {
  return `${TYPICAL_SHOP.users} people, ${dollars(TYPICAL_SHOP.monthlyVolumeCents)} a month in card payments, ${dollars(TYPICAL_SHOP.avgTicketCents)} average invoice`;
}

export default function WBVsCost({ only, footer }: { only?: Competitor["id"]; footer?: React.ReactNode }) {
  const { rows } = typicalSavings(only);
  const shown = COMPETITORS.filter((c) => !only || c.id === only);
  return (
    <div>
      <WBVsYearBars rows={rows} footer={footer} />
      <p className="mt-6 border-t border-gray-200 pt-4 text-[12.5px] leading-relaxed text-gray-500">
        Estimate for {typicalShopLine()}. {shown.map((c) => c.name).join(" and ")}: the cheapest published annual-commitment plan that fits the
        team, read {savingsAsOf()} (
        {shown.map((c, i) => (
          <span key={c.id}>
            {i > 0 && ", "}
            <a href={c.sourceUrl} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-gray-900">
              {c.name} pricing
            </a>
          </span>
        ))}
        ), card fees at {BENCHMARK.label}. WorkBench at its own published rate, extra seats included. Prices change on both sides; check their site for
        current plans.
      </p>
    </div>
  );
}
