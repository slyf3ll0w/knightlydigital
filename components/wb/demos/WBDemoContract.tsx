"use client";

import Image from "next/image";
import { Check, Eye, FileSignature, Mail, Send, Wallet } from "lucide-react";
import { Burst, FONT, NAVY, Signature, Stamp, Toast, firstName, usd, useDemoLoop } from "./kit";

/**
 * Agreements (Pro): the contract on the business's letterhead, the client's
 * signature drawing itself, SIGNED stamping down, "Signed copy emailed to
 * {first}", then the deposit landing. Beside it on desktop, the agreement's
 * status in the app ticking through Sent → Viewed → Signed → Deposit paid.
 * Rests signed and paid under reduced motion.
 */

const DEFAULTS = {
  client: "Derek Olsen",
  title: "Service panel upgrade agreement",
  clauses: [
    "Replace the 100 A panel with a 200 A panel and main breaker.",
    "Permit and city inspection handled by Brightwire Electric.",
    "Power off for up to 6 hours on the install day.",
    "Balance due when the job passes inspection.",
    "Workmanship guaranteed for one year.",
  ],
  total: 3850,
};

export default function WBDemoContract({
  client = DEFAULTS.client,
  title = DEFAULTS.title,
  clauses = DEFAULTS.clauses,
  total = DEFAULTS.total,
  depositPct = 30,
}: {
  client?: string;
  title?: string;
  clauses?: string[];
  total?: number;
  depositPct?: number;
} = {}) {
  // 1 sign · 2 SIGNED · 3 copy emailed · 4 deposit paid
  const { ref, b } = useDemoLoop([1000, 2300, 3000, 4300], 9600);
  const first = firstName(client);
  const deposit = Math.round(total * depositPct) / 100;
  const steps: { icon: typeof Send; label: string; when: string; on: boolean }[] = [
    { icon: Send, label: `Sent to ${first}`, when: "Oct 26, 9:12 AM", on: true },
    { icon: Eye, label: `Viewed by ${first}`, when: "Oct 26, 6:04 PM", on: true },
    { icon: FileSignature, label: `Signed by ${first}`, when: "Just now", on: b >= 2 },
    { icon: Mail, label: "Signed copy emailed", when: `To ${first} by email`, on: b >= 3 },
    { icon: Wallet, label: `Deposit paid ${usd(deposit)}`, when: "Card · just now", on: b >= 4 },
  ];

  return (
    <div ref={ref} className="flex items-start justify-center gap-6 text-left" style={FONT} aria-hidden>
      {/* the document */}
      <div className="relative h-[500px] w-full max-w-[600px] overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-30px_rgba(10,20,40,0.5)] max-sm:h-[560px]">
        <div className="flex items-center justify-between gap-3 border-b-[3px] px-6 py-4 max-sm:px-4" style={{ borderColor: NAVY }}>
          <Image src="/wb/brightwire-logo.png" alt="" width={142} height={44} className="h-[28px] w-auto" />
          <span className="text-right text-[9.5px] leading-tight text-gray-500">
            Agreement #A-207
            <br />
            Oct 26
          </span>
        </div>
        <div className="px-6 pt-4 max-sm:px-4">
          <p className="text-[18px] font-semibold leading-tight text-gray-900">{title}</p>
          <p className="mt-0.5 text-[11px] text-gray-500">Prepared for {client}</p>
          <ol className="mt-3 space-y-1.5">
            {clauses.slice(0, 6).map((c, k) => (
              <li key={k} className="flex gap-2 text-[11.5px] leading-snug text-gray-700">
                <span className="w-4 flex-none font-semibold tabular-nums text-gray-400">{k + 1}.</span>
                <span>{c}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex items-center justify-between border-y border-[#EEF0F3] py-2.5">
            <span className="text-[11.5px] text-gray-600">
              Total <span className="text-gray-400">· deposit {depositPct}% on signing</span>
            </span>
            <span className="text-[15px] font-semibold tabular-nums text-gray-900">{usd(total)}</span>
          </div>
          <div className="relative mt-3">
            <div className="max-w-[300px] max-sm:max-w-[190px]">
              <Signature on={b >= 1} className="h-[52px] w-full" />
              <p className="text-[10px] text-gray-500">
                {client} · {b >= 2 ? "signed online just now" : "client"}
              </p>
            </div>
            {b >= 2 && <Stamp text="SIGNED" size={26} className="left-[52%] top-[-2px] max-sm:left-auto max-sm:right-0 max-sm:top-[4px]" />}
          </div>
          {b >= 4 && (
            <div className="wb-row-in relative mt-3 flex items-center gap-2.5 rounded-xl border border-[#9FD8B2] bg-[#F1FAF4] px-3 py-2.5">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#17A34A] text-white">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-gray-900">Deposit paid</span>
                <span className="block text-[10px] text-gray-500">{usd(deposit)} · card</span>
              </span>
              <span className="text-[12px] font-semibold tabular-nums text-[#17703B]">{usd(deposit)}</span>
              <Burst className="right-4 -top-4" />
            </div>
          )}
        </div>
        {b === 3 && <Toast className="inset-x-0 bottom-4 mx-auto w-fit whitespace-nowrap">Signed copy emailed to {first}</Toast>}
      </div>

      {/* the agreement's status in the app */}
      <div className="w-[250px] flex-none overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-30px_rgba(10,20,40,0.5)] max-lg:hidden">
        <div className="border-b border-[#EEF0F3] px-4 py-3">
          <p className="text-[10.5px] text-gray-500">Agreements · #A-207</p>
          <p className="truncate text-[14px] font-semibold text-gray-900">{client}</p>
        </div>
        <div className="px-4 py-2">
          {steps.map((s, k) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="relative flex gap-3 py-2">
                {k < steps.length - 1 && <span className={`absolute left-[13px] top-[34px] h-[calc(100%-26px)] w-[2px] transition-colors duration-500 ${steps[k + 1].on ? (k + 1 >= 2 ? "bg-[#17A34A]" : "bg-[#1D2E52]") : "bg-[#E3E6EC]"}`} />}
                <span className={`relative flex h-7 w-7 flex-none items-center justify-center rounded-full transition-colors duration-500 ${s.on ? (k >= 2 ? "bg-[#17A34A] text-white" : "bg-[#1D2E52] text-white") : "bg-[#ECEEF2] text-gray-400"}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className={`min-w-0 transition-opacity duration-500 ${s.on ? "opacity-100" : "opacity-40"}`}>
                  <span className="block truncate text-[11.5px] font-semibold text-gray-900">{s.label}</span>
                  <span className="block text-[10px] text-gray-500">{s.on ? s.when : "Waiting"}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
