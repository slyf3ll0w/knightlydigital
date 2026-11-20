"use client";

import Image from "next/image";
import { Check, Eye, FileSignature, Send, Wallet } from "lucide-react";
import WBAppFrame from "./WBAppFrame";
import { Burst, Card, Chip, FONT, NAVY, PageHead, Phone, Signature, Stamp, Toggle, firstName, usd, useDemoLoop, useRoll } from "./kit";

/**
 * A quote with optional items. LEFT: the client's quote page on their phone
 * — they switch on an optional item (the total rolls up), sign, and approve
 * with the deposit (APPROVED stamps down). RIGHT: the same quote in the
 * app's Quotes screen flips to Approved with "Deposit paid". Phones show only
 * the client's side. Rests on approved under reduced motion.
 */

export type QuoteLine = { name: string; qty: number; unit: number };
export type QuoteOption = { name: string; unit: number };

const DEFAULTS = {
  client: "Grace Kim",
  title: "Ceiling fan install",
  lines: [
    { name: "Ceiling fan install", qty: 2, unit: 190 },
    { name: "Wiring + new fan-rated box", qty: 1, unit: 140 },
  ] as QuoteLine[],
  options: [
    { name: "Smart wall switch", unit: 85 },
    { name: "Third fan, patio", unit: 210 },
  ] as QuoteOption[],
};

export default function WBDemoQuoteOptions({
  client = DEFAULTS.client,
  title = DEFAULTS.title,
  lines = DEFAULTS.lines,
  options = DEFAULTS.options,
  pick = 0,
  depositPct = 25,
}: {
  client?: string;
  title?: string;
  lines?: QuoteLine[];
  options?: QuoteOption[];
  /** index into `options` of the one the client turns on */
  pick?: number;
  depositPct?: number;
} = {}) {
  // 1 tap the option · 2 signature · 3 approve (stamp) · 4 app side flips
  const { ref, b } = useDemoLoop([1100, 2700, 4100, 4900], 10500);
  const base = lines.reduce((a, l) => a + l.qty * l.unit, 0);
  const picked = b >= 1;
  const total = base + (picked ? options[pick]?.unit ?? 0 : 0);
  const deposit = Math.round(total * depositPct) / 100;
  const shown = useRoll(total);
  const approved = b >= 3;

  return (
    <div ref={ref} className="flex items-start justify-center gap-8" aria-hidden>
      {/* the client's phone */}
      <Phone width={290} height={600}>
        <div className="relative h-full overflow-hidden px-4 pb-3 text-left" style={FONT}>
          <div className="flex items-center gap-2 border-b border-[#EEF0F3] pb-2.5">
            <Image src="/wb/brightwire-logo.png" alt="" width={142} height={44} className="h-[22px] w-auto" />
          </div>
          <p className="mt-2.5 text-[10.5px] text-gray-500">Quote #1051 · for {client}</p>
          <p className="text-[17px] font-semibold leading-tight text-gray-900">{title}</p>

          <div className="mt-3 divide-y divide-[#EEF0F3] rounded-xl border border-[#E3E6EC]">
            {lines.map((l) => (
              <div key={l.name} className="flex items-start justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold text-gray-900">{l.name}</span>
                  <span className="block text-[10px] text-gray-500">
                    {l.qty} × {usd(l.unit)}
                  </span>
                </span>
                <span className="text-[11.5px] font-semibold tabular-nums text-gray-900">{usd(l.qty * l.unit)}</span>
              </div>
            ))}
          </div>

          <p className="mt-2.5 text-[10.5px] font-semibold text-gray-700">Add to your job</p>
          <div className="mt-1.5 space-y-1.5">
            {options.map((o, k) => {
              const on = picked && k === pick;
              return (
                <div key={o.name} className={`relative flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors duration-300 ${on ? "border-[#9FD8B2] bg-[#F1FAF4]" : "border-[#E3E6EC] bg-white"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-semibold text-gray-900">{o.name}</span>
                    <span className="block text-[10px] text-gray-500">+{usd(o.unit)}</span>
                  </span>
                  <span className="relative">
                    <Toggle on={on} />
                    {k === pick && b === 1 && <span className="wb-demo-tap left-1/2 top-1/2" />}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[12px] font-semibold text-gray-900">Total</span>
            <span className="text-[18px] font-semibold tabular-nums text-gray-900">{usd(shown)}</span>
          </div>
          <p className="text-right text-[10px] text-[#0B57D8]">
            Deposit today {depositPct}% · {usd(deposit)}
          </p>

          <div className="mt-2 rounded-xl border border-[#E3E6EC] px-3 pt-1.5">
            <p className="text-[9.5px] font-semibold text-gray-400">Sign to approve</p>
            <Signature on={b >= 2} className="h-[40px] w-full" />
          </div>
          <span
            className={`mt-2 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[12px] font-semibold text-white transition-[transform,background-color] duration-300 ${b === 3 ? "scale-[0.97]" : ""}`}
            style={{ background: approved ? "#17A34A" : NAVY }}
          >
            {approved ? (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={3} /> Approved · deposit paid
              </>
            ) : (
              <>Approve &amp; pay {usd(deposit)}</>
            )}
          </span>
          {approved && <Stamp text="APPROVED" size={24} className="left-1/2 top-[73%] -translate-x-1/2" />}
        </div>
      </Phone>

      {/* the app: the same quote */}
      <div className="min-w-0 flex-1 max-sm:hidden">
        <WBAppFrame nav="Quotes" height={556} sidebarFrom="xl">
          <QuoteInApp client={client} title={title} lines={lines} options={options} pick={pick} b={b} depositPct={depositPct} />
        </WBAppFrame>
      </div>
    </div>
  );
}

function QuoteInApp({ client, title, lines, options, pick, b, depositPct }: { client: string; title: string; lines: QuoteLine[]; options: QuoteOption[]; pick: number; b: number; depositPct: number }) {
  const done = b >= 4;
  const first = firstName(client);
  const total = lines.reduce((a, l) => a + l.qty * l.unit, 0) + (done ? options[pick]?.unit ?? 0 : 0);
  const shown = useRoll(total);
  const deposit = Math.round((base(lines) + (options[pick]?.unit ?? 0)) * depositPct) / 100;
  const activity: { icon: typeof Send; text: string; when: string; on: boolean; green?: boolean }[] = [
    { icon: Send, text: `Sent to ${first} by text and email`, when: "Oct 26, 9:12 AM", on: true },
    { icon: Eye, text: `Viewed by ${first}`, when: "Oct 26, 7:38 PM", on: true },
    { icon: FileSignature, text: `Signed by ${first}`, when: "Just now", on: done, green: true },
    { icon: Wallet, text: `Deposit paid ${usd(deposit)}`, when: "Card · just now", on: done, green: true },
  ];
  return (
    <div className="relative">
      <PageHead sub={`${client} · Quote #1051`} title={title} right={done ? <Chip tone="green">Approved</Chip> : <Chip tone="blue">Sent · Viewed</Chip>} />
      <Card className="mt-3">
        <div className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-[#EEF0F3] px-4 py-2 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-gray-400">
          <span>Product / Service</span>
          <span>Total</span>
        </div>
        {lines.map((l) => (
          <div key={l.name} className="grid grid-cols-[1fr_auto] items-center gap-x-4 border-b border-[#EEF0F3] px-4 py-2 text-[11.5px]">
            <span className="truncate font-semibold text-gray-900">
              {l.name} <span className="font-normal text-gray-500">· {l.qty} × {usd(l.unit)}</span>
            </span>
            <span className="font-semibold tabular-nums text-gray-900">{usd(l.qty * l.unit)}</span>
          </div>
        ))}
        {options.map((o, k) => {
          const added = done && k === pick;
          return (
            <div key={o.name} className={`grid grid-cols-[1fr_auto] items-center gap-x-4 border-b border-[#EEF0F3] px-4 py-2 text-[11.5px] transition-colors duration-500 ${added ? "bg-[#F1FAF4]" : ""}`}>
              <span className="flex min-w-0 items-center gap-2">
                <span className={`truncate ${added ? "font-semibold text-gray-900" : "text-gray-500"}`}>{o.name}</span>
                {added ? <Chip tone="green">Added by {first}</Chip> : <Chip tone="gray">Optional</Chip>}
              </span>
              <span className={`tabular-nums ${added ? "font-semibold text-gray-900" : "text-gray-400"}`}>{usd(o.unit)}</span>
            </div>
          );
        })}
        <div className="flex items-center justify-between bg-[#F8F9FB] px-4 py-2.5">
          <span className="text-[10.5px] font-semibold text-[#0B57D8]">Deposit {depositPct}% on approval</span>
          <span className="text-[14px] font-semibold tabular-nums text-gray-900">Total {usd(shown)}</span>
        </div>
      </Card>
      <Card className="relative mt-3 px-4 py-2">
        {activity.map((a) => {
          const Icon = a.icon;
          return (
            <div key={a.text} className={`flex items-center gap-2.5 py-1.5 transition-opacity duration-500 ${a.on ? "opacity-100" : "opacity-30"}`}>
              <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full transition-colors duration-500 ${a.on && a.green ? "bg-[#17A34A] text-white" : a.on ? "bg-[#1D2E52] text-white" : "bg-[#ECEEF2] text-gray-400"}`}>
                <Icon className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-gray-900">{a.text}</span>
              <span className="flex-none text-[10px] text-gray-500">{a.on ? a.when : ""}</span>
            </div>
          );
        })}
        {done && <Burst className="right-10 top-6" />}
      </Card>
    </div>
  );
}

const base = (lines: QuoteLine[]) => lines.reduce((a, l) => a + l.qty * l.unit, 0);
