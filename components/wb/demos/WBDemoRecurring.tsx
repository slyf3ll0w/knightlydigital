"use client";

import { Check, CreditCard, Receipt, Repeat } from "lucide-react";
import WBAppFrame from "./WBAppFrame";
import { Card, Chip, PageHead, initialsOf, usd, useDemoLoop, useRoll } from "./kit";

/**
 * A client's recurring series: "{service} · {cadence}", the coming visits
 * filling a strip of dates, then ticking Done one by one. Billed per visit,
 * each completed visit drops its invoice in, paid by autopay; billed
 * monthly, the visits wait and one invoice for the month lands at the end
 * with a dated line per visit. Rests on the finished month under reduced
 * motion.
 */

const DEFAULTS = {
  client: "Marcus Bell",
  service: "Lighting maintenance",
  cadence: "Every 2 weeks",
  price: 95,
  visits: ["Nov 4", "Nov 18", "Dec 2", "Dec 16"],
};

export default function WBDemoRecurring({
  client = DEFAULTS.client,
  service = DEFAULTS.service,
  cadence = DEFAULTS.cadence,
  price = DEFAULTS.price,
  billing = "visit",
  visits = DEFAULTS.visits,
  month = "November",
}: {
  client?: string;
  service?: string;
  cadence?: string;
  price?: number;
  billing?: "visit" | "monthly";
  /** date labels, "Nov 4" style; up to six are shown */
  visits?: string[];
  /** the month the consolidated invoice is for (monthly billing) */
  month?: string;
} = {}) {
  const vs = visits.slice(0, 6);
  const n = vs.length;
  // 1..n tiles fill in · then n visits complete · monthly: + invoice + paid
  const fill = vs.map((_, k) => 300 + k * 180);
  const complete = vs.map((_, k) => 1700 + k * 1100);
  const last = 1700 + (n - 1) * 1100;
  const tail = billing === "monthly" ? [last + 900, last + 1700] : [];
  const { ref, b } = useDemoLoop([...fill, ...complete, ...tail], last + 4600);
  const filled = Math.min(n, b);
  const doneCount = Math.max(0, Math.min(n, b - n));
  const monthlyIssued = billing === "monthly" && b >= 2 * n + 1;
  const monthlyPaid = billing === "monthly" && b >= 2 * n + 2;
  const paidTotal = billing === "visit" ? doneCount * price : monthlyPaid ? n * price : 0;
  const shownPaid = useRoll(paidTotal, 500);
  const ready = billing === "monthly" && !monthlyIssued ? doneCount * price : 0;

  return (
    <div ref={ref}>
      <WBAppFrame nav="Recurring" height={350} heightSm={330}>
        <PageHead
          sub="Clients"
          title={client}
          right={
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3E5277] text-[10px] font-semibold text-white">{initialsOf(client)}</span>
              <Chip tone="green">Active</Chip>
            </span>
          }
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-[1.15fr_1fr]">
          {/* the series */}
          <Card className="p-4">
            <div className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#1D2E52] text-white">
                <Repeat className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-gray-900">
                  {service} · {cadence}
                </span>
                <span className="block text-[10.5px] text-gray-500">{usd(price)} a visit · Sam</span>
              </span>
            </div>
            <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(0, 1fr))` }}>
              {vs.map((v, k) => {
                const [mon, dd] = v.includes(" ") ? [v.split(" ")[0], v.split(" ").slice(1).join(" ")] : ["", v];
                const shown = k < filled;
                const done = k < doneCount;
                if (!shown) return <span key={k} className="h-[64px] rounded-xl border-2 border-dashed border-[#E3E6EC]" />;
                return (
                  <span
                    key={k}
                    className={`wb-pop-in relative flex h-[64px] flex-col items-center justify-center rounded-xl border transition-colors duration-500 ${done ? "border-[#9FD8B2] bg-[#F1FAF4]" : "border-[#C9D3E6] bg-[#E8EEFB]"}`}
                  >
                    <span className={`text-[9px] font-semibold uppercase tracking-[0.08em] ${done ? "text-[#17703B]" : "text-[#22406E]"}`}>{mon}</span>
                    <span className={`text-[18px] font-semibold leading-none ${done ? "text-[#17703B]" : "text-[#22406E]"}`}>{dd}</span>
                    <span className="mt-1 h-3.5">
                      {done ? (
                        <span key="d" className="wb-demo-tick flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#17A34A] text-white">
                          <Check className="h-2.5 w-2.5" strokeWidth={3.4} />
                        </span>
                      ) : (
                        <span className="text-[8.5px] text-[#3E5277]">9:00a</span>
                      )}
                    </span>
                  </span>
                );
              })}
            </div>
            <div className="mt-3 space-y-1.5 border-t border-[#EEF0F3] pt-3 text-[11px]">
              <p className="flex items-center justify-between">
                <span className="text-gray-500">Billing</span>
                <span className="font-semibold text-gray-900">{billing === "visit" ? "Per visit, after each one" : "One invoice a month"}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-gray-500">Autopay</span>
                <span className="flex items-center gap-1 font-semibold text-gray-900">
                  <CreditCard className="h-3 w-3" /> Visa •••• 4242
                </span>
              </p>
              <p className="flex items-center justify-between sm:hidden">
                <span className="text-gray-500">Paid by autopay</span>
                <span className="font-semibold tabular-nums text-[#17703B]">{usd(Math.round(shownPaid))}</span>
              </p>
              {billing === "monthly" && (
                <p className="flex items-center justify-between">
                  <span className="text-gray-500">Ready to bill</span>
                  <span className="font-semibold tabular-nums text-gray-900">
                    {monthlyIssued ? "Billed" : `${doneCount} ${doneCount === 1 ? "visit" : "visits"} · ${usd(ready)}`}
                  </span>
                </p>
              )}
            </div>
          </Card>

          {/* invoices */}
          <Card className="flex flex-col max-sm:hidden">
            <div className="flex items-center justify-between border-b border-[#EEF0F3] px-4 py-2.5">
              <span className="text-[11.5px] font-semibold text-gray-900">Invoices</span>
              <span className="text-[10.5px] tabular-nums text-gray-500">Paid {usd(Math.round(shownPaid))}</span>
            </div>
            <div className="flex-1">
              {billing === "visit" &&
                vs.slice(0, doneCount).map((v, k) => (
                  <div key={v + k} className="wb-row-in flex items-center gap-2.5 border-b border-[#EEF0F3] px-4 py-2">
                    <Receipt className="h-3.5 w-3.5 flex-none text-gray-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-semibold text-gray-900">
                        #{2491 + k} · {v}
                      </span>
                      <span className="block text-[10px] text-gray-500">{service}</span>
                    </span>
                    <span className="flex flex-col items-end gap-0.5">
                      <span className="text-[11.5px] font-semibold tabular-nums text-gray-900">{usd(price)}</span>
                      <Chip tone="green">Paid · autopay</Chip>
                    </span>
                  </div>
                ))}
              {billing === "monthly" && monthlyIssued && (
                <div className="wb-row-in border-b border-[#EEF0F3] px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Receipt className="h-3.5 w-3.5 flex-none text-gray-400" />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-gray-900">#2491 · {month}</span>
                    <span className="text-[11.5px] font-semibold tabular-nums text-gray-900">{usd(n * price)}</span>
                  </div>
                  <div className="mt-1.5 space-y-0.5 pl-6">
                    {vs.map((v, k) => (
                      <p key={k} className="flex justify-between text-[10px] text-gray-500">
                        <span>
                          {v} · {service}
                        </span>
                        <span className="tabular-nums">{usd(price)}</span>
                      </p>
                    ))}
                  </div>
                  <div className="mt-1.5 flex justify-end">{monthlyPaid ? <Chip tone="green" className="wb-pop-in">Paid · autopay</Chip> : <Chip tone="amber">Charging card…</Chip>}</div>
                </div>
              )}
              {((billing === "visit" && doneCount === 0) || (billing === "monthly" && !monthlyIssued)) && (
                <p className="px-4 py-6 text-center text-[10.5px] text-gray-400">{billing === "visit" ? "Each visit bills when it is done" : "One invoice when the month's visits are done"}</p>
              )}
            </div>
          </Card>
        </div>
      </WBAppFrame>
    </div>
  );
}
