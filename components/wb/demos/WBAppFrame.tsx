"use client";

import Image from "next/image";
import {
  Bell,
  Briefcase,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  FileSignature,
  FileText,
  Home,
  Inbox,
  MessagesSquare,
  Plus,
  Receipt,
  Repeat,
  Route,
  Search,
  Settings,
  Timer,
  Users,
  DollarSign,
  SquareKanban,
} from "lucide-react";
import { FONT, NAVY } from "./kit";

/**
 * The desktop app's chrome (sidebar + top bar), as in WBAppJourney / the
 * real AppShell: Home, Schedule, Clients, Quotes, Jobs, Invoices up top,
 * then the WORK / MONEY / BUSINESS groups. A page that lives in a group
 * (Routes, Agreements, Timesheets under Work; Recurring under Money) opens
 * that group with its row lit. Brightwire Electric is the one demo company.
 *
 * `sidebarFrom` picks the width where the sidebar shows (split demos pass
 * "xl" so the screen keeps its room); below it the logo moves to the top bar.
 */

const TOP = [
  { icon: Home, label: "Home" },
  { icon: CalendarDays, label: "Schedule" },
  { icon: Users, label: "Clients" },
  { icon: FileText, label: "Quotes" },
  { icon: Briefcase, label: "Jobs" },
  { icon: Receipt, label: "Invoices" },
];
const GROUPS: { label: string; items: { icon: typeof Home; label: string }[] }[] = [
  {
    label: "WORK",
    items: [
      { icon: SquareKanban, label: "Leads" },
      { icon: Inbox, label: "Requests" },
      { icon: Route, label: "Routes" },
      { icon: FileSignature, label: "Agreements" },
      { icon: Timer, label: "Timesheets" },
    ],
  },
  {
    label: "MONEY",
    items: [
      { icon: DollarSign, label: "Payments" },
      { icon: Repeat, label: "Recurring" },
    ],
  },
  { label: "BUSINESS", items: [] },
];

const SIDEBAR = { md: ["hidden md:flex", "md:hidden"], lg: ["hidden lg:flex", "lg:hidden"], xl: ["hidden xl:flex", "xl:hidden"] } as const;

export default function WBAppFrame({
  nav,
  children,
  height = 360,
  heightSm,
  sidebarFrom = "md",
  className = "",
}: {
  /** The active sidebar label: "Schedule", "Quotes", "Routes", "Recurring", "Timesheets"… */
  nav: string;
  children: React.ReactNode;
  /** Height of the page area under the top bar, fixed so loops never shift the page. */
  height?: number;
  /** Height under 640px wide, when the phone layout needs less room (default: height). */
  heightSm?: number;
  sidebarFrom?: "md" | "lg" | "xl";
  className?: string;
}) {
  const [asideCls, logoCls] = SIDEBAR[sidebarFrom];
  return (
    <div className={`select-none text-left ${className}`} style={FONT} aria-hidden>
      <div className="overflow-hidden rounded-xl bg-[#F4F5F8] shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-30px_rgba(10,20,40,0.5)]">
        <div className="flex">
          <aside className={`${asideCls} w-[168px] flex-none flex-col overflow-hidden border-r border-[#DCE1EA] bg-[#E8ECF3]`} style={{ height: height + 44 }}>
            <div className="m-2.5 flex h-[44px] flex-none items-center justify-center rounded-xl border border-[#D7DCE6] bg-white">
              <Image src="/wb/brightwire-logo.png" alt="" width={142} height={44} className="h-[26px] w-auto" />
            </div>
            <div className="mt-1 min-h-0 flex-1 overflow-hidden border-t border-[#DCE1EA] pt-2">
              {TOP.map(({ icon: Icon, label }) => (
                <NavRow key={label} Icon={Icon} label={label} on={label === nav} />
              ))}
              {GROUPS.map((g) => {
                const hit = g.items.find((it) => it.label === nav);
                return (
                  <div key={g.label}>
                    <div className="flex items-center gap-2 px-4 py-[7px] text-[8.5px] font-semibold tracking-[0.14em] text-gray-500">
                      {g.label}
                      <span className="h-px flex-1 bg-[#D3D9E3]" />
                      {hit ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </div>
                    {hit && <NavRow Icon={hit.icon} label={hit.label} on />}
                  </div>
                );
              })}
            </div>
            <div className="flex-none border-t border-[#DCE1EA] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1D2E52] text-[9.5px] font-semibold text-white">MD</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10.5px] font-semibold text-gray-900">Mike Delgado</span>
                  <span className="block truncate text-[9px] text-gray-500">Brightwire Electric</span>
                </span>
                <ChevronsUpDown className="h-3 w-3 text-gray-400" />
              </div>
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            <div className="flex h-[44px] items-center justify-end gap-2.5 border-b border-[#E4E7ED] px-4">
              <span className={`${logoCls} mr-auto flex items-center`}>
                <Image src="/wb/brightwire-logo.png" alt="" width={142} height={44} className="h-[22px] w-auto" />
              </span>
              <span className="mr-auto hidden w-[220px] items-center gap-2 rounded-lg bg-[#ECEEF2] px-3 py-1.5 text-[11px] text-gray-400 lg:flex">
                <Search className="h-3 w-3" /> Search
              </span>
              <span className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white" style={{ background: NAVY }}>
                <Plus className="h-3 w-3" strokeWidth={2.5} /> Create
              </span>
              <span className="hidden items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-800 sm:flex">
                <MessagesSquare className="h-3 w-3" /> Chat
              </span>
              <Bell className="h-[14px] w-[14px] text-gray-500" />
              <Settings className="h-[14px] w-[14px] text-gray-500" />
            </div>
            <div
              className="relative h-[var(--fhs)] overflow-hidden px-4 pt-4 sm:h-[var(--fh)] sm:px-6 sm:pt-5"
              style={{ ["--fh" as string]: `${height}px`, ["--fhs" as string]: `${heightSm ?? height}px` } as React.CSSProperties}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavRow({ Icon, label, on }: { Icon: typeof Home; label: string; on: boolean }) {
  return (
    <div className={`relative flex items-center gap-2.5 px-4 py-[7px] text-[12px] ${on ? "bg-[#D9DFEA] font-semibold text-gray-900" : "text-gray-600"}`}>
      {on && <span className="absolute inset-y-0 left-0 w-[3px] bg-[#1D2E52]" />}
      <Icon className="h-[14px] w-[14px]" strokeWidth={1.8} />
      {label}
    </div>
  );
}
