"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { ATLAS_FREE_TOKENS, ATLAS_PLAN_TOKENS, formatPlanPrice, tokenCount } from "@/lib/atlas-pricing";
import {
  ANNUAL_MONTHS,
  DISPATCH_OVERAGE_CENTS,
  DISPATCH_SETUP_CENTS,
  EXTRA_SEAT_CENTS,
  FREE_PLAN_NAME,
  FULL_SHOP,
  INCLUDED_SEATS,
  PLANS,
  annualCents,
  formatCents,
  formatUnitCents,
  separatelyMonthlyCents,
} from "@/lib/plans";

/**
 * The WorkBench pricing grid: the free core (Core) up top — full access,
 * not a trial — then the optional add-ons (Voice, Pro, Gallery, Max) with a monthly/annual toggle. Every number comes from lib/plans.ts.
 */

const freeGroups: { label: string; accent: string; items: string[] }[] = [
  {
    label: "Run the work",
    accent: "border-[#0B57D8]",
    items: [
      "Client database & history",
      "Online booking & self-scheduling",
      "Drag-to-schedule calendar",
      "Job pipeline with notes & photos",
      "Lead pipeline board",
      "Clock in and out on the job",
    ],
  },
  {
    label: "Get paid",
    accent: "border-[#F86A0A]",
    items: [
      "Quotes with e-signature",
      "One-click invoicing",
      "Card & ACH payments",
      "Deposits & payment reminders",
      "Recurring billing & autopay",
      "One-click refunds",
    ],
  },
  {
    label: "Grow & manage",
    accent: "border-[#0B57D8]",
    items: [
      "Branded client portal",
      "Two-way client messaging",
      "Team chat & mobile push",
      "Team roles & permissions",
      "iPhone & Android apps, offline mode",
      `Atlas AI, ${tokenCount(ATLAS_FREE_TOKENS)} free tokens a month`,
    ],
  },
];

function PriceLine({ monthlyCents, annual }: { monthlyCents: number; annual: boolean }) {
  const yearly = annualCents(monthlyCents);
  return (
    <>
      <p className="mt-4 text-4xl font-extrabold leading-none" style={{ fontFamily: '"Nunito", sans-serif' }}>
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
      <div className="grid overflow-hidden rounded-[1.5rem] border border-gray-200 bg-white lg:grid-cols-[350px_1fr]">
        <div className="relative flex flex-col bg-[#0A1428] p-8 lg:p-10">
          <div className="relative flex h-full flex-col">
            <p className="wb-label wb-label-light">{FREE_PLAN_NAME} · the free plan</p>
            <p
              className="mt-6 text-6xl font-extrabold leading-none text-white"
              style={{ fontFamily: '"Nunito", sans-serif' }}
            >
              Free
            </p>
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
            Funded by built-in payment processing: 2.9% + 30¢ per card transaction, 0.75% per ACH
            bank transfer. No monthly fees, no minimums, no charge on failed payments. Cash and
            check invoices are free too.
          </p>
        </div>
      </div>

      {/* ── Add-ons ── */}
      <div className="mt-14">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="wb-label">Add-ons</p>
            <h3 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">
              Only if you want them.
            </h3>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-gray-600">
              Each add-on is one flat price per company, not per user. Turn one on when the
              business is ready for it, and turn it off when it isn&apos;t.
            </p>
          </div>
          <div
            className="inline-flex self-start rounded-full border border-gray-200 bg-white p-1 sm:self-auto"
            role="group"
            aria-label="Billing period"
          >
            {(["monthly", "annual"] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setBilling(period)}
                className={`rounded-full px-4 py-1.5 text-[12.5px] font-bold transition-colors ${
                  billing === period ? "bg-[#0B57D8] text-white" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {period === "monthly" ? "Monthly" : `Annual · ${12 - ANNUAL_MONTHS} months free`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {/* Voice (id DISPATCH) */}
          <div className="flex flex-col rounded-[1.5rem] border border-gray-200 bg-white p-7">
            <p className="wb-label">{dispatch.name}</p>
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
              the carriers. Past the allowance, {formatUnitCents(DISPATCH_OVERAGE_CENTS)} per text
              or minute.
            </p>
          </div>

          {/* Pro (id SHOP) */}
          <div className="flex flex-col rounded-[1.5rem] border-2 border-[#0B57D8] bg-white p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="wb-label">{shop.name}</p>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11.5px] font-bold text-[#0B57D8]">
                Unlimited users
              </span>
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
            <p className="mt-6 border-t border-gray-100 pt-4 text-[12.5px] leading-relaxed text-gray-500">
              Atlas Full on its own is {formatPlanPrice()} a month; Pro includes its{" "}
              {tokenCount(ATLAS_PLAN_TOKENS)} tokens.
            </p>
          </div>

          {/* Gallery (id JOBSITE) — coming soon */}
          <div className="flex flex-col rounded-[1.5rem] border border-dashed border-gray-300 bg-[#F6F8FB] p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="wb-label">{jobsite.name}</p>
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11.5px] font-bold text-[#F86A0A]">
                Coming soon
              </span>
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
            <p className="mt-6 border-t border-gray-200 pt-4 text-[12.5px] leading-relaxed text-gray-500">
              In the works now. The price above is what it will be when it ships.
            </p>
          </div>

          {/* Max (FULL_SHOP) */}
          <div className="relative flex flex-col overflow-hidden rounded-[1.5rem] bg-[#0A1428] p-7 text-white">
            <div className="flex items-center justify-between gap-3">
              <p className="wb-label wb-label-light">{FULL_SHOP.name}</p>
              {saveNow > 0 && (
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-bold text-blue-100">
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
