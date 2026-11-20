"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Bell,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  FileText,
  Home,
  Info,
  KeyRound,
  MessagesSquare,
  Plus,
  Receipt,
  Search,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";

/**
 * Home "Bring the whole crew" (David 2026-11-20: a section on adding users
 * and the free ones; round 2 — "make it look more like it does in app").
 * A coded copy of the app's Settings → Team page
 * (app/platform/settings/team/TeamClient.tsx) inside the same app window as
 * WBAppJourney: title "Team" with its (i), `Add team member`, the "New team
 * member" card (Full name, Email, Phone, Role + its description, `Add
 * member`), and member rows with $/hr, Bookable online, the role select, the
 * key and Deactivate. The owner adds Jess Moreno as a Tech; then the (i)
 * opens with the seats sentence the app shows (passed in from
 * lib/help/plan-copy SEATS_SENTENCE, so prices are never typed here).
 * Loops while on screen; drawn finished under reduced motion.
 */

const FONT = { fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" };
const NAVY = "#1D2E52";

type Member = { name: string; email: string; phone: string; role: string; rate: string; bookable: boolean; seen: "online" | "never"; you?: boolean; color: string };

const TEAM: Member[] = [
  { name: "Mike Delgado", email: "mike@brightwire.co", phone: "(469) 555-0142", role: "Owner", rate: "", bookable: true, seen: "online", you: true, color: "#1D2E52" },
  { name: "Sam Rivera", email: "sam@brightwire.co", phone: "(469) 555-0187", role: "Tech", rate: "32", bookable: true, seen: "online", color: "#0B57D8" },
];
const NEW: Member = { name: "Jess Moreno", email: "jess@brightwire.co", phone: "(469) 555-0119", role: "Tech", rate: "", bookable: false, seen: "never", color: "#F86A0A" };

const NAV = [
  { icon: Home, label: "Home" },
  { icon: CalendarDays, label: "Schedule" },
  { icon: Users, label: "Clients" },
  { icon: FileText, label: "Quotes" },
  { icon: Briefcase, label: "Jobs" },
  { icon: Receipt, label: "Invoices" },
];

// beats: 0 list · 1 button pressed, form opens · 2 typed · 3 role Tech · 4 Add member pressed · 5 saved row · 6 the (i) opens
const BEATS = [1500, 900, 1400, 1300, 600, 1500, 3800];
const LAST = BEATS.length - 1;

const initials = (n: string) =>
  n
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-[9.5px] text-gray-500">{label}</span>
      <span className="block h-[26px] truncate rounded-lg border border-gray-300 bg-white px-2 text-[10.5px] leading-[24px] text-gray-900">{value}</span>
    </div>
  );
}

function Row({ m, fresh }: { m: Member; fresh?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${fresh ? "wb-row-in bg-[#FFF7F0]" : ""}`}>
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ background: m.color }}>
        {initials(m.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-medium text-gray-900">
          {m.name}
          {m.you && <span className="text-[10px] text-gray-500"> (you)</span>}
        </span>
        <span className="block truncate text-[10px] text-gray-500">
          {m.email} · {m.phone}
        </span>
        <span className={`mt-0.5 flex items-center gap-1.5 text-[10px] ${m.seen === "online" ? "font-medium text-[#17803D]" : "text-gray-500"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${m.seen === "online" ? "bg-[#17A34A]" : "border border-gray-400"}`} />
          {m.seen === "online" ? "Online now" : "Never signed in"}
        </span>
      </span>
      <span className="hidden items-center gap-1 text-[10px] text-gray-600 lg:flex">
        <span className="text-gray-400">$</span>
        <span className="w-10 rounded-md border border-gray-300 px-1.5 py-1 text-[10px]">{m.rate || <span className="text-gray-400">0</span>}</span>
        <span className="text-gray-400">/hr</span>
      </span>
      <span className="hidden items-center gap-1 text-[10px] text-gray-600 xl:flex">
        <span className={`flex h-3 w-3 items-center justify-center rounded-[3px] border ${m.bookable ? "border-[#1D2E52] bg-[#1D2E52]" : "border-gray-400 bg-white"}`}>
          {m.bookable && <span className="block h-1.5 w-1.5 rounded-[1px] bg-white" />}
        </span>
        Bookable online
      </span>
      <CalendarClock className="hidden h-3.5 w-3.5 text-gray-400 sm:block" />
      <span className="flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-[10px] font-medium text-gray-700">
        {m.role}
        <ChevronDown className="h-2.5 w-2.5 text-gray-400" />
      </span>
      {!m.you && (
        <>
          <KeyRound className="hidden h-3.5 w-3.5 text-gray-400 sm:block" />
          <span className="hidden text-[10px] font-medium text-[#C0392B] sm:block">Deactivate</span>
        </>
      )}
    </div>
  );
}

export default function WBTeamDemo({ seatsSentence }: { seatsSentence: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);
  const [b, setB] = useState(LAST);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setB(0);
    const io = new IntersectionObserver(([e]) => setRun(e.isIntersecting), { threshold: 0.35 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!run) return;
    const t = setTimeout(() => setB((n) => (n + 1) % BEATS.length), BEATS[b]);
    return () => clearTimeout(t);
  }, [b, run]);

  const form = b >= 1 && b <= 4;
  const typed = b >= 2;
  const saved = b >= 5;

  return (
    <div ref={ref} className="select-none text-left" style={FONT} aria-hidden>
      <div className="overflow-hidden rounded-xl bg-[#F4F5F8] shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-30px_rgba(10,20,40,0.5)]">
        <div className="flex">
          {/* sidebar, as in the app */}
          <aside className="hidden w-[150px] flex-none flex-col border-r border-[#DCE1EA] bg-[#E8ECF3] xl:flex">
            <div className="m-2.5 flex h-[40px] items-center justify-center rounded-xl border border-[#D7DCE6] bg-white">
              <Image src="/wb/brightwire-logo.png" alt="" width={142} height={44} className="h-[22px] w-auto" />
            </div>
            <div className="mt-1 border-t border-[#DCE1EA] pt-2">
              {NAV.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2.5 px-4 py-[6px] text-[11px] text-gray-600">
                  <Icon className="h-[13px] w-[13px]" strokeWidth={1.8} />
                  {label}
                </div>
              ))}
              {["WORK", "MONEY", "BUSINESS"].map((g) => (
                <div key={g} className="flex items-center gap-2 px-4 py-[6px] text-[8px] font-semibold tracking-[0.14em] text-gray-500">
                  {g}
                  <span className="h-px flex-1 bg-[#D3D9E3]" />
                  <ChevronRight className="h-3 w-3" />
                </div>
              ))}
            </div>
            <div className="mt-auto border-t border-[#DCE1EA] px-3 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-[8.5px] font-semibold text-white" style={{ background: NAVY }}>
                  MD
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9.5px] font-semibold text-gray-900">Mike Delgado</span>
                  <span className="block text-[8.5px] text-gray-500">Brightwire Electric</span>
                </span>
                <ChevronsUpDown className="h-3 w-3 text-gray-400" />
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            {/* top bar */}
            <div className="flex h-[40px] items-center justify-end gap-2.5 border-b border-[#E4E7ED] px-4">
              <span className="mr-auto hidden w-[180px] items-center gap-2 rounded-lg bg-[#ECEEF2] px-3 py-1.5 text-[10.5px] text-gray-400 lg:flex">
                <Search className="h-3 w-3" /> Search
              </span>
              <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[10.5px] font-semibold text-white" style={{ background: NAVY }}>
                <Plus className="h-3 w-3" strokeWidth={2.5} /> Create
              </span>
              <span className="hidden items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[10.5px] font-semibold text-gray-800 sm:flex">
                <MessagesSquare className="h-3 w-3" /> Chat
              </span>
              <Bell className="h-[13px] w-[13px] text-gray-500" />
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#DDE3EE]">
                <Settings className="h-[13px] w-[13px] text-gray-800" />
              </span>
            </div>

            {/* the Team page */}
            <div className="relative h-[372px] overflow-hidden px-4 pt-4 sm:px-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="relative flex items-center gap-2">
                  <ChevronLeft className="h-4 w-4 text-gray-500" />
                  <span className="text-[17px] font-semibold text-gray-900">Team</span>
                  <Info className={`h-3.5 w-3.5 transition-colors ${b === LAST ? "text-[#1D2E52]" : "text-gray-400"}`} />
                  {/* the (i) bubble, as the app's InfoTip shows it */}
                  <span
                    className={`absolute left-6 top-7 z-20 w-[250px] rounded-lg px-3 py-2.5 text-[10.5px] leading-snug text-white shadow-[0_14px_30px_-12px_rgba(10,20,40,0.6)] transition-[opacity,transform] duration-300 ${
                      b === LAST ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
                    }`}
                    style={{ background: NAVY }}
                  >
                    {seatsSentence}
                  </span>
                </div>
                <span
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-semibold text-white transition-transform duration-150 ${b === 1 ? "scale-95" : ""}`}
                  style={{ background: NAVY }}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.4} /> Add team member
                </span>
              </div>

              {/* New team member */}
              <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${form ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="mb-3 rounded-xl border border-[#E4E7ED] bg-white p-3.5">
                    <p className="mb-2.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                      <UserPlus className="h-3 w-3" /> New team member
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Full name *" value={typed ? NEW.name : ""} />
                      <Field label="Email *" value={typed ? NEW.email : ""} />
                      <Field label="Phone" value={typed ? NEW.phone : ""} />
                      <div>
                        <span className="mb-1 block text-[9.5px] text-gray-500">Role *</span>
                        <span className="flex h-[26px] items-center justify-between rounded-lg border border-gray-300 bg-white px-2 text-[10.5px] text-gray-900">
                          {b >= 3 ? "Tech" : "Sales + Tech"}
                          <ChevronDown className="h-3 w-3 text-gray-400" />
                        </span>
                        <span className="mt-1 block truncate text-[9px] text-gray-500">
                          {b >= 3 ? "Their assigned jobs and schedule — no pricing" : "Sales and field work combined — no settings or team access"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`flex items-center rounded-full px-3 py-1.5 text-[10.5px] font-semibold text-white transition-transform duration-150 ${b === 4 ? "scale-95" : ""}`}
                        style={{ background: NAVY }}
                      >
                        Add member
                      </span>
                      <span className="px-2 text-[10.5px] font-medium text-gray-600">Cancel</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* member list */}
              <div className="divide-y divide-gray-100 rounded-xl border border-[#E4E7ED] bg-white">
                {TEAM.map((m) => (
                  <Row key={m.name} m={m} />
                ))}
                {saved && <Row m={NEW} fresh />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
