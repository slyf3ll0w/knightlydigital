"use client";

import { Check, Home, Route as RouteIcon, Sparkles } from "lucide-react";
import WBAppFrame from "./WBAppFrame";
import { NAVY, PageHead, usd, useDemoLoop, useRoll } from "./kit";

/**
 * Route Manager: the day's stops in the order they were booked (a messy
 * line, too many miles), Optimize reorders them (pins renumber, the line
 * redraws shorter, the miles count down), then the stops tick Done one by
 * one and each autopay adds into Collected today. A drawn map (streets on
 * gray), never real tiles. Up to six stops. Rests on the finished day under
 * reduced motion.
 */

export type RouteStop = { client: string; address: string; service: string; price: number };

const DEFAULT_STOPS: RouteStop[] = [
  { client: "Derek Olsen", address: "88 Ridge Rd", service: "Generator service", price: 149 },
  { client: "Maria Hernandez", address: "1207 Elm St", service: "Panel check", price: 95 },
  { client: "Olivia Park", address: "56 Lakeview Dr", service: "Landscape lighting check", price: 89 },
  { client: "Marcus Bell", address: "4410 Main St", service: "Parking lot lights", price: 129 },
  { client: "Grace Kim", address: "412 Oak Ln", service: "Surge protector check", price: 79 },
];

// Six spots around town in the best visiting order (a loop from the shop),
// and how the booked order scatters stops across them.
const SHOP = { x: 40, y: 236 };
const SPOTS = [
  { x: 92, y: 168 },
  { x: 150, y: 82 },
  { x: 262, y: 58 },
  { x: 352, y: 118 },
  { x: 330, y: 226 },
  { x: 214, y: 256 },
];
const SCATTER = [3, 0, 5, 1, 4, 2];
const MI_PER_UNIT = 0.03;

const dist = (a: { x: number; y: number }, c: { x: number; y: number }) => Math.hypot(a.x - c.x, a.y - c.y);
const pathOf = (pts: { x: number; y: number }[]) => pts.map((p, k) => `${k ? "L" : "M"}${p.x} ${p.y}`).join(" ");
const miles = (pts: { x: number; y: number }[]) => pts.slice(1).reduce((a, p, k) => a + dist(pts[k], p), 0) * MI_PER_UNIT;

export default function WBDemoRoute({ day = "Tuesday, Nov 3", stops = DEFAULT_STOPS, cadence = "Every month" }: { day?: string; stops?: RouteStop[]; cadence?: string } = {}) {
  const list = stops.slice(0, 6);
  const n = list.length;
  // spots used: the first n of the loop; booked order scatters them
  const scatter = SCATTER.filter((s) => s < n);
  const spotOf = (k: number) => SPOTS[scatter[k]];
  const bookedOrder = list.map((_, k) => k);
  const bestOrder = [...bookedOrder].sort((a, c) => scatter[a] - scatter[c]);

  const doneTimes = list.map((_, k) => 3300 + k * 900);
  // 1 press Optimize · 2 reorder · 3.. each stop done
  const { ref, b, loop } = useDemoLoop([1000, 1450, ...doneTimes], 3300 + n * 900 + 3200);
  const optimized = b >= 2;
  const order = optimized ? bestOrder : bookedOrder;
  const doneCount = Math.max(0, b - 2);
  const pts = [SHOP, ...order.map(spotOf), SHOP];
  const before = miles([SHOP, ...bookedOrder.map(spotOf), SHOP]);
  const after = miles([SHOP, ...bestOrder.map(spotOf), SHOP]);
  const mi = useRoll(optimized ? after : before, 900);
  const collected = order.slice(0, doneCount).reduce((a, k) => a + list[k].price, 0);
  const shownCollected = useRoll(collected, 500);
  const posOf = (k: number) => order.indexOf(k);

  const ROW = 48;
  return (
    <div ref={ref}>
      <WBAppFrame nav="Routes" height={400}>
        <PageHead
          sub={day}
          title="Routes"
          right={
            <span
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11.5px] font-semibold text-white transition-[transform,background-color] duration-200 ${b === 1 ? "scale-95" : ""}`}
              style={{ background: optimized ? "#17A34A" : NAVY }}
            >
              {optimized ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Sparkles className="h-3.5 w-3.5" />}
              {optimized ? "Optimized" : "Optimize"}
            </span>
          }
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_250px]">
          {/* the map */}
          <div className="relative h-[316px] overflow-hidden rounded-2xl border border-[#E3E6EC] bg-[#EEF0F3] max-sm:h-[190px]">
            <svg viewBox="0 0 400 300" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              <rect x="226" y="132" width="70" height="52" rx="6" fill="#DCEBD9" />
              <path d="M0 300 C 60 270, 40 210, 0 196" fill="#D6E4F3" />
              {[40, 120, 200, 280].map((y) => (
                <line key={`h${y}`} x1="0" y1={y} x2="400" y2={y} stroke="#FFFFFF" strokeWidth={y === 200 ? 9 : 6} vectorEffect="non-scaling-stroke" />
              ))}
              {[70, 180, 300, 380].map((x) => (
                <line key={`v${x}`} x1={x} y1="0" x2={x} y2="300" stroke="#FFFFFF" strokeWidth={x === 180 ? 9 : 6} vectorEffect="non-scaling-stroke" />
              ))}
              <line x1="0" y1="10" x2="400" y2="290" stroke="#FFFFFF" strokeWidth="7" vectorEffect="non-scaling-stroke" />
              <path key={`r${optimized ? 1 : 0}-${loop}`} d={pathOf(pts)} pathLength={1} fill="none" stroke="#0B57D8" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" className="wb-demo-route" />
            </svg>
            <span className="absolute flex -ml-[11px] -mt-[11px] h-[22px] w-[22px] items-center justify-center rounded-md text-white shadow-[0_2px_6px_rgba(10,20,40,0.35)]" style={{ background: NAVY, left: `${(SHOP.x / 400) * 100}%`, top: `${(SHOP.y / 300) * 100}%` }}>
              <Home className="h-3 w-3" strokeWidth={2.6} />
            </span>
            {/* pins, placed in % so they sit on the drawn spots at any width */}
            {list.map((_, k) => {
              const p = spotOf(k);
              const done = posOf(k) < doneCount;
              return (
                <span
                  key={`${k}-${optimized ? 1 : 0}`}
                  className={`wb-pop-in absolute flex -ml-[11px] -mt-[11px] h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-[0_2px_6px_rgba(10,20,40,0.35)] transition-colors duration-300 ${done ? "bg-[#17A34A]" : optimized ? "bg-[#0B57D8]" : "bg-[#F86A0A]"}`}
                  style={{ left: `${(p.x / 400) * 100}%`, top: `${(p.y / 300) * 100}%` }}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={3.4} /> : posOf(k) + 1}
                </span>
              );
            })}
            <div className="absolute left-3 top-3 rounded-xl bg-white px-3 py-2 shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_8px_18px_-10px_rgba(10,20,40,0.4)]">
              <p className="flex items-center gap-1.5 text-[15px] font-semibold tabular-nums text-gray-900">
                <RouteIcon className="h-3.5 w-3.5 text-[#0B57D8]" /> {mi.toFixed(1)} mi
              </p>
              <p className={`text-[10px] font-semibold ${optimized ? "text-[#17703B]" : "text-gray-500"}`}>{optimized ? `${(before - after).toFixed(1)} mi saved` : `${n} stops, as booked`}</p>
            </div>
            <div className="absolute right-3 top-3 rounded-xl bg-white px-3 py-2 shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_8px_18px_-10px_rgba(10,20,40,0.4)]">
              <p className="text-[10px] text-gray-500">Collected today</p>
              <p className="text-[15px] font-semibold tabular-nums text-gray-900">{usd(shownCollected)}</p>
            </div>
          </div>

          {/* the stops */}
          <div className="relative overflow-hidden rounded-2xl border border-[#E3E6EC] bg-white max-sm:hidden">
            <div className="border-b border-[#EEF0F3] px-3 py-2 text-[10.5px] font-semibold text-gray-600">
              Sam · {n} stops · {cadence}
            </div>
            <div className="relative" style={{ height: n * ROW }}>
              {list.map((s, k) => {
                const at = posOf(k);
                const done = at < doneCount;
                return (
                  <div
                    key={s.client}
                    className={`absolute inset-x-0 flex items-center gap-2.5 border-b border-[#EEF0F3] px-3 transition-[top,background-color] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${done ? "bg-[#F1FAF4]" : "bg-white"}`}
                    style={{ top: at * ROW, height: ROW }}
                  >
                    <span className={`flex h-[20px] w-[20px] flex-none items-center justify-center rounded-full text-[9.5px] font-bold text-white transition-colors duration-300 ${done ? "bg-[#17A34A]" : optimized ? "bg-[#0B57D8]" : "bg-[#F86A0A]"}`}>
                      {done ? <Check key="d" className="wb-demo-tick h-3 w-3" strokeWidth={3.4} /> : at + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11.5px] font-semibold text-gray-900">{s.client}</span>
                        <span className="flex-none text-[10.5px] font-semibold tabular-nums text-gray-700">{usd(s.price)}</span>
                      </span>
                      {done ? (
                        <span key="paid" className="wb-step-in block truncate text-[10px] font-semibold text-[#17703B]">
                          Done · Autopay · {usd(s.price)}
                        </span>
                      ) : (
                        <span className="block truncate text-[10px] text-gray-500">
                          {s.service} · {s.address}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* phones: the list under the map, in compact form */}
          <div className="space-y-1.5 sm:hidden">
            {order.slice(0, 3).map((k, at) => {
              const s = list[k];
              const done = at < doneCount;
              return (
                <div key={s.client} className={`flex items-center gap-2 rounded-xl border border-[#E3E6EC] px-3 py-1.5 ${done ? "bg-[#F1FAF4]" : "bg-white"}`}>
                  <span className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-[9px] font-bold text-white ${done ? "bg-[#17A34A]" : optimized ? "bg-[#0B57D8]" : "bg-[#F86A0A]"}`}>
                    {done ? <Check className="h-2.5 w-2.5" strokeWidth={3.4} /> : at + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-gray-900">{s.client}</span>
                  <span className={`flex-none text-[10px] font-semibold ${done ? "text-[#17703B]" : "text-gray-500"}`}>{done ? `Autopay · ${usd(s.price)}` : usd(s.price)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </WBAppFrame>
    </div>
  );
}
