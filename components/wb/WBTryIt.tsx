"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, FileText, Smartphone } from "lucide-react";
import DocGenerator from "@/components/wb/tools/DocGenerator";
import type { ToolDoc } from "@/lib/tool-doc";

/**
 * "Try the real thing" (David 2026-11-18, option 2): three REAL pieces of
 * WorkBench, not copies, for the made-up demo company Brightwire Electric.
 *   1. Make a quote: the real quote builder from the free tools.
 *   2. Book like a customer: Brightwire's real online booking form
 *      (/embed/brightwire-electric/…), the same frame customers put on
 *      their sites.
 *   3. What your client sees: the demo client's real client portal
 *      (/hub/<token>) in a phone.
 * The demo company is created and reset hourly by the app itself and never
 * sends anything (lib/demo-company.ts). Frames are lazy: nothing loads until
 * its tab is opened.
 */

type Tab = "quote" | "book" | "portal";

const TABS: { id: Tab; label: string; icon: typeof FileText; title: string; body: string }[] = [
  {
    id: "quote",
    label: "Make a quote",
    icon: FileText,
    title: "Price a job the way you would in WorkBench.",
    body: "Change the line items, mark one optional, add a deposit. The totals, tax and PDF are the real thing.",
  },
  {
    id: "book",
    label: "Book like a customer",
    icon: CalendarDays,
    title: "This is what your customers see on your website.",
    body: "Brightwire Electric's real booking form. Pick a time like a homeowner would. It's a demo company, so nothing is sent anywhere.",
  },
  {
    id: "portal",
    label: "What your client sees",
    icon: Smartphone,
    title: "Every client gets their own portal.",
    body: "Maria's quote to approve, her invoice, and a way to message Brightwire, all from one link. Tap around; it resets every hour.",
  },
];

function AutoFrame({ src, title, minHeight = 560 }: { src: string; title: string; minHeight?: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(minHeight);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const d = e.data as { type?: string; height?: number };
      if (d?.type === "jobflow:height" && typeof d.height === "number" && d.height > 0) setH(Math.max(minHeight, Math.ceil(d.height)));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [minHeight]);
  return <iframe ref={ref} src={src} title={title} loading="lazy" className="block w-full border-0" style={{ height: h }} />;
}

export default function WBTryIt({ initialQuote, bookingPath, hubPath }: { initialQuote: ToolDoc; bookingPath: string; hubPath: string }) {
  const [tab, setTab] = useState<Tab>("quote");
  const [opened, setOpened] = useState<Set<Tab>>(new Set(["quote"]));
  const pick = (t: Tab) => {
    setTab(t);
    setOpened((s) => new Set(s).add(t));
  };
  const cur = TABS.find((t) => t.id === tab)!;

  return (
    <div>
      <div role="tablist" aria-label="Try WorkBench" className="flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => {
          const on = id === tab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pick(id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[15px] font-bold transition-colors ${
                on ? "bg-[#0A1428] text-white" : "bg-white text-gray-700 ring-1 ring-inset ring-gray-200 hover:text-gray-900 hover:ring-gray-400"
              }`}
            >
              <Icon className={`h-4 w-4 ${on ? "text-[#FF8B33]" : "text-[#0B57D8]"}`} strokeWidth={2.25} />
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_30px_70px_-34px_rgba(10,20,40,0.4)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-[#F5F7FA] px-5 py-3.5 sm:px-6">
          <div>
            <p className="text-[16px] font-extrabold text-gray-900">{cur.title}</p>
            <p className="text-[14px] text-gray-600">{cur.body}</p>
          </div>
          <span className="rounded-md bg-[#FFF4EC] px-2.5 py-1 text-[12px] font-bold text-[#C2410C] ring-1 ring-[#FBD5B5]">Live demo · Brightwire Electric</span>
        </div>

        <div className={tab === "quote" ? "block max-h-[780px] overflow-y-auto p-3 sm:p-5" : "hidden"}>
          <DocGenerator initial={initialQuote} storageKey="wb-try-quote" />
        </div>

        {opened.has("book") && (
          <div className={tab === "book" ? "block bg-white p-3 sm:p-5" : "hidden"}>
            <div className="mx-auto max-w-3xl">
              <AutoFrame src={bookingPath} title="Brightwire Electric's online booking form (demo)" />
            </div>
          </div>
        )}

        {opened.has("portal") && (
          <div className={tab === "portal" ? "flex justify-center bg-[#F5F7FA] px-3 py-8 sm:py-10" : "hidden"}>
            <div className="rounded-[2.4rem] bg-gray-900 p-[9px] shadow-[0_30px_60px_-24px_rgba(10,20,40,0.6)]">
              <div className="overflow-hidden rounded-[1.9rem] bg-white">
                <iframe src={hubPath} title="A client's portal at Brightwire Electric (demo)" loading="lazy" className="block h-[720px] w-[360px] max-w-[calc(100vw-4rem)] border-0" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
