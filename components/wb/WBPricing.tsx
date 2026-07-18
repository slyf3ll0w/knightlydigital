"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

/**
 * The WorkBench pricing card. The billing toggle is the joke: Annual is
 * "Free", Monthly is "Still free" — that's the whole pricing model.
 */

const featureGroups: { label: string; items: string[] }[] = [
  {
    label: "Run the work",
    items: [
      "Client database & history",
      "Online booking & self-scheduling",
      "Drag-to-schedule calendar",
      "Job pipeline with photos",
      "Lead pipeline board",
    ],
  },
  {
    label: "Get paid",
    items: [
      "Quotes with e-signature",
      "One-click invoicing",
      "Card & ACH payments",
      "Deposits & payment reminders",
      "Recurring billing",
    ],
  },
  {
    label: "Grow & manage",
    items: [
      "Branded client portal",
      "Contracts & e-signatures",
      "Team chat & mobile push",
      "Unlimited users & team roles",
      "Atlas AI assistant",
    ],
  },
];

export default function WBPricing() {
  const [billing, setBilling] = useState<"annual" | "monthly">("annual");
  const annual = billing === "annual";

  return (
    <div className="grid overflow-hidden rounded-3xl border border-gray-200 bg-white lg:grid-cols-[340px_1fr]">
      {/* ── Price panel ── */}
      <div className="relative flex flex-col bg-gradient-to-br from-[#0050D4] to-[#003FA5] p-8 lg:p-10">
        <div className="wb-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex h-full flex-col">
          <p className="text-[13px] font-bold uppercase tracking-wide text-blue-200">
            One plan
          </p>

          {/* Billing toggle */}
          <div
            className="mt-5 inline-flex self-start rounded-full border border-white/20 bg-white/10 p-1"
            role="group"
            aria-label="Billing period"
          >
            {(["annual", "monthly"] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setBilling(period)}
                className={`rounded-full px-4 py-1.5 text-[12.5px] font-bold transition-colors ${
                  billing === period
                    ? "bg-white text-[#0B57D8]"
                    : "text-blue-100/70 hover:text-white"
                }`}
              >
                {period === "annual" ? "Annual" : "Monthly"}
              </button>
            ))}
          </div>

          {/* Price */}
          <p className={`mt-7 font-extrabold leading-none text-white ${annual ? "text-6xl" : "text-5xl"}`} style={{ fontFamily: '"Nunito", sans-serif' }}>
            {annual ? "Free" : "Still free"}
          </p>
          <p className="mt-4 text-[14px] leading-relaxed text-blue-100/80">
            {annual
              ? "$0 per year — every feature, unlimited users."
              : "$0 per month. Same everything — the monthly plan just bills you nothing more often."}
          </p>

          <ul className="mt-7 flex flex-col gap-3">
            {[
              "No credit card required",
              "No trial clock",
              "No paid tier to upgrade into",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-[14px] text-white">
                <Check className="h-4 w-4 flex-none text-[#FF8B33]" strokeWidth={3} />
                {item}
              </li>
            ))}
          </ul>

          <Link
            href="/apply"
            className="mt-8 inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-[14.5px] font-bold text-[#0B57D8] transition-colors hover:bg-blue-50 lg:mt-auto"
          >
            Apply for access →
          </Link>
        </div>
      </div>

      {/* ── Feature list ── */}
      <div className="p-8 lg:p-10">
        <div className="grid gap-x-8 gap-y-8 sm:grid-cols-3">
          {featureGroups.map((group) => (
            <div key={group.label}>
              <p className="border-b border-gray-200 pb-3 text-[13px] font-bold text-gray-900">
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
      </div>
    </div>
  );
}
