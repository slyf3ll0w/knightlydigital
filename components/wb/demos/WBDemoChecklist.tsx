"use client";

import { Check, ChevronLeft, Inbox, MapPin } from "lucide-react";
import { Burst, Chip, FONT, NAVY, Phone, Tick, Toast, firstName, useDemoLoop } from "./kit";

/**
 * A job checklist on the tech's phone (items tick, a reading fills in,
 * Complete), then the client's emailed visit report: the new email lands in
 * their inbox and opens on the checked items and the next visit. Phones
 * show only the tech's side. Rests on the opened report under reduced
 * motion.
 */

export type ChecklistItem = { label: string; value?: string };

const DEFAULTS = {
  client: "Olivia Park",
  title: "Panel inspection",
  items: [
    { label: "Panel cover off, breakers checked" },
    { label: "Lugs torqued" },
    { label: "Voltage at the panel", value: "240 V" },
    { label: "GFCI outlets tested" },
    { label: "Smoke detectors tested" },
  ] as ChecklistItem[],
  next: "Dec 12",
};

export default function WBDemoChecklist({
  client = DEFAULTS.client,
  title = DEFAULTS.title,
  items = DEFAULTS.items,
  next = DEFAULTS.next,
  date = "Thu, Oct 29",
}: {
  client?: string;
  title?: string;
  items?: ChecklistItem[];
  next?: string;
  date?: string;
} = {}) {
  const list = items.slice(0, 7);
  const n = list.length;
  const ticks = list.map((_, k) => 800 + k * 650);
  const t = 800 + n * 650;
  // 1..n tick · press Complete · completed · email lands · email opens
  const { ref, b } = useDemoLoop([...ticks, t + 300, t + 700, t + 1500, t + 2400], t + 6200);
  const ticked = Math.min(n, b);
  const pressing = b === n + 1;
  const complete = b >= n + 2;
  const landed = b >= n + 3;
  const opened = b >= n + 4;
  const first = firstName(client);

  return (
    <div ref={ref} className="flex items-start justify-center gap-8" aria-hidden>
      <Phone width={290} height={540} screen="bg-[#F4F5F8]">
        <div className="relative flex h-full flex-col text-left" style={FONT}>
          <div className="flex items-center gap-1 px-3 pb-1 text-[12px] font-semibold text-[#0B57D8]">
            <ChevronLeft className="h-4 w-4" /> Jobs
          </div>
          <div className="px-4 pb-3">
            <p className="text-[10.5px] text-gray-500">
              {client} · {date} · 9:00a
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[18px] font-semibold text-gray-900">{title}</p>
              {complete ? <Chip tone="green">Complete</Chip> : <Chip tone="blue">In progress</Chip>}
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-500">
              <MapPin className="h-3 w-3" /> 56 Lakeview Dr
            </p>
          </div>
          <div className="mx-3 overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.06)]">
            <div className="flex items-center justify-between border-b border-[#EEF0F3] px-3.5 py-2.5">
              <span className="text-[12px] font-semibold text-gray-900">Checklist</span>
              <span className="text-[10.5px] tabular-nums text-gray-500">
                {ticked} of {n}
              </span>
            </div>
            {list.map((it, k) => {
              const on = k < ticked;
              return (
                <div key={it.label} className="flex min-h-[42px] items-center gap-2.5 border-b border-[#EEF0F3] px-3.5 py-2 last:border-0">
                  <Tick on={on} size={20} />
                  <span className={`min-w-0 flex-1 text-[11.5px] leading-tight transition-colors duration-300 ${on ? "text-gray-900" : "text-gray-600"}`}>{it.label}</span>
                  {it.value && (
                    <span className={`flex-none rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums ${on ? "bg-[#E8EEFB] text-[#22406E]" : "bg-[#F4F5F8] text-gray-300"}`}>
                      {on ? <span className="wb-step-in inline-block">{it.value}</span> : "—"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="relative mt-auto px-3 pb-3">
            <span
              className={`flex items-center justify-center gap-1.5 rounded-xl py-3 text-[12.5px] font-semibold text-white transition-[transform,background-color] duration-300 ${pressing ? "scale-[0.97]" : ""}`}
              style={{ background: complete ? "#17A34A" : NAVY, opacity: ticked < n && !complete ? 0.7 : 1 }}
            >
              <Check className="h-4 w-4" strokeWidth={3} /> {complete ? "Visit complete" : "Complete visit"}
            </span>
            {pressing && <span className="wb-demo-tap left-1/2 top-1/2" />}
            {complete && <Burst className="left-1/2 -top-4 -translate-x-1/2" />}
          </div>
          {complete && <Toast className="inset-x-3 bottom-[70px]">Visit report emailed to {first}</Toast>}
        </div>
      </Phone>

      {/* the client's inbox */}
      <div className="relative h-[540px] min-w-0 max-w-[520px] flex-1 overflow-hidden rounded-xl bg-white text-left shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-30px_rgba(10,20,40,0.5)] max-sm:hidden" style={FONT}>
        <div className="flex h-[44px] items-center gap-2 border-b border-[#E4E7ED] bg-[#F8F9FB] px-4 text-[11.5px] font-semibold text-gray-700">
          <Inbox className="h-3.5 w-3.5" /> Inbox
          <span className="ml-auto text-[10.5px] font-normal text-gray-400">{first.toLowerCase()}@mail.com</span>
        </div>
        {!opened ? (
          <div>
            {landed && <MailRow key="new" unread from="Brightwire Electric" subject={`Your visit report · ${title}`} when="Now" className="wb-row-in" />}
            <MailRow from="Brightwire Electric" subject="Reminder: your visit is tomorrow at 9:00a" when="Oct 28" />
            <MailRow from="Brightwire Electric" subject="Invoice #2462 paid. Thank you!" when="Sep 30" />
            <MailRow from="Neighborhood News" subject="Fall cleanup day is Saturday" when="Sep 27" />
          </div>
        ) : (
          <div key="open" className="wb-step-in p-4">
            <p className="text-[14px] font-semibold text-gray-900">Your visit report · {title}</p>
            <p className="mt-0.5 text-[10.5px] text-gray-500">Brightwire Electric · to {client}</p>
            <div className="mt-3 overflow-hidden rounded-xl border border-[#E3E6EC]">
              <div className="px-4 py-3 text-white" style={{ background: NAVY }}>
                <p className="text-[13px] font-semibold">Brightwire Electric</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[16px] font-semibold text-gray-900">Visit report</p>
                <p className="text-[10.5px] text-gray-500">
                  {title} · {date} · Sam
                </p>
                <div className="mt-2.5 divide-y divide-[#EEF0F3] border-y border-[#EEF0F3]">
                  {list.map((it) => (
                    <div key={it.label} className="flex items-center gap-2 py-1.5 text-[11px]">
                      <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[#17A34A] text-white">
                        <Check className="h-2.5 w-2.5" strokeWidth={3.4} />
                      </span>
                      <span className="min-w-0 flex-1 text-gray-800">{it.label}</span>
                      {it.value && <span className="font-semibold tabular-nums text-gray-900">{it.value}</span>}
                    </div>
                  ))}
                </div>
                {next && (
                  <p className="mt-3 flex items-center justify-between rounded-lg bg-[#F4F5F8] px-3 py-2 text-[11.5px]">
                    <span className="text-gray-600">Next visit</span>
                    <span className="font-semibold text-gray-900">{next}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MailRow({ from, subject, when, unread, className = "" }: { from: string; subject: string; when: string; unread?: boolean; className?: string }) {
  return (
    <div className={`flex items-start gap-2.5 border-b border-[#EEF0F3] px-4 py-3 ${unread ? "bg-[#F5F8FF]" : ""} ${className}`}>
      <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${unread ? "bg-[#0B57D8]" : "bg-transparent"}`} />
      <span className="min-w-0 flex-1">
        <span className="flex justify-between gap-2">
          <span className={`truncate text-[11.5px] ${unread ? "font-semibold text-gray-900" : "text-gray-700"}`}>{from}</span>
          <span className="flex-none text-[10px] text-gray-400">{when}</span>
        </span>
        <span className={`block truncate text-[11px] ${unread ? "font-semibold text-gray-800" : "text-gray-500"}`}>{subject}</span>
      </span>
    </div>
  );
}
