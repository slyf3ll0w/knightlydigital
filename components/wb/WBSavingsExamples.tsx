import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import { RATES } from "@/lib/plans";
import { BENCHMARK, COMPETITORS, EXAMPLE_SHOPS, SAVINGS_AS_OF, dollars, estimate } from "@/lib/wb-savings";

/**
 * Three worked examples from lib/wb-savings.ts, rendered on the server and
 * computed from the same math as the calculator: what each shop keeps in a
 * year when it pays the card fee itself, and when its clients pay the
 * service fee instead. Used on the free plan page; the calculator itself
 * lives on /pricing#savings.
 */
export default function WBSavingsExamples() {
  const rows = EXAMPLE_SHOPS.map((s) => ({
    ...s,
    company: estimate({ ...s, model: "company" }),
    client: estimate({ ...s, model: "client" }),
  }));
  const asOf = new Date(SAVINGS_AS_OF + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const first = COMPETITORS[0];
  return (
    <div>
      <div className="overflow-x-auto rounded-[1.25rem] border border-gray-200 bg-white">
        <table className="w-full min-w-[560px] text-left text-[14.5px]">
          <thead className="bg-[#F6F8FB] text-[12px] font-bold uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-bold">
                Kept a year
              </th>
              {COMPETITORS.map((c) => (
                <th key={c.id} scope="col" className="px-4 py-3 font-bold">
                  vs. {c.name}
                </th>
              ))}
              <th scope="col" className="px-4 py-3 font-bold text-[#0B57D8]">
                vs. {first.name}, client pays the fee
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="px-4 py-3 align-top font-semibold text-gray-800">
                  {r.label}
                  <span className="block text-[12.5px] font-normal text-gray-500">
                    {r.users} on the app · {dollars(r.monthlyVolumeCents)} a month by card
                  </span>
                </th>
                {r.company.competitors.map((c) => (
                  <td key={c.id} className="px-4 py-3 align-top">
                    <span className="font-display text-[17px] font-extrabold text-gray-900">{dollars(c.savingsYearCents)}</span>
                    <span className="block text-[12.5px] text-gray-500">their {c.label} plan</span>
                  </td>
                ))}
                <td className="px-4 py-3 align-top">
                  <span className="font-display text-[17px] font-extrabold text-[#0B57D8]">{dollars(r.client.competitors[0].savingsYearCents)}</span>
                  <span className="block text-[12.5px] text-gray-500">software and processing both at $0 to you</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-gray-500">
        Estimates. Published annual-commitment prices as of {asOf}, the cheapest plan that fits the team, and card processing costed at{" "}
        {BENCHMARK.label} for the others and at WorkBench&rsquo;s own {RATES.companyPaid.card} here. The last column adds the{" "}
        {RATES.serviceFee.card} service fee at checkout so clients cover the processing, where your state allows it. The calculator has the
        details and your own numbers.
      </p>
      <AnimateIn className="mt-4">
        <Link href="/pricing#savings" className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-[#0B57D8] hover:underline">
          Run it for your shop
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </Link>
      </AnimateIn>
    </div>
  );
}
