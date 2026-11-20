"use client";

import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CornerDownRight,
  GripVertical,
  Info,
  Link2,
  LockOpen,
  Maximize2,
  Minus,
  Navigation,
  PanelLeftClose,
  Plus,
  Printer,
  Send,
  Wand2,
  Warehouse,
  X,
} from "lucide-react";
import WBAppFrame from "./WBAppFrame";
import { FONT, useDemoLoop, useNarrow } from "./kit";
import { BW, PhoneApp } from "./WBDemoChecklist";

/**
 * The Routes page (app/platform/routes/RouteMapClient.tsx): the day's stops
 * as booked on the map and in the floating stop list, Optimize opens the
 * preview ("Sam's route, optimized": drive time before → after, saves ~N
 * min, the new times with the old ones struck through), Apply new order, and
 * the list, the pins and the road line take the new order with the app's
 * "route updated" notice. The map is drawn (light streets, the crew's colored
 * line on a white casing, numbered pins, the HQ tile), never real tiles.
 * Phones get the phone layout: the map with the stop list as a bottom sheet.
 * Up to six stops. Rests on the applied route under reduced motion.
 */

export type RouteStop = { client: string; address: string; service: string; price: number };

const DEFAULT_STOPS: RouteStop[] = [
  { client: "Derek Olsen", address: "88 Ridge Rd", service: "Generator service", price: 149 },
  { client: "Maria Hernandez", address: "1207 Elm St", service: "Panel check", price: 95 },
  { client: "Olivia Park", address: "56 Lakeview Dr", service: "Landscape lighting check", price: 89 },
  { client: "Marcus Bell", address: "4410 Main St", service: "Parking lot lights", price: 129 },
  { client: "Grace Kim", address: "412 Oak Ln", service: "Surge protector check", price: 79 },
];

// Where the stops sit (a loop from the shop, in the best visiting order) and
// how the booked order scatters them.
const SHOP = { x: 40, y: 250 };
const SPOTS = [
  { x: 70, y: 150 },
  { x: 130, y: 60 },
  { x: 245, y: 40 },
  { x: 350, y: 95 },
  { x: 330, y: 215 },
  { x: 210, y: 262 },
];
const SCATTER = [3, 0, 5, 1, 4, 2];
const TECH = { name: "Sam Rivera", initials: "SR", color: "#16A34A" }; // TECH_COLORS[0]
const INK = "#0A1428";
const VISIT = 60; // minutes on site
const MI_PER_UNIT = 0.034;
const MIN_PER_MI = 2.3;

type Pt = { x: number; y: number };
const dist = (a: Pt, c: Pt) => Math.hypot(a.x - c.x, a.y - c.y);
const legMi = (a: Pt, c: Pt) => dist(a, c) * MI_PER_UNIT;
const legMin = (a: Pt, c: Pt) => Math.max(4, Math.round(legMi(a, c) * MIN_PER_MI));
const fmt = (min: number) => {
  const h24 = Math.floor(min / 60) % 24;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(Math.round(min % 60)).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
};
const miLabel = (mi: number) => (mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`);
const pathOf = (pts: Pt[]) => pts.map((p, k) => `${k ? "L" : "M"}${p.x} ${p.y}`).join(" ");

const GLASS_MAP: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.86)",
  WebkitBackdropFilter: "blur(12px) saturate(1.2)",
  backdropFilter: "blur(12px) saturate(1.2)",
  border: "1px solid color-mix(in srgb, #0a1428 18%, transparent)",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06), 0 6px 20px rgba(15, 23, 42, 0.1)",
};
const CARD: React.CSSProperties = { boxShadow: "0 1px 2px rgba(10, 19, 40, 0.04), 0 0 0 1px rgba(10, 19, 40, 0.06)" };

export default function WBDemoRoute({
  day = "Tue, Nov 3",
  stops = DEFAULT_STOPS,
}: {
  /** "Tuesday" or "Tue, Nov 3"; a bare weekday is shown as the app's short date. */
  day?: string;
  stops?: RouteStop[];
  /** Kept for callers; the Routes page has no cadence line. */
  cadence?: string;
} = {}) {
  const list = stops.slice(0, 6);
  const n = list.length;
  const dayLabel = /,/.test(day) ? day : `${day.slice(0, 3)}, Nov 3`;
  const scatter = SCATTER.filter((s) => s < n);
  const spotOf = (k: number) => SPOTS[scatter[k]];
  const booked = list.map((_, k) => k);
  const best = [...booked].sort((a, c) => scatter[a] - scatter[c]);

  // 1 press Optimize · 2 the preview · 3 press Apply · 4 applied
  // a desk screen drawn narrower than this is the phone layout, as in the app
  const { ref: wide, narrow } = useNarrow(760);
  const { ref, b, loop } = useDemoLoop([1300, 1650, 4600, 5000], 11000);
  const applied = b >= 4;
  const order = applied ? best : booked;
  const preview = b === 2 || b === 3;

  /** Times + legs for an order: booked = on the hour and a half; optimized = drive-spaced from 8 AM. */
  const plan = (ord: number[], spaced: boolean) => {
    let at = 8 * 60;
    let prev: Pt = SHOP;
    let drive = 0;
    let miles = 0;
    const rows = ord.map((k, i) => {
      const p = spotOf(k);
      const lm = legMin(prev, p);
      const mi = legMi(prev, p);
      drive += lm;
      miles += mi;
      const start = spaced ? (i === 0 ? at : at + lm) : 8 * 60 + i * 90;
      at = start + VISIT;
      prev = p;
      return { k, start, leg: lm, mi };
    });
    const back = legMin(prev, SHOP);
    return { rows, drive, miles, back, end: rows.length ? rows[rows.length - 1].start + VISIT : 8 * 60 };
  };
  const before = plan(booked, false);
  const after = plan(best, true);
  const now = applied ? after : before;
  const startOf = (k: number, p: typeof before) => p.rows.find((r) => r.k === k)!.start;
  const moved = best.filter((k) => startOf(k, before) !== startOf(k, after)).length;
  const saved = before.drive - after.drive;

  const crewLine = `${n} stop${n === 1 ? "" : "s"} · ${fmt(now.rows[0]?.start ?? 480)} – ${fmt(now.end)} · ${now.drive} min drive · ${miLabel(now.miles)}`;
  const linePts = [SHOP, ...order.map(spotOf)];

  const ROW = 76;
  const stopList = (compact: boolean) => (
    <div className="overflow-hidden rounded-[20px] bg-white" style={CARD}>
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: TECH.color }}>
            {TECH.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-gray-900">{TECH.name}</p>
            <p className="truncate text-[11px] text-gray-500">{crewLine}</p>
          </div>
        </div>
        <div className="flex flex-none items-center gap-1">
          {!compact && (
            <>
              <IconBtn>
                <Send size={13} />
              </IconBtn>
              <IconBtn>
                <Link2 size={13} />
              </IconBtn>
            </>
          )}
          <IconBtn>
            <Plus size={14} />
          </IconBtn>
          <span
            className={`relative flex items-center gap-1.5 rounded-[12px] border bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 transition-transform duration-150 ${b === 1 ? "scale-[0.95] bg-gray-50" : ""}`}
            style={{ borderColor: BW.lineStrong }}
          >
            <Wand2 size={13} />
            Optimize
            {b === 1 && <span className="wb-demo-tap left-1/2 top-1/2" />}
          </span>
        </div>
      </div>
      <div className="relative" style={{ height: n * ROW }}>
        {list.map((s, k) => {
          const i = order.indexOf(k);
          const r = now.rows.find((x) => x.k === k)!;
          return (
            <div
              key={s.client + k}
              className="absolute inset-x-0 transition-[top] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
              style={{ top: i * ROW, height: ROW, borderTop: i ? "1px solid #F3F4F6" : undefined }}
            >
              <p className="flex items-center gap-1.5 px-4 pt-2 text-[10.5px] text-gray-400">
                <CornerDownRight size={11} className="flex-none" />
                {r.leg} min drive · {miLabel(r.mi)}
                {i === 0 ? " from HQ" : ""}
              </p>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="-ml-1 flex-none rounded p-1 text-gray-300">
                  <GripVertical size={14} />
                </span>
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: TECH.color }}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{s.service}</p>
                  <p className="truncate text-xs text-gray-500">
                    {s.client} · {s.address}
                  </p>
                </div>
                <div className="flex-none text-right">
                  <p className="text-xs font-semibold text-gray-900">{fmt(r.start)}</p>
                  <span className="flex items-center justify-end gap-2 text-[11px] font-semibold" style={{ color: BW.primary }}>
                    <span className="flex items-center gap-0.5">
                      <Navigation size={10} />
                      Go
                    </span>
                    Open
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /** The road line, pins and HQ, drawn inside the part of the map the panel leaves free. */
  const routeLayer = (
    <>
      <svg viewBox="0 0 400 300" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <g key={`l${applied ? 1 : 0}-${loop}`}>
          <path d={pathOf(linePts)} pathLength={1} fill="none" stroke="#fff" strokeWidth={6} strokeOpacity={0.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="wb-demo-route" />
          <path d={pathOf(linePts)} pathLength={1} fill="none" stroke={TECH.color} strokeWidth={3.5} strokeOpacity={0.9} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="wb-demo-route" />
        </g>
      </svg>
      <span className="absolute -ml-[14px] -mt-[14px] flex h-[28px] w-[28px] items-center justify-center rounded-[9px] border-2 border-white text-[10px] font-bold tracking-[0.03em] text-white shadow-[0_1px_4px_rgba(10,20,40,0.4)]" style={{ background: INK, left: `${(SHOP.x / 400) * 100}%`, top: `${(SHOP.y / 300) * 100}%` }}>
        HQ
      </span>
      {list.map((_, k) => {
        const p = spotOf(k);
        return (
          <span
            key={`${k}-${applied ? 1 : 0}-${loop}`}
            className="wb-pop-in absolute -ml-[14px] -mt-[14px] flex h-[28px] w-[28px] items-center justify-center rounded-full border-2 border-white text-[12px] font-bold tabular-nums text-white shadow-[0_1px_4px_rgba(10,20,40,0.4)]"
            style={{ background: TECH.color, left: `${(p.x / 400) * 100}%`, top: `${(p.y / 300) * 100}%`, animationDelay: `${k * 30}ms` }}
          >
            {order.indexOf(k) + 1}
          </span>
        );
      })}
    </>
  );

  const notice = applied && (
    <div className="wb-row-in pointer-events-none absolute left-0 right-0 top-16 z-30 mx-auto flex w-[min(92%,30rem)] items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm text-[#0A1328] shadow-lg">
      <div className="flex min-w-0 items-center gap-3">
        <svg width="56" height="22" viewBox="0 0 64 24" fill="none" className="flex-none" aria-hidden>
          <path d="M4 18C16 4 24 22 34 10S52 16 60 6" stroke={BW.good} strokeWidth="2" strokeLinecap="round" pathLength={1} className="wb-demo-route" />
          <circle cx="4" cy="18" r="3" fill={BW.good} />
          <circle cx="34" cy="10" r="3" fill={BW.good} />
          <circle cx="60" cy="6" r="3.5" fill={BW.good} />
        </svg>
        <span>{TECH.name.split(" ")[0]}&apos;s route updated — the calendar now follows this order.</span>
      </div>
      <X size={14} className="flex-none text-[#687589]" />
    </div>
  );

  const previewBody = (
    <>
      <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <p className="flex items-center gap-1.5 text-base font-bold text-gray-900">
            {TECH.name}&apos;s route, optimized
            <Info size={15} className="text-[#9AA4B5]" />
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
            <span>
              Drive time {before.drive} min → {after.drive} min · {Math.round(after.miles)} mi
            </span>
            {saved > 0 && (
              <span className="inline-flex h-[22px] items-center gap-1.5 px-0.5 text-[12px] font-medium text-[#3A475C]">
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: BW.good, boxShadow: `0 0 0 2.5px color-mix(in srgb, ${BW.good} 22%, transparent)` }} />
                saves ~{saved} min
              </span>
            )}
          </p>
        </div>
        <span className="rounded-full p-1.5 text-gray-400">
          <X size={18} />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-5 py-3">
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            Day starts at
            <span className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-800">08:00 AM</span>
            <span className="text-gray-400">first stop begins then</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {["7 AM", "7:30", "8 AM", "8:30", "9 AM", "10 AM"].map((p) => (
              <span
                key={p}
                className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                style={p === "8 AM" ? { borderColor: BW.primary, background: BW.soft, color: BW.primary } : { borderColor: "#E5E7EB", background: "#fff", color: "#4B5563" }}
              >
                {p}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1 text-xs text-gray-600">
            <Box on />
            End the day back where it started
            <span className="text-gray-400">(+{after.back} min back)</span>
          </div>
        </div>
        <ol className="space-y-1.5">
          {after.rows.map((r, i) => {
            const s = list[r.k];
            return (
              <li key={s.client + r.k} className="flex items-center gap-2 rounded-[12px] border border-gray-200 px-2 py-2">
                <span className="flex-none rounded p-0.5 text-gray-300">
                  <GripVertical size={14} />
                </span>
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: INK }}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{s.service}</p>
                  <p className="text-xs text-gray-500">
                    {startOf(r.k, before) !== r.start && <span className="mr-1.5 text-gray-400 line-through">{fmt(startOf(r.k, before))}</span>}
                    <span className="font-semibold text-gray-800">
                      {fmt(r.start)} – {fmt(r.start + VISIT)}
                    </span>
                  </p>
                </div>
                <div className="flex flex-none items-center gap-1.5">
                  <span className="text-[11px] text-gray-400">+{r.leg}m</span>
                  {startOf(r.k, before) !== r.start && (
                    <span className="p-0.5 text-gray-300">
                      <LockOpen size={14} />
                    </span>
                  )}
                  <span className="flex flex-col text-gray-400">
                    <ArrowUp size={14} className={i === 0 ? "opacity-30" : ""} />
                    <ArrowDown size={14} className={i === n - 1 ? "opacity-30" : ""} />
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <Box on={false} />
          {moved === 0 ? "No client's time changes with this order" : `Text or email the ${moved} client${moved === 1 ? "" : "s"} whose time changes`}
        </div>
      </div>
      <div className="flex flex-none items-center justify-end gap-2 border-t border-gray-100 px-5 py-3.5">
        <span className="rounded-[10px] px-3 py-2 text-sm font-medium text-gray-600">Cancel</span>
        <span className={`relative flex items-center gap-1.5 rounded-[12px] px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 ${b === 3 ? "scale-[0.97]" : ""}`} style={{ background: BW.primary }}>
          Apply new order
          {b === 3 && <span className="wb-demo-tap left-1/2 top-1/2" />}
        </span>
      </div>
    </>
  );
  const glassStrong: React.CSSProperties = {
    backgroundColor: "color-mix(in srgb, #10244A 3%, rgba(255, 255, 255, 0.86))",
    WebkitBackdropFilter: "saturate(190%) blur(28px)",
    backdropFilter: "saturate(190%) blur(28px)",
    border: "1px solid rgba(255, 255, 255, 0.6)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 1px 2px rgba(10,19,40,0.06), 0 24px 50px -18px rgba(10,19,40,0.32), 0 0 0 1px rgba(10,19,40,0.06)",
  };

  return (
    <div ref={ref} style={FONT} data-wb-demo="route">
      <div ref={wide} />
      {/* desk */}
      <div className={narrow ? "hidden" : "max-sm:hidden"}>
        <WBAppFrame nav="Routes" height={500}>
          <div className="absolute inset-0 overflow-hidden" style={{ color: BW.ink }}>
            <TownMap />
            <div className="absolute bottom-6 left-[calc(min(380px,52%)+40px)] right-16 top-20">{routeLayer}</div>

            {/* header pill */}
            <div className="absolute left-3 top-3 z-10 flex items-center gap-0.5 rounded-[12px] px-1.5 py-1" style={GLASS_MAP}>
              <span className="pl-1.5 text-[15px] font-bold text-gray-900">Routes</span>
              <span className="mr-1.5 inline-flex h-[22px] items-center gap-1.5 px-0.5 text-[12px] font-medium text-[#3A475C]">
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: BW.warn, boxShadow: `0 0 0 2.5px color-mix(in srgb, ${BW.warn} 22%, transparent)` }} />
                Beta
              </span>
              <span className="rounded-full p-1.5">
                <ChevronLeft size={17} className="text-gray-600" />
              </span>
              <span className="whitespace-nowrap px-1 text-[15px] font-bold text-gray-900">{dayLabel}</span>
              <span className="rounded-full p-1.5">
                <ChevronRight size={17} className="text-gray-600" />
              </span>
            </div>

            <MapControls desk />

            {/* the stop list panel */}
            <div className="absolute bottom-4 left-3 top-[4.25rem] z-10 flex w-[min(380px,52%)] flex-col overflow-hidden rounded-[12px]" style={GLASS_MAP}>
              <div className="flex flex-none items-center justify-between gap-2 border-b border-gray-200/80 px-3 py-2">
                <p className="truncate text-[13px] font-semibold text-gray-800">
                  {n} stops · 1 crew
                </p>
                <span className="rounded-[8px] p-1 text-gray-400">
                  <PanelLeftClose size={15} />
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden p-2.5">{stopList(false)}</div>
            </div>

            {notice}

            {preview && (
              <div className="wb-step-in absolute inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
                <div className="wb-pop-in flex max-h-full w-full max-w-[32rem] flex-col overflow-hidden rounded-[20px]" style={glassStrong}>
                  {previewBody}
                </div>
              </div>
            )}
          </div>
        </WBAppFrame>
      </div>

      {/* phone */}
      <div className={narrow ? "flex justify-center" : "flex justify-center sm:hidden"}>
        <PhoneApp
          width={300}
          height={600}
          overlay={
            preview ? (
              <div className="absolute inset-0 z-40">
                <div className="wb-step-in absolute inset-0 bg-black/30" />
                <div className="wb-row-in absolute inset-x-0 bottom-0 flex max-h-[86%] flex-col overflow-hidden rounded-t-[20px]" style={glassStrong}>
                  <div className="mx-auto mt-2 h-1 w-9 flex-none rounded-full bg-gray-300" />
                  {previewBody}
                </div>
              </div>
            ) : null
          }
        >
          <div className="absolute inset-0">
            <TownMap />
            <div className="absolute bottom-[50%] left-8 right-16 top-[120px]">{routeLayer}</div>
            <div className="absolute left-3 top-[64px] z-10 flex items-center gap-0.5 rounded-[12px] px-1.5 py-1" style={GLASS_MAP}>
              <span className="rounded-full p-1.5">
                <ChevronLeft size={17} className="text-gray-600" />
              </span>
              <span className="whitespace-nowrap px-1 text-[15px] font-bold text-gray-900">{dayLabel}</span>
              <span className="rounded-full p-1.5">
                <ChevronRight size={17} className="text-gray-600" />
              </span>
            </div>
            <div className="absolute right-3 top-[64px] z-10">
              <MapControls />
            </div>
            {notice}
            <div className="absolute inset-x-0 bottom-0 z-10 flex h-[46%] flex-col rounded-t-2xl" style={GLASS_MAP}>
              <div className="mx-auto mt-2.5 h-1 w-9 flex-none rounded-full bg-gray-300/90" />
              <div className="flex flex-none items-center justify-between gap-2 px-4 pb-1.5 pt-2">
                <p className="truncate text-sm font-bold text-gray-900">{n} stops · 1 crew</p>
                <ChevronUp size={16} className="text-gray-400" />
              </div>
              <div className="min-h-0 flex-1 overflow-hidden p-3 pt-2">{stopList(true)}</div>
            </div>
          </div>
        </PhoneApp>
      </div>
    </div>
  );
}

function IconBtn({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-[12px] border bg-white text-gray-700" style={{ borderColor: BW.lineStrong }}>
      {children}
    </span>
  );
}

function Box({ on }: { on: boolean }) {
  return (
    <span className={`flex h-4 w-4 flex-none items-center justify-center rounded border ${on ? "border-[#10244A] bg-[#10244A]" : "border-gray-300 bg-white"}`}>
      {on && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
          <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/** The control cluster, top-right (zoom; fit, [locate], calendar, places, [print]). */
function MapControls({ desk = false }: { desk?: boolean }) {
  const ctl = "flex h-[38px] w-[38px] items-center justify-center text-[#374151]";
  const rule = <span className="mx-2 h-px bg-gray-200" />;
  return (
    <div className={`${desk ? "absolute right-3 top-3 z-10" : ""} flex flex-col items-end gap-2`}>
      <div className="flex flex-col overflow-hidden rounded-[12px]" style={GLASS_MAP}>
        <span className={ctl}>
          <Plus size={16} />
        </span>
        {rule}
        <span className={ctl}>
          <Minus size={16} />
        </span>
      </div>
      <div className="flex flex-col overflow-hidden rounded-[12px]" style={GLASS_MAP}>
        <span className={ctl}>
          <Maximize2 size={15} />
        </span>
        {rule}
        <span className={ctl}>
          <CalendarDays size={15} />
        </span>
        {rule}
        <span className={ctl}>
          <Warehouse size={15} />
        </span>
        {desk && (
          <>
            {rule}
            <span className={ctl}>
              <Printer size={15} />
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** A drawn town in the light map style the Routes page uses (pale land, white streets, gray water, soft parks, gray labels). */
function TownMap() {
  return (
    <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect width="800" height="500" fill="#F2F3F1" />
      {/* blocks */}
      <g fill="#ECEDEA">
        {Array.from({ length: 9 }).map((_, c) =>
          Array.from({ length: 6 }).map((_, r) => <rect key={`${c}-${r}`} x={c * 92 + 8} y={r * 86 + 8} width={76} height={70} rx={3} />),
        )}
      </g>
      <path d="M560 0 C 590 80, 640 120, 700 140 S 800 170, 800 170 L 800 0 Z" fill="#D9DEE3" />
      <path d="M0 410 C 60 380, 120 400, 170 450 L 190 500 L 0 500 Z" fill="#D9DEE3" />
      <rect x="292" y="190" width="150" height="104" rx="8" fill="#DFE8DA" />
      <rect x="108" y="20" width="80" height="60" rx="6" fill="#DFE8DA" />
      {/* minor streets */}
      <g stroke="#FFFFFF" strokeWidth="5">
        {Array.from({ length: 10 }).map((_, c) => (
          <line key={`v${c}`} x1={c * 92} y1="0" x2={c * 92} y2="500" />
        ))}
        {Array.from({ length: 7 }).map((_, r) => (
          <line key={`h${r}`} x1="0" y1={r * 86} x2="800" y2={r * 86} />
        ))}
      </g>
      {/* arterials, with a soft casing */}
      <g fill="none" strokeLinecap="round">
        <path d="M0 258 L 800 258" stroke="#E2E3E0" strokeWidth="13" />
        <path d="M368 0 L 368 500" stroke="#E2E3E0" strokeWidth="13" />
        <path d="M0 40 C 220 120, 520 300, 800 470" stroke="#E2E3E0" strokeWidth="15" />
        <path d="M0 258 L 800 258" stroke="#FFFFFF" strokeWidth="10" />
        <path d="M368 0 L 368 500" stroke="#FFFFFF" strokeWidth="10" />
        <path d="M0 40 C 220 120, 520 300, 800 470" stroke="#FFFFFF" strokeWidth="12" />
      </g>
      <g fill="#9AA0A6" fontSize="10" fontFamily="system-ui, sans-serif" letterSpacing="0.02em">
        <text x="20" y="252">W Parker Rd</text>
        <text x="374" y="120" transform="rotate(90 374 120)">Custer Rd</text>
        <text x="600" y="368" transform="rotate(30 600 368)">Spring Creek Pkwy</text>
        <text x="306" y="246" fill="#8FA58A">Oak Point Park</text>
        <text x="650" y="60" fill="#8C99A6" fontStyle="italic">Lake</text>
      </g>
    </svg>
  );
}
