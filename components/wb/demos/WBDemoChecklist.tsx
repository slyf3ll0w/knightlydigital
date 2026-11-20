"use client";

import { useEffect, useRef } from "react";
import { Bell, CalendarDays, Check, CheckCircle, ChevronDown, ChevronLeft, Inbox, MapPin, MessageSquare, Mic, MoreHorizontal, Navigation, PenLine, Phone as PhoneIcon, Plus, Receipt, Settings, User } from "lucide-react";
import { HomeFill, ScheduleFill, ChatFill, MoreFill } from "@/components/TabIcons";
import { FONT, Phone, firstName, useDemoLoop } from "./kit";

/**
 * The close-out checklist on the tech's phone job page (app/platform/jobs/[id]
 * JobChecklist, phone tree), then the work report the client receives
 * (lib/email.ts jobReportEmail). The tech ticks every task, taps the docked
 * Complete job pill, the app asks "Send Olivia the work report?" (JobActions
 * offerReport), Send report, and the email lands in the client's inbox.
 * Phones show only the tech's side. Rests on the opened report under reduced
 * motion.
 *
 * Also exports the phone-app pieces the other coded phone screens share
 * (PhoneApp: the real phone tree's top bar, page canvas and tab bar, drawn at
 * the app's real 390 px width and zoomed into the frame).
 */

/** Brightwire Electric's two colors (lib/demo-company.ts) and the fixed ds tokens (app/ds.css). */
export const BW = {
  primary: "#10244A",
  soft: "rgba(16, 36, 74, 0.1)",
  secondary: "#F5B700",
  ink: "#0A1328",
  ink2: "#3A475C",
  muted: "#687589",
  faint: "#9AA4B5",
  line: "#E7EBF1",
  lineStrong: "#D6DCE5",
  canvas: "#F5F7FA",
  good: "#15803D",
  goodSoft: "rgba(21, 128, 61, 0.09)",
  warn: "#B45309",
  warnSoft: "rgba(217, 119, 6, 0.09)",
  bad: "#DC2626",
};
export const CARD_SHADOW = "0 1px 2px rgba(10, 19, 40, 0.04), 0 0 0 1px rgba(10, 19, 40, 0.06)";
/** The phone's glass controls (globals.css .glass-control, phone widths). */
export const GLASS: React.CSSProperties = {
  backgroundColor: "color-mix(in srgb, #10244A 5%, rgba(255, 255, 255, 0.58))",
  WebkitBackdropFilter: "saturate(190%) blur(28px)",
  backdropFilter: "saturate(190%) blur(28px)",
  border: "1px solid rgba(255, 255, 255, 0.6)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -1px 0 rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.06), 0 10px 30px rgba(15,23,42,0.14)",
};
/** The iOS sheet material (ConfirmSheet, .sheet-material + its rim light). */
export const SHEET: React.CSSProperties = {
  backgroundColor: "color-mix(in srgb, #10244A 5%, rgba(255, 255, 255, 0.55))",
  backgroundImage: "linear-gradient(rgba(255,255,255,0.62), rgba(255,255,255,0.62))",
  backgroundSize: "100% 1px",
  backgroundRepeat: "no-repeat",
  WebkitBackdropFilter: "saturate(190%) blur(28px)",
  backdropFilter: "saturate(190%) blur(28px)",
};

/** A ds status chip: dot + words (app/ds.css .ds-chip). */
export function DsChip({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral" | "primary"; children: React.ReactNode }) {
  const c = { good: BW.good, warn: BW.warn, bad: BW.bad, neutral: BW.faint, primary: BW.primary }[tone];
  return (
    <span className="inline-flex h-[22px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-0.5 text-[12px] font-medium" style={{ color: tone === "bad" ? BW.bad : BW.ink2 }}>
      <span className="h-[7px] w-[7px] flex-none rounded-full transition-colors duration-300" style={{ background: c, boxShadow: `0 0 0 2.5px color-mix(in srgb, ${c} 22%, transparent)` }} />
      {children}
    </span>
  );
}

/**
 * The phone app (AppShell's phone tree): content at the real 390 px width,
 * zoomed to fit the frame. `back` = the glass back pill ("‹ Jobs"), else the
 * company switcher. `children` is the page (it scrolls when `scrollRef` is
 * used); `docked` floats above the tab bar; `overlay` covers everything.
 */
export function PhoneApp({
  width = 290,
  height = 560,
  back,
  children,
  docked,
  overlay,
  scrollRef,
  className = "",
}: {
  width?: number;
  height?: number;
  back?: string;
  children: React.ReactNode;
  docked?: React.ReactNode;
  overlay?: React.ReactNode;
  scrollRef?: React.Ref<HTMLDivElement>;
  className?: string;
}) {
  const zoom = (width - 18) / 390;
  return (
    <Phone width={width} height={height} className={className} screen="bg-[#F5F7FA]">
      <div className="absolute inset-0 text-left" style={{ ...FONT, zoom, color: BW.ink }}>
        <div ref={scrollRef} className="absolute inset-0 overflow-hidden" style={{ background: BW.canvas }}>
          <div className="px-4 pb-40 pt-[70px]">{children}</div>
        </div>
        <div className="absolute inset-x-0 top-0 flex h-14 items-center px-4">
          <div className="flex flex-1 items-center">
            {back ? (
              <span className="-ml-1 flex h-10 items-center rounded-full pl-1 pr-3.5" style={{ ...GLASS, color: BW.primary }}>
                <ChevronLeft size={24} strokeWidth={2.2} className="-mr-0.5" />
                <span className="text-[15px] font-semibold">{back}</span>
              </span>
            ) : (
              <span className="-ml-0.5 flex h-10 items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold text-white ring-1 ring-black/10" style={{ background: BW.primary }}>
                  B
                </span>
                <span className="text-[16px] font-bold tracking-tight text-gray-900">Brightwire Electric</span>
                <ChevronDown size={15} strokeWidth={2.6} className="text-gray-400" />
              </span>
            )}
          </div>
          <span className="mr-2 flex h-10 w-10 items-center justify-center rounded-full" style={{ ...GLASS, color: BW.secondary }}>
            <Mic size={20} />
          </span>
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-700" style={GLASS}>
            <Bell size={20} />
          </span>
          <span className="ml-2 flex h-10 w-10 items-center justify-center rounded-full text-gray-700" style={GLASS}>
            <Settings size={20} />
          </span>
        </div>
        {docked && <div className="absolute inset-x-0 bottom-[88px] z-10 flex justify-center">{docked}</div>}
        <div className="absolute inset-x-3 bottom-2.5 z-10 flex items-stretch gap-2.5">
          <div className="flex h-[58px] min-w-0 flex-1 items-stretch rounded-full px-1.5" style={GLASS}>
            {(
              [
                [HomeFill, "Home"],
                [ScheduleFill, "Schedule"],
                [ChatFill, "Chat"],
                [MoreFill, "More"],
              ] as const
            ).map(([Icon, label]) => (
              <span key={label} className="my-1.5 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-medium" style={{ color: "color-mix(in srgb, #10244A 52%, #8a94a1)" }}>
                <Icon size={24} />
                {label}
              </span>
            ))}
          </div>
          <span className="flex h-[58px] w-[58px] flex-none items-center justify-center rounded-full text-white" style={{ ...GLASS, backgroundColor: "color-mix(in srgb, #10244A 84%, transparent)" }}>
            <Plus size={24} strokeWidth={2.5} />
          </span>
        </div>
        {overlay}
      </div>
    </Phone>
  );
}

/** The docked tinted-glass action pill above the tab bar (JobActions on phones). */
export function DockedPill({ icon: Icon, label, pressed }: { icon: typeof Check; label: string; pressed?: boolean }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-6 py-3 text-[15px] font-semibold text-white transition-transform duration-150 ${pressed ? "scale-[0.96]" : ""}`}
      style={{ backgroundColor: "color-mix(in srgb, #10244A 84%, transparent)", WebkitBackdropFilter: "saturate(160%) blur(20px)", backdropFilter: "saturate(160%) blur(20px)", boxShadow: "0 1px 2px rgba(15,23,42,0.12)" }}
    >
      <Icon size={13} />
      {label}
    </span>
  );
}

/** A ds card (app/ds.css .ds-card). */
export function DsCard({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-[20px] bg-white ${className}`} style={{ boxShadow: CARD_SHADOW, ...style }}>
      {children}
    </div>
  );
}

/** A folded section header on phones (components Fold: title + meta + chevron). */
export function FoldRow({ title, meta }: { title: string; meta: string }) {
  return (
    <DsCard className="flex items-center justify-between px-5 py-4">
      <span className="text-[14.5px] font-semibold" style={{ color: BW.ink }}>
        {title}
      </span>
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-500">
        {meta}
        <ChevronDown size={16} className="text-gray-400" />
      </span>
    </DsCard>
  );
}

export type ChecklistItem = { label: string; value?: string };

const DEFAULTS = {
  client: "Olivia Park",
  title: "Panel inspection",
  items: [
    { label: "Panel cover off, breakers checked" },
    { label: "Lugs torqued" },
    { label: "Voltage checked at the panel" },
    { label: "GFCI outlets tested" },
    { label: "Smoke detectors tested" },
  ] as ChecklistItem[],
};

export default function WBDemoChecklist({
  client = DEFAULTS.client,
  title = DEFAULTS.title,
  items = DEFAULTS.items,
  date = "Nov 3, 9:00 AM",
  tech = "Sam Rivera",
  address = "56 Lakeview Dr, Plano, TX 75074",
}: {
  client?: string;
  title?: string;
  items?: ChecklistItem[];
  /** Kept for callers; the real work report has no next-visit line, so it is not shown. */
  next?: string;
  date?: string;
  tech?: string;
  address?: string;
} = {}) {
  const list = (items.length ? items : DEFAULTS.items).slice(0, 6);
  const n = list.length;
  const ticks = list.map((_, k) => 1500 + k * 650);
  const t = 1500 + n * 650;
  // 1 scroll to the checklist · 2..n+1 tick · press Complete job · completed + the sheet · press Send report · Report sent · email lands · email opens
  const { ref, b } = useDemoLoop([700, ...ticks, t + 300, t + 650, t + 2000, t + 2350, t + 3300, t + 4200], t + 8200);
  const ticked = Math.max(0, Math.min(n, b - 1));
  const pressing = b === n + 2;
  const complete = b >= n + 3;
  const sheet = b === n + 3 || b === n + 4;
  const sending = b === n + 4;
  const sent = b === n + 5;
  const landed = b >= n + 6;
  const opened = b >= n + 7;
  const first = firstName(client);
  const email = `${first.toLowerCase()}@mail.com`;

  const scroller = useRef<HTMLDivElement>(null);
  const checklistRef = useRef<HTMLDivElement>(null);
  const scrolled = b >= 1;
  useEffect(() => {
    const el = scroller.current;
    const target = checklistRef.current;
    if (!el || !target) return;
    el.scrollTo({ top: scrolled ? Math.max(0, target.offsetTop - 70) : 0, behavior: b <= 1 ? "smooth" : "auto" });
  }, [scrolled, b]);

  const overlay =
    sheet || sent ? (
      <div className="absolute inset-0 z-20">
        <div className="absolute inset-0 bg-black/40" />
        <div key={sent ? "alert" : "prompt"} className="absolute inset-x-0 bottom-0 px-2 pb-2">
          <div className="overflow-hidden rounded-[14px]" style={SHEET}>
            <div className="px-4 pb-3.5 pt-4 text-center">
              <p className="text-[13px] font-semibold text-gray-500">{sent ? "Report sent" : `Send ${first} the work report?`}</p>
              <p className="mx-auto max-w-[34ch] text-[13px] leading-snug text-gray-500">
                {sent ? `Emailed to ${email}` : "No photos are marked for them yet, so they get the checklist and a note from you."}
              </p>
              {!sent && <span className="mt-3 block w-full rounded-[10px] border border-gray-300 bg-white px-3 py-2 text-left text-[15px] text-gray-400">A note to the client (optional)</span>}
            </div>
            <span className={`relative block w-full border-t px-4 py-[15px] text-center text-[17px] transition-colors ${sending ? "bg-black/5" : ""}`} style={{ color: BW.primary, borderColor: "rgba(60,60,67,0.29)" }}>
              {sent ? "OK" : "Send report"}
              {sending && <span className="wb-demo-tap left-1/2 top-1/2" />}
            </span>
          </div>
          {!sent && (
            <div className="mt-2 overflow-hidden rounded-[14px]" style={SHEET}>
              <span className="block w-full px-4 py-[15px] text-center text-[17px] font-semibold" style={{ color: BW.primary }}>
                Not now
              </span>
            </div>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div ref={ref} className="flex items-start justify-center gap-8" aria-hidden data-wb-demo="checklist">
      <div className="relative flex-none">
        <PhoneApp
          back="Jobs"
          scrollRef={scroller}
          overlay={overlay}
          docked={
            <span className="relative">
              {complete ? <DockedPill icon={Receipt} label="Create invoice" /> : <DockedPill icon={CheckCircle} label="Complete job" pressed={pressing} />}
              {pressing && <span className="wb-demo-tap left-1/2 top-1/2" />}
            </span>
          }
        >
          <div className="mb-4 flex items-center gap-3">{complete ? <DsChip tone="warn">Requires Invoicing</DsChip> : <DsChip tone="good">Active</DsChip>}</div>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[28px] font-[650] leading-[1.12] tracking-[-0.022em]" style={{ color: BW.ink }}>
                {title}
              </p>
              <p className="text-sm font-semibold" style={{ color: BW.primary }}>
                {client}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!complete && (
                <span className="flex h-10 items-center gap-2 rounded-[12px] bg-white px-4 text-[14.5px] font-semibold" style={{ boxShadow: `inset 0 0 0 1px ${BW.lineStrong}`, color: BW.ink }}>
                  <PenLine size={14} /> Collect signature
                </span>
              )}
              <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white" style={{ boxShadow: `inset 0 0 0 1px ${BW.lineStrong}`, color: BW.ink2 }}>
                <MoreHorizontal size={16} />
              </span>
            </div>
          </div>
          <div className="mb-5 flex justify-around">
            {(
              [
                [PhoneIcon, "Call"],
                [MessageSquare, "Text"],
                [Navigation, "Directions"],
              ] as const
            ).map(([Icon, label]) => (
              <span key={label} className="flex flex-col items-center gap-1.5 text-[12px] font-semibold" style={{ color: BW.primary }}>
                <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full" style={{ background: BW.soft }}>
                  <Icon size={22} strokeWidth={2.1} />
                </span>
                {label}
              </span>
            ))}
          </div>
          <DsCard className="mb-6 flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 text-sm">
            <div>
              <span className="block text-xs font-medium text-gray-500">Job #</span>
              <span className="text-gray-800">214</span>
            </div>
            <div className="basis-full">
              <span className="block text-xs font-medium text-gray-500">Scheduled</span>
              <span className="flex items-center gap-1.5 font-semibold" style={{ color: BW.primary }}>
                <CalendarDays size={14} /> {date}
              </span>
            </div>
          </DsCard>
          <div className="space-y-4">
            <DsCard className="p-5">
              <p className="mb-4 text-[14.5px] font-semibold">Details</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin size={15} className="mt-0.5 flex-none text-gray-400" />
                  <p className="text-sm text-gray-800">{address}</p>
                </div>
                <div className="flex items-start gap-3">
                  <User size={15} className="mt-0.5 flex-none text-gray-400" />
                  <p className="text-sm text-gray-800">{tech}</p>
                </div>
              </div>
            </DsCard>
            <div ref={checklistRef}>
              <DsCard className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-[14.5px] font-semibold">Checklist</p>
                  <DsChip tone={ticked === n ? "good" : "neutral"}>
                    {ticked}/{n} done
                  </DsChip>
                </div>
                <ul className="space-y-1">
                  {list.map((it, k) => {
                    const on = k < ticked;
                    return (
                      <li key={it.label} className="flex items-start gap-3 py-1">
                        <span
                          className="relative mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border-[1.5px] transition-colors duration-200"
                          style={on ? { borderColor: BW.good, background: BW.good, color: "#fff" } : { borderColor: "#D1D5DB", background: "#fff" }}
                        >
                          {on && <Check key="c" size={12} strokeWidth={3} className="wb-demo-tick" />}
                          {k === ticked - 1 && b <= n + 1 && <span key={`tap${k}`} className="wb-demo-tap left-1/2 top-1/2" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm ${on ? "text-gray-400 line-through" : "text-gray-800"}`}>{it.label}</p>
                          {on && <p className="text-[11px] text-gray-400">by {tech}</p>}
                        </div>
                        {!on && <span className="flex-none text-xs text-gray-500">Can&apos;t do it?</span>}
                      </li>
                    );
                  })}
                </ul>
              </DsCard>
            </div>
            <FoldRow title="Notes & Activity" meta="Add" />
            <FoldRow title="Photos" meta="Add" />
          </div>
        </PhoneApp>
      </div>

      {/* the client's inbox, and the real jobReportEmail when it opens */}
      <div className="relative h-[560px] min-w-0 max-w-[520px] flex-1 overflow-hidden rounded-xl bg-white text-left shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-30px_rgba(10,20,40,0.5)] max-sm:hidden" style={FONT}>
        <div className="flex h-[44px] items-center gap-2 border-b border-[#E4E7ED] bg-[#F8F9FB] px-4 text-[11.5px] font-semibold text-gray-700">
          <Inbox className="h-3.5 w-3.5" /> Inbox
          <span className="ml-auto text-[10.5px] font-normal text-gray-400">{email}</span>
        </div>
        {!opened ? (
          <div>
            {landed && <MailRow key="new" unread from="Brightwire Electric" subject={`Work completed: ${title}`} when="Now" className="wb-row-in" />}
            <MailRow from="Brightwire Electric" subject="Invoice 2462 from Brightwire Electric" when="Oct 28" />
            <MailRow from="Neighborhood News" subject="Fall cleanup day is Saturday" when="Oct 27" />
            <MailRow from="City of Plano" subject="Your utility bill is ready" when="Oct 20" />
          </div>
        ) : (
          <div key="open" className="wb-step-in">
            <div className="border-b border-[#EEF0F3] px-5 py-3">
              <p className="text-[14px] font-semibold text-gray-900">Work completed: {title}</p>
              <p className="mt-0.5 text-[10.5px] text-gray-500">Brightwire Electric · to {email}</p>
            </div>
            <ReportEmail first={first} title={title} n={n} />
          </div>
        )}
      </div>
    </div>
  );
}

/** lib/email.ts jobReportEmail in the clientShell letter (no logo: Brightwire has none on file). */
function ReportEmail({ first, title, n }: { first: string; title: string; n: number }) {
  const sys = { fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif" };
  const p = "mb-[14px] text-[15px] leading-[1.6] text-[#1F2937]";
  return (
    <div className="bg-white px-5 py-7" style={sys}>
      <div className="max-w-[560px]">
        <p className={p}>Hi {first},</p>
        <p className={p}>
          We&apos;ve finished <strong>{title}</strong>. Here&apos;s your report, with the {n}-item checklist.
        </p>
        <p className="mb-5 mt-1">
          <span className="inline-block rounded-[6px] px-5 py-[11px] text-[15px] font-semibold text-[#111827]" style={{ background: BW.secondary }}>
            See the report
          </span>
        </p>
        <p className="mb-[14px] text-[13px] leading-[1.5] text-[#6B7280]">
          Want a copy for your records? <span className="underline">Download the PDF</span>.
        </p>
        <p className="mt-1.5 text-[15px] leading-[1.6] text-[#1F2937]">
          Thanks,
          <br />
          Brightwire Electric
        </p>
        <p className="mt-9 text-[12px] leading-[1.5] text-[#9CA3AF]">
          Sent with <span className="underline">WorkBench</span>
        </p>
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
