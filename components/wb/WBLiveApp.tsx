"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import WBAppIcon from "@/components/wb/WBAppIcon";
import {
  Bell,
  Briefcase,
  CalendarDays,
  ChevronRight,
  ChevronsUpDown,
  Compass,
  FileText,
  Home,
  Info,
  MapPin,
  MessagesSquare,
  Plus,
  Receipt,
  Search,
  Settings,
  Users,
} from "lucide-react";

/**
 * The home hero's "live app" (David 2026-11-18): a coded copy of the REAL
 * WorkBench dashboard (public/screens/desktop-dashboard.jpg is the
 * reference: same sidebar, top bar, three money cards, Today and Needs
 * you, the Atlas button), for the made-up Brightwire Electric (never a
 * real client), in the app's own typeface (Lexend). It works by itself on a
 * loop while on screen:
 *   1. a new online booking lands in Today,
 *   2. the past-due invoice is paid: its row turns green and Collected
 *      counts up while Outstanding drops,
 *   3. the payment notification comes in.
 * Still, finished state under reduced motion. Round 5: rebuilt after David
 * said the first copy did not look like the software.
 */

const STEP_MS = [1800, 2600, 2600, 4200];
const BASE_COLLECTED = 5190.59;
const PAID = 1240;

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const NAVY = "#1D2E52";

export default function WBLiveApp() {
  const [step, setStep] = useState(0);
  const [collected, setCollected] = useState(BASE_COLLECTED);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(3);
      setCollected(BASE_COLLECTED + PAID);
      return;
    }
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0.2 });
    if (ref.current) io.observe(ref.current);
    let timer: ReturnType<typeof setTimeout>;
    let s = 0;
    const tick = () => {
      if (!visible.current) {
        timer = setTimeout(tick, 500);
        return;
      }
      s = (s + 1) % 4;
      setStep(s);
      if (s === 0) setCollected(BASE_COLLECTED);
      timer = setTimeout(tick, STEP_MS[s]);
    };
    timer = setTimeout(tick, STEP_MS[0]);
    return () => {
      clearTimeout(timer);
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    if (step !== 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    let raf = 0;
    const run = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      setCollected(BASE_COLLECTED + PAID * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  const booked = step >= 1;
  const paid = step >= 2;
  const pinged = step >= 3;

  const nav = [
    { icon: Home, label: "Home" },
    { icon: CalendarDays, label: "Schedule" },
    { icon: Users, label: "Clients" },
    { icon: FileText, label: "Quotes" },
    { icon: Briefcase, label: "Jobs" },
    { icon: Receipt, label: "Invoices" },
  ];

  const today: { t: string; who: string; sub: string; amt?: string; visit?: boolean }[] = [
    { t: "9:00a", who: "Maria Hernandez — AC disconnect replacement", sub: "Mike Delgado", amt: "$450.00" },
    { t: "10:00a", who: "Olivia Park — Ceiling fan install x3", sub: "Sam Ortiz", amt: "$520.00" },
    { t: "12:00p", who: "James Whitfield — EV charger install", sub: "Sam Ortiz", amt: "$450.00" },
    { t: "3:00p", who: "Tom Becker — Walkthrough for panel upgrade", sub: "In-person · Mike Delgado", visit: true },
  ];

  const needs = [
    { n: 3, a: "New leads", b: "Reach out" },
    { n: 2, a: "New requests", b: "Review & send a quote" },
    { n: 1, a: "Changes requested", b: "Update the quote" },
  ];

  return (
    <div ref={ref} className="relative select-none text-left" style={{ fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" }} aria-hidden>
      <div className="wb-window !bg-[#F4F5F8]">
        <div className="flex">
          {/* sidebar */}
          <aside className="hidden w-[176px] flex-none flex-col border-r border-[#DCE1EA] bg-[#E8ECF3] md:flex">
            <div className="m-2.5 flex h-[46px] items-center justify-center rounded-xl border border-[#D7DCE6] bg-white">
              <Image src="/wb/brightwire-logo.png" alt="" width={142} height={44} className="h-[28px] w-auto" />
            </div>
            <div className="mt-1 border-t border-[#DCE1EA] pt-2">
              {nav.map(({ icon: Icon, label }, i) => (
                <div
                  key={label}
                  className={`relative flex items-center gap-2.5 px-4 py-[7px] text-[12px] ${i === 0 ? "bg-[#D9DFEA] font-semibold text-gray-900" : "text-gray-600"}`}
                >
                  {i === 0 && <span className="absolute inset-y-0 left-0 w-[3px] bg-[#1D2E52]" />}
                  <Icon className="h-[14px] w-[14px]" strokeWidth={1.8} />
                  {label}
                  {label === "Invoices" && !paid && (
                    <span className="ml-auto rounded bg-[#F6E7C8] px-1.5 text-[9px] font-semibold text-[#9A6B12]">1</span>
                  )}
                </div>
              ))}
              {["WORK", "MONEY", "BUSINESS"].map((g) => (
                <div key={g} className="flex items-center gap-2 px-4 py-[7px] text-[8.5px] font-semibold tracking-[0.14em] text-gray-500">
                  {g}
                  <span className="h-px flex-1 bg-[#D3D9E3]" />
                  {g === "WORK" && <span className="rounded bg-[#D9DFEA] px-1.5 text-[8.5px] text-gray-600">5</span>}
                  <ChevronRight className="h-3 w-3" />
                </div>
              ))}
            </div>
            <div className="mt-auto border-t border-[#DCE1EA] px-4 py-3">
              <div className="flex items-center gap-2 text-[11.5px] text-gray-600">
                <Settings className="h-[13px] w-[13px]" strokeWidth={1.8} />
                Settings
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1D2E52] text-[9.5px] font-semibold text-white">MD</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10.5px] font-semibold text-gray-900">Mike Delgado</span>
                  <span className="block text-[9px] text-gray-500">Brightwire Electric</span>
                </span>
                <ChevronsUpDown className="h-3 w-3 text-gray-400" />
              </div>
            </div>
          </aside>

          {/* main */}
          <div className="min-w-0 flex-1">
            {/* top bar */}
            <div className="flex h-[46px] items-center justify-end gap-2.5 border-b border-[#E4E7ED] bg-[#F4F5F8] px-4">
              <span className="mr-auto hidden w-[230px] items-center gap-2 rounded-lg bg-[#ECEEF2] px-3 py-1.5 text-[11px] text-gray-400 lg:flex">
                <Search className="h-3 w-3" />
                Search
                <span className="ml-auto rounded border border-gray-300 bg-white px-1 text-[8px] text-gray-500">Ctrl K</span>
              </span>
              <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white" style={{ background: NAVY }}>
                <Plus className="h-3 w-3" strokeWidth={2.5} />
                Create
              </span>
              <span className="hidden items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-800 sm:flex">
                <MessagesSquare className="h-3 w-3" />
                Chat
              </span>
              <span className="relative">
                <Bell className="h-[14px] w-[14px] text-gray-500" />
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              <Settings className="h-[14px] w-[14px] text-gray-500" />
            </div>

            <div className="relative px-5 pb-6 pt-5 sm:px-8">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10.5px] text-gray-500">Tuesday, October 6</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[20px] font-semibold text-gray-900 sm:text-[22px]">
                    Good evening, <span style={{ color: "#22406E" }}>Mike</span>
                    <Info className="h-3 w-3 text-gray-400" />
                  </p>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <span className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-800">
                    <CalendarDays className="h-3 w-3" />
                    Schedule
                  </span>
                  <span className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white" style={{ background: NAVY }}>
                    <Plus className="h-3 w-3" strokeWidth={2.5} />
                    New job
                  </span>
                </div>
              </div>

              {/* money cards */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className={`rounded-2xl border bg-white p-3.5 transition-colors duration-500 ${paid ? "border-green-300" : "border-[#E3E6EC]"}`}>
                  <p className="flex items-center gap-1 text-[10px] text-gray-500">
                    Collected <Info className="h-2.5 w-2.5" />
                  </p>
                  <p key={paid ? "p" : "u"} className={`text-[16px] font-semibold tabular-nums text-gray-900 sm:text-[19px] ${step === 2 ? "wb-pop" : ""}`}>
                    {money(collected)}
                  </p>
                  <p className="text-[9.5px] text-gray-500">this month</p>
                  <div className="mt-2 flex h-6 items-end gap-1.5">
                    {[3, 18, 2, 2, 4, 1].map((h, i) => (
                      <span
                        key={i}
                        className="flex-1 rounded-[2px] bg-[#3E5277] transition-all duration-700"
                        style={{ height: `${i === 4 && paid ? 22 : h}px`, opacity: i === 5 ? 0.25 : 1 }}
                      />
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#E3E6EC] bg-white p-3.5">
                  <p className="flex items-center gap-1 text-[10px] text-gray-500">
                    Outstanding <Info className="h-2.5 w-2.5" />
                  </p>
                  <p className="text-[16px] font-semibold tabular-nums text-[#D62828] sm:text-[19px]">{money(paid ? 1379.65 : 2619.65)}</p>
                  <p className="text-[9.5px] text-gray-500">{paid ? "1 client owes you" : "2 clients owe you"}</p>
                </div>
                <div className="rounded-2xl border border-[#E3E6EC] bg-white p-3.5">
                  <p className="flex items-center gap-1 text-[10px] text-gray-500">
                    Booked this week <Info className="h-2.5 w-2.5" />
                  </p>
                  <p className="text-[16px] font-semibold tabular-nums text-gray-900 sm:text-[19px]">{money(booked ? 7615 : 7295)}</p>
                  <p className="text-[9.5px] text-gray-500">{booked ? "14" : "13"} jobs scheduled</p>
                </div>
              </div>

              {/* Today + Needs you */}
              <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <p className="text-[13px] font-semibold text-gray-900">
                      Today <span className="text-[9.5px] font-normal text-gray-500">· {booked ? 5 : 4} jobs · 1 appointment</span>
                    </p>
                    <span className="text-[9.5px] font-semibold text-[#1D2E52]">Open schedule →</span>
                  </div>
                  <ul className="divide-y divide-[#EEF0F3] overflow-hidden rounded-2xl border border-[#E3E6EC] bg-white">
                    {today.map((j, i) => (
                      <li key={j.who} className="contents">
                        {i === 3 && booked && (
                          <div key={step === 1 ? "n" : "o"} className={`flex items-center gap-3 bg-[#FFF6EE] px-3.5 py-2 ${step === 1 ? "wb-row-in" : ""}`}>
                            <span className="w-9 text-right text-[10.5px] text-gray-700">1:00p</span>
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#E8ECF3]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#1D2E52]" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] font-medium text-gray-900">Rachel Moore — Panel inspection</span>
                              <span className="block text-[9.5px] text-[#E85D04]">Booked online just now</span>
                            </span>
                            <span className="text-[10.5px] font-semibold tabular-nums text-gray-900">$320.00</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 px-3.5 py-2">
                          <span className="w-9 text-right text-[10.5px] text-gray-700">{j.t}</span>
                          {j.visit ? (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#FCEFD9]">
                              <MapPin className="h-2.5 w-2.5 text-[#C98A1A]" />
                            </span>
                          ) : (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#E8ECF3]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#1D2E52]" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-medium text-gray-900">{j.who}</span>
                            <span className="block text-[9.5px] text-gray-500">{j.sub}</span>
                          </span>
                          {j.amt && <span className="text-[10.5px] font-semibold tabular-nums text-gray-900">{j.amt}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="hidden sm:block">
                  <p className="mb-2 flex items-center gap-1 text-[13px] font-semibold text-gray-900">
                    Needs you <Info className="h-3 w-3 text-gray-400" />
                  </p>
                  <ul className="divide-y divide-[#EEF0F3] overflow-hidden rounded-2xl border border-[#E3E6EC] bg-white">
                    <li className={`flex items-center gap-3 px-3.5 py-2 transition-colors duration-500 ${paid ? "bg-green-50" : ""}`}>
                      <span className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-semibold ${paid ? "bg-green-600 text-white" : "bg-[#FDE8E8] text-[#D62828]"}`}>
                        {paid ? "✓" : "1"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-medium text-gray-900">{paid ? "Invoice paid" : "Past-due invoice"}</span>
                        <span className="block text-[9.5px] text-gray-500">{paid ? `Derek Olsen · ${money(PAID)} by card` : "Send a reminder"}</span>
                      </span>
                      <span key={paid ? "pd" : "od"} className={`flex items-center gap-1 text-[9.5px] font-semibold ${paid ? "wb-pop text-green-700" : "text-[#D62828]"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${paid ? "bg-green-600" : "bg-[#D62828]"}`} />
                        {paid ? "Paid" : "Overdue"}
                      </span>
                      <ChevronRight className="h-3 w-3 text-gray-400" />
                    </li>
                    {needs.map((r) => (
                      <li key={r.a} className="flex items-center gap-3 px-3.5 py-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#E8ECF3] text-[11px] font-semibold text-[#1D2E52]">{r.n}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-medium text-gray-900">{r.a}</span>
                          <span className="block text-[9.5px] text-gray-500">{r.b}</span>
                        </span>
                        <ChevronRight className="h-3 w-3 text-gray-400" />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* the Atlas button */}
              <span className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#B98516] bg-[#E3AA2E] shadow-md">
                <Compass className="h-[18px] w-[18px] text-[#3B2A05]" strokeWidth={2.2} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* the payment notification */}
      {pinged && (
        <div className="wb-toast-in absolute -bottom-5 right-6 flex w-[300px] items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-[0_24px_50px_-16px_rgba(10,20,40,0.45)] sm:right-14">
          <WBAppIcon className="h-8 w-8 rounded-lg" />
          <span style={{ fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" }}>
            <span className="block text-[11.5px] font-semibold text-gray-900">Payment received</span>
            <span className="block text-[10.5px] text-gray-500">Derek Olsen paid invoice #2481 · {money(PAID)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
