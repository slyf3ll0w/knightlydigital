"use client";
import { RATES_SHORT } from "@/lib/plans";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

const CARD = "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";
import { freeGroups } from "@/lib/wb-free";
import {
  ANNUAL_MONTHS,
  DISPATCH_SETUP_CENTS,
  EXTRA_SEAT_CENTS,
  FAIR_USE_MINUTES_LABEL,
  FAIR_USE_TEXTS_LABEL,
  FREE_PLAN_NAME,
  FULL_SHOP,
  INCLUDED_SEATS,
  PLANS,
  annualCents,
  formatCents,
  separatelyMonthlyCents,
} from "@/lib/plans";

/**
 * The WorkBench pricing grid: the free core (Core) up top — full access,
 * not a trial — then the optional add-ons (Voice, Pro, Gallery, Max) with a monthly/annual toggle. Every number comes from lib/plans.ts.
 * Atlas Full is not shown as its own product (David 2026-11-19); Pro lists the tokens it includes.
 */


function PriceLine({ monthlyCents, annual }: { monthlyCents: number; annual: boolean }) {
  const yearly = annualCents(monthlyCents);
  return (
    <>
      <p className="mt-4 text-4xl font-black leading-none tracking-[-0.03em]">
        {annual ? formatCents(yearly) : formatCents(monthlyCents)}
        <span className="text-base font-bold opacity-60">{annual ? "/year" : "/month"}</span>
      </p>
      <p className="mt-1.5 text-[13px] opacity-70">
        {annual
          ? `${formatCents(Math.round(yearly / 12))} a month, ${12 - ANNUAL_MONTHS} months free`
          : "Billed monthly, cancel any time"}
      </p>
    </>
  );
}

export default function WBPricing() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const annual = billing === "annual";

  const dispatch = PLANS.DISPATCH;
  const shop = PLANS.SHOP;
  const jobsite = PLANS.JOBSITE;
  const saveNow = separatelyMonthlyCents() - FULL_SHOP.monthlyCents;

  return (
    <div>
      {/* ── Core: the free plan ── */}
      <div className={`grid overflow-hidden ${CARD} lg:grid-cols-[350px_1fr]`}>
        <div className="relative flex flex-col bg-[#0A1428] p-8 lg:p-10">
          <div className="relative flex h-full flex-col">
            <p className="text-[15px] font-black text-[#FF8B33]">{FREE_PLAN_NAME}</p>
            <p className="mt-3 text-6xl font-black leading-none tracking-[-0.04em] text-white">Free</p>
            <p className="mt-3 text-[17px] font-bold text-white">Not a trial. Full access.</p>
            <p className="mt-2 text-[14px] leading-relaxed text-blue-100/80">
              $0 a month for {INCLUDED_SEATS} users. Every essential feature, on from day one, for as
              long as you want it.
            </p>

            <ul className="mt-7 flex flex-col gap-3">
              {[
                "No credit card, no trial clock",
                `${INCLUDED_SEATS} users included, ${formatCents(EXTRA_SEAT_CENTS)} a month each after`,
                "Features you use never get taken away",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-[14px] text-white">
                  <Check className="h-4 w-4 flex-none text-[#FF8B33]" strokeWidth={3} />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-12 lg:mt-auto lg:pt-12">
              <Link href="/apply" className="wb-pill wb-pill-light w-full">
                Get started →
              </Link>
            </div>
          </div>
        </div>

        <div className="p-8 lg:p-10">
          <div className="grid gap-x-8 gap-y-8 sm:grid-cols-3">
            {freeGroups.map((group) => (
              <div key={group.label}>
                <p className={`border-b-2 pb-3 text-[13px] font-bold text-gray-900 ${group.accent}`}>
                  {group.label}
                </p>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-[13.5px] leading-snug text-gray-600"
                    >
                      <Check className="mt-0.5 h-4 w-4 flex-none text-[#0B57D8]" strokeWidth={3} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-8 border-t border-gray-100 pt-5 text-[13px] leading-relaxed text-gray-500">
            Funded by built-in payment processing: {RATES_SHORT}. No monthly fees, no minimums,
            no charge on failed payments. Cash and check invoices are free too.
          </p>
        </div>
      </div>

      {/* ── Add-ons ── */}
      <div className="mt-14">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-[2rem] leading-[1.05] sm:text-[2.6rem]">
              Add-ons, <span className="text-[#F86A0A]">only if you want them.</span>
            </h3>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-gray-600">
              Each add-on is one flat price per company, not per user. Turn one on when the
              business is ready for it, and turn it off when it isn&apos;t.
            </p>
          </div>
          <div
            className="inline-flex self-start rounded-lg bg-[#EDF0F5] p-1 shadow-[inset_0_1px_2px_rgba(10,20,40,0.08)] sm:self-auto"
            role="group"
            aria-label="Billing period"
          >
            {(["monthly", "annual"] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setBilling(period)}
                className={`rounded-md px-4 py-2 text-[14px] font-bold transition-colors ${
                  billing === period ? "bg-[#0A1428] text-white shadow-[0_1px_2px_rgba(10,20,40,0.3)]" : "text-gray-600 hover:text-[#0A1428]"
                }`}
              >
                {period === "monthly" ? "Monthly" : `Annual · ${12 - ANNUAL_MONTHS} months free`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {/* Voice (id DISPATCH) */}
          <div className={`flex flex-col ${CARD} p-7`}>
            <h4 className="text-[22px] font-black text-[#0A1428]">{dispatch.name}</h4>
            <p className="mt-2 text-[14px] leading-snug text-gray-600">{dispatch.tagline}</p>
            <div className="text-gray-900">
              <PriceLine monthlyCents={dispatch.monthlyCents} annual={annual} />
            </div>
            <ul className="mt-6 flex flex-col gap-2.5 text-[13.5px] leading-snug text-gray-600">
              {dispatch.includes.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-[#0B57D8]" strokeWidth={3} />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-gray-100 pt-4 text-[12.5px] leading-relaxed text-gray-500">
              Plus {formatCents(DISPATCH_SETUP_CENTS)} once to buy the number and register it with
              the carriers. Unlimited means normal business use: up to {FAIR_USE_TEXTS_LABEL} texts
              and {FAIR_USE_MINUTES_LABEL} minutes a month; past that the line pauses until the
              1st (incoming keeps working).
            </p>
          </div>

          {/* Pro (id SHOP) */}
          <div className={`flex flex-col ${CARD} p-7 ring-2 ring-[#0B57D8]`}>
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-[22px] font-black text-[#0A1428]">{shop.name}</h4>
              <span className="rounded-md bg-[#0B57D8] px-2 py-1 text-[11.5px] font-black text-white">Unlimited users</span>
            </div>
            <p className="mt-2 text-[14px] leading-snug text-gray-600">{shop.tagline}</p>
            <div className="text-gray-900">
              <PriceLine monthlyCents={shop.monthlyCents} annual={annual} />
            </div>
            <ul className="mt-6 flex flex-col gap-2.5 text-[13.5px] leading-snug text-gray-600">
              {shop.includes.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-[#0B57D8]" strokeWidth={3} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Gallery (id JOBSITE) — coming soon */}
          <div className={`flex flex-col ${CARD} p-7`}>
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-[22px] font-black text-[#0A1428]">{jobsite.name}</h4>
              <span className="rounded-md bg-[#FFF1E6] px-2 py-1 text-[11.5px] font-black text-[#C2410C]">Coming soon</span>
            </div>
            <p className="mt-2 text-[14px] leading-snug text-gray-600">{jobsite.tagline}</p>
            <div className="text-gray-900">
              <PriceLine monthlyCents={jobsite.monthlyCents} annual={annual} />
            </div>
            <ul className="mt-6 flex flex-col gap-2.5 text-[13.5px] leading-snug text-gray-600">
              {jobsite.includes.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-gray-400" strokeWidth={3} />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-gray-100 pt-4 text-[12.5px] leading-relaxed text-gray-500">
              In the works now. The price above is what it will be when it ships.
            </p>
          </div>

          {/* Max (FULL_SHOP) */}
          <div className="relative flex flex-col overflow-hidden rounded-xl bg-[#0A1428] p-7 text-white shadow-[0_2px_0_rgba(10,20,40,0.15),0_18px_34px_-22px_rgba(10,20,40,0.6)]">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-[22px] font-black text-white">{FULL_SHOP.name}</h4>
              {saveNow > 0 && (
                <span className="rounded-md bg-[#F86A0A] px-2 py-1 text-[11.5px] font-black text-white">
                  Save {formatCents(saveNow)}/mo
                </span>
              )}
            </div>
            <p className="mt-2 text-[14px] leading-snug text-blue-100/80">{FULL_SHOP.tagline}</p>
            <div className="text-white">
              <PriceLine monthlyCents={FULL_SHOP.monthlyCents} annual={annual} />
            </div>
            <ul className="mt-6 flex flex-col gap-2.5 text-[13.5px] leading-snug text-white">
              {[
                `Everything in ${dispatch.name}`,
                `Everything in ${shop.name}, unlimited users included`,
                `${jobsite.name} joins at no extra charge when it ships`,
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Sparkles className="mt-0.5 h-4 w-4 flex-none text-[#FF8B33]" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-white/10 pt-4 text-[12.5px] leading-relaxed text-blue-100/80">
              {formatCents(FULL_SHOP.monthlyCentsAfterJobsite)} a month once {jobsite.name} ships.
              Start before then and you keep {formatCents(FULL_SHOP.monthlyCents)}. The{" "}
              {formatCents(DISPATCH_SETUP_CENTS)} number setup still applies.
            </p>
          </div>
        </div>

        <p className="mt-6 text-[13px] leading-relaxed text-gray-500">
          Extra users are {formatCents(EXTRA_SEAT_CENTS)} per user a month on {FREE_PLAN_NAME},{" "}
          {dispatch.name}, and {jobsite.name}. {shop.name} and {FULL_SHOP.name} include unlimited
          users. Add-ons are switched on from Settings once your account is open, or call us and
          we&apos;ll set them up with you.
        </p>
      </div>
    </div>
  );
}
