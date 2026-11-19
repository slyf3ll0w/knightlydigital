"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, FileText, Smartphone } from "lucide-react";
import DocGenerator from "@/components/wb/tools/DocGenerator";
import type { ToolDoc } from "@/lib/tool-doc";

/**
 * "Try the real thing" (David 2026-11-18, option 2): REAL pieces of
 * WorkBench for the made-up demo company Brightwire Electric.
 *   1. Make a quote: the app's own New Quote screen through the free tool
 *      (components/wb/tools/DocGenerator). It works for real: the visitor's
 *      own business, a PDF, and Send emails it to their client.
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

const ALL_TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  {
    id: "quote",
    label: "Make a quote",
    icon: FileText,
  },
  {
    id: "book",
    label: "Book like a customer",
    icon: CalendarDays,
  },
  {
    id: "portal",
    label: "What your client sees",
    icon: Smartphone,
  },
];
const TABS = ALL_TABS.filter((t) => SHOW_PORTAL || t.id !== "portal");

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

  // The dark thumb slides under the picked tab (measured, so labels can change).
  const btns = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = btns.current[tab];
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tab]);

  return (
    <div>
      <div role="tablist" aria-label="Try WorkBench" className="wb-seg flex w-full sm:inline-flex sm:w-auto">
        {thumb && <span className="wb-seg-thumb" style={{ left: thumb.left, width: thumb.width }} aria-hidden />}
        {TABS.map(({ id, label, icon: Icon }) => {
          const on = id === tab;
          return (
            <button
              key={id}
              ref={(el) => {
                btns.current[id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pick(id)}
              className={`wb-seg-btn flex-1 justify-center whitespace-nowrap sm:flex-none ${on && !thumb ? "bg-[#0A1428]" : ""}`}
            >
              <Icon className={`h-4 w-4 max-[400px]:hidden transition-colors duration-300 ${on ? "text-[#FF8B33]" : "text-[#0B57D8]"}`} strokeWidth={2.25} />
              {label}
            </button>
          );
        })}
      </div>

      <div className="wb-window mt-6">
        {/* 1. the quote builder, built from the app's quote screen parts */}
        <div data-tool-scroll className={tab === "quote" ? "block bg-[#F4F5F8]" : "hidden"}>
          <DocGenerator initial={initialQuote} storageKey="wb-try-quote" />
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
