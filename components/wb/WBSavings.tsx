"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { INCLUDED_SEATS, RATES, formatCents } from "@/lib/plans";
import { BENCHMARK, COMPETITORS, SAVINGS_AS_OF, dollars, estimate, type SavingsInput } from "@/lib/wb-savings";

/**
 * The savings estimator: team size, monthly card volume, typical invoice,
 * and who pays the fee → what WorkBench costs next to the cheapest
 * published plan at Jobber and Housecall Pro, with processing costed for
 * all three. Every WorkBench number comes from lib/plans; the competitor
 * numbers and their as-of date come from lib/wb-savings.ts.
 */

const TICKETS = [150_00, 350_00, 800_00, 2_000_00];
const VOLUME_MAX = 100_000_00;
const VOLUME_STEP = 1_000_00;

function Stepper({ value, onChange, min, max }: { value: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <div className="inline-flex items-center rounded-full border border-gray-200 bg-white">
      <button type="button" aria-label="Fewer people" onClick={() => onChange(Math.max(min, value - 1))} className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 hover:bg-gray-50">
        <Minus className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <span className="font-display w-10 text-center text-[17px] font-extrabold text-gray-900">{value}</span>
      <button type="button" aria-label="More people" onClick={() => onChange(Math.min(max, value + 1))} className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 hover:bg-gray-50">
        <Plus className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

export default function WBSavings() {
  const [users, setUsers] = useState(3);
  const [volume, setVolume] = useState(20_000_00);
  const [ticket, setTicket] = useState(350_00);
  const [model, setModel] = useState<SavingsInput["model"]>("company");

  const est = useMemo(() => estimate({ users, monthlyVolumeCents: volume, avgTicketCents: ticket, model }), [users, volume, ticket, model]);
  const asOf = new Date(SAVINGS_AS_OF + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-12">
      {/* ── Inputs ── */}
      <div className="rounded-[1.25rem] border border-gray-200 bg-white p-6">
        <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500">Your shop</p>

        <div className="mt-5 flex items-center justify-between gap-4">
          <label className="text-[15px] font-bold text-gray-900">People on the app</label>
          <Stepper value={users} onChange={setUsers} min={1} max={20} />
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <label htmlFor="wb-savings-volume" className="text-[15px] font-bold text-gray-900">
              Card payments a month
            </label>
            <span className="font-display text-[17px] font-extrabold text-gray-900">{dollars(volume)}</span>
          </div>
          <input
            id="wb-savings-volume"
            type="range"
            min={0}
            max={VOLUME_MAX}
            step={VOLUME_STEP}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="mt-3 w-full accent-[#0B57D8]"
          />
          <p className="mt-1.5 text-[12.5px] text-gray-500">What clients pay you by card, not your total revenue.</p>
        </div>

        <div className="mt-6">
          <p className="text-[15px] font-bold text-gray-900">Typical invoice</p>
          <div className="mt-2.5 inline-flex flex-wrap gap-1 rounded-full border border-gray-200 bg-white p-1">
            {TICKETS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTicket(t)}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${ticket === t ? "bg-[#0B57D8] text-white" : "text-gray-500 hover:text-gray-900"}`}
              >
                {dollars(t)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[15px] font-bold text-gray-900">Who pays the card fee on WorkBench</p>
          <div className="mt-2.5 inline-flex rounded-full border border-gray-200 bg-white p-1">
            {(
              [
                ["company", "I pay it"],
                ["client", "My client pays it"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setModel(m)}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${model === m ? "bg-[#0B57D8] text-white" : "text-gray-500 hover:text-gray-900"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12.5px] text-gray-500">
            {model === "company" ? `${RATES.companyPaid.card} per card payment.` : `A ${RATES.serviceFee.card} service fee at checkout; you receive the full invoice.`}
          </p>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="min-w-0">
        <div className="grid gap-4 sm:grid-cols-2">
          {est.competitors.map((c) => (
            <div key={c.id} className="rounded-[1.25rem] border border-gray-200 bg-white p-6">
              <p className="text-[13px] font-bold text-gray-500">Next to {c.name}</p>
              <p className="font-display mt-2 text-[2.4rem] font-extrabold leading-none text-gray-900">
                {c.savingsYearCents >= 0 ? dollars(c.savingsYearCents) : `−${dollars(-c.savingsYearCents)}`}
              </p>
              <p className="mt-1.5 text-[14px] text-gray-600">{c.savingsYearCents >= 0 ? "kept a year" : "more a year"}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 overflow-x-auto rounded-[1.25rem] border border-gray-200 bg-white">
          <table className="w-full min-w-[540px] text-left text-[14px]">
            <thead className="bg-[#F6F8FB] text-[12px] font-bold uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-bold">
                  A month
                </th>
                <th scope="col" className="px-4 py-3 font-bold text-gray-900">
                  WorkBench
                </th>
                {est.competitors.map((c) => (
                  <th key={c.id} scope="col" className="px-4 py-3 font-bold">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <th scope="row" className="px-4 py-3 align-top font-semibold text-gray-700">
                  Software
                </th>
                <td className="px-4 py-3 align-top">
                  <span className="font-display text-[15px] font-bold text-gray-900">{formatCents(est.workbench.softwareCents)}</span>
                  <span className="block text-[12.5px] text-gray-500">{est.workbench.label}</span>
                </td>
                {est.competitors.map((c) => (
                  <td key={c.id} className="px-4 py-3 align-top">
                    <span className="font-display text-[15px] font-bold text-gray-900">{formatCents(c.softwareCents)}</span>
                    <span className="block text-[12.5px] text-gray-500">{c.label}</span>
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 align-top font-semibold text-gray-700">
                  Card processing
                </th>
                <td className="px-4 py-3 align-top">
                  <span className="font-display text-[15px] font-bold text-gray-900">{formatCents(est.workbench.processingCents)}</span>
                  <span className="block text-[12.5px] text-gray-500">{est.workbench.processingNote}</span>
                </td>
                {est.competitors.map((c) => (
                  <td key={c.id} className="px-4 py-3 align-top">
                    <span className="font-display text-[15px] font-bold text-gray-900">{formatCents(c.processingCents)}</span>
                    <span className="block text-[12.5px] text-gray-500">at {BENCHMARK.label}</span>
                  </td>
                ))}
              </tr>
              <tr className="bg-[#F6F8FB]">
                <th scope="row" className="px-4 py-3 font-bold text-gray-900">
                  Total
                </th>
                <td className="px-4 py-3">
                  <span className="font-display text-[16px] font-extrabold text-[#0B57D8]">{formatCents(est.workbench.totalCents)}</span>
                </td>
                {est.competitors.map((c) => (
                  <td key={c.id} className="px-4 py-3">
                    <span className="font-display text-[16px] font-extrabold text-gray-900">{formatCents(c.totalCents)}</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-gray-500">
          Estimates. {COMPETITORS.map((c) => c.name).join(" and ")} prices are their published annual-commitment list prices as of {asOf}, the
          cheapest plan that fits the team, with extra seats at their published add-on price where they sell them (
          {COMPETITORS.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <a href={c.sourceUrl} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-gray-900">
                {c.name}
              </a>
            </span>
          ))}
          ). Their card processing is costed at {BENCHMARK.label}, {BENCHMARK.note}; {COMPETITORS[1].rateNote}. WorkBench&rsquo;s free plan covers{" "}
          {INCLUDED_SEATS} people; the Pro add-on is used where it is cheaper than extra seats. The service fee option is subject to your state&rsquo;s rules
          on surcharges. Check each vendor&rsquo;s page before you decide; they change their prices and so do we.
        </p>
      </div>
    </div>
  );
}
