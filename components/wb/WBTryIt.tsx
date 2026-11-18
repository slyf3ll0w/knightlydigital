"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, FileText, RotateCcw, Smartphone } from "lucide-react";
import QuoteEditor from "@/app/platform/quotes/[id]/QuoteEditor";
import type { PickerWorkItem } from "@/components/WorkItemPicker";
import { dsBrandVars } from "@/lib/ds-theme";

/**
 * "Try the real thing" (David 2026-11-18, option 2): REAL pieces of
 * WorkBench for the made-up demo company Brightwire Electric.
 *   1. Make a quote: the app's own quote screen (QuoteEditor, its `demo`
 *      mode: Save hands the quote back here instead of the API), with
 *      Brightwire's electrical price book, colors and a client.
 *   2. Book like a customer: Brightwire's real online booking form
 *      (/embed/brightwire-electric/…), the frame customers put on their sites.
 *   3. What your client sees: the demo client's real portal (/hub/<token>).
 *      HIDDEN (SHOW_PORTAL) until the client-facing redesign (David
 *      2026-11-18: "add the client portal back when we expand the redesign
 *      to client facing elements"). The demo company still keeps the client,
 *      quote and invoice for it (lib/demo-company.ts).
 * The demo company is created and reset hourly by the app and never sends
 * anything. Frames load only once their tab is opened.
 */

/** Turn the portal tab back on with the client-facing redesign. */
const SHOW_PORTAL = false;

type Tab = "quote" | "book" | "portal";

const ALL_TABS: { id: Tab; label: string; icon: typeof FileText; title: string; body: string }[] = [
  {
    id: "quote",
    label: "Make a quote",
    icon: FileText,
    title: "This is the quote screen in WorkBench.",
    body: "Pick services from Brightwire's price book, change a price, add a deposit, then save it.",
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
const TABS = ALL_TABS.filter((t) => SHOW_PORTAL || t.id !== "portal");

type Contact = { id: string; firstName: string; lastName: string; addresses?: [] };

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

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function WBTryIt({
  contacts,
  workItems,
  taxRatePercent,
  brand,
  bookingPath,
  hubPath,
}: {
  contacts: Contact[];
  workItems: PickerWorkItem[];
  taxRatePercent: string;
  brand: { primary: string; secondary: string };
  bookingPath: string;
  hubPath: string;
}) {
  const [tab, setTab] = useState<Tab>("quote");
  const [opened, setOpened] = useState<Set<Tab>>(new Set(["quote"]));
  const [saved, setSaved] = useState<{ title: string; total: number; deposit: number; lines: number } | null>(null);
  const [round, setRound] = useState(0);
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

        {/* 1. the app's own quote screen, in the app's look and Brightwire's colors */}
        <div className={tab === "quote" ? "block" : "hidden"}>
          <div
            className="app-ui ds relative max-h-[820px] overflow-y-auto bg-[#F4F5F8]"
            style={
              {
                ...dsBrandVars(brand.primary, brand.secondary),
                // the app recolors its green utilities to the company accent (.app-ui bridge, globals.css)
                "--wb-accent-light": brand.primary,
                "--wb-accent-strong-light": brand.primary,
                "--wb-accent-bright-light": brand.primary,
                "--wb-ink-light": brand.primary,
                "--wb-ink-strong-light": brand.primary,
                "--wb-primary-l": brand.primary,
              } as React.CSSProperties
            }
          >
            {saved ? (
              <div className="mx-auto max-w-xl px-6 py-16 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" strokeWidth={2} />
                <p className="mt-4 text-[22px] font-semibold text-gray-900">Quote ready to send</p>
                <p className="mt-2 text-[15px] text-gray-600">
                  {saved.title} · {saved.lines} item{saved.lines === 1 ? "" : "s"} · <span className="font-semibold text-gray-900">{money(saved.total)}</span>
                  {saved.deposit > 0 && <> · {money(saved.deposit)} deposit</>}
                </p>
                <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-gray-600">
                  In your own account, saving it gives you a link to send Maria. She approves and signs on her phone
                  {saved.deposit > 0 ? ", pays the deposit," : ""} and it turns into a job.
                </p>
                <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                  <Link href="/apply" className="wb-pill wb-pill-orange">
                    Get started free
                    <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setSaved(null);
                      setRound((n) => n + 1);
                    }}
                    className="wb-pill wb-pill-outline"
                  >
                    <RotateCcw className="h-4 w-4" strokeWidth={2.25} />
                    Make another
                  </button>
                </div>
              </div>
            ) : (
              <QuoteEditor
                key={round}
                contacts={contacts}
                workItems={workItems}
                prefilledContactId={contacts[0]?.id ?? ""}
                defaultTaxRatePercent={taxRatePercent}
                demo={{ onSave: setSaved }}
              />
            )}
          </div>
        </div>

        {opened.has("book") && (
          <div className={tab === "book" ? "block bg-white p-3 sm:p-5" : "hidden"}>
            <div className="mx-auto max-w-3xl">
              <AutoFrame src={bookingPath} title="Brightwire Electric's online booking form (demo)" />
            </div>
          </div>
        )}

        {SHOW_PORTAL && opened.has("portal") && (
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
