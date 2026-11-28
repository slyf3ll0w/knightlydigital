"use client";

import PhoneTabBarMock, { type MockTab } from "@/components/wb/PhoneTabBarMock";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Briefcase,
  Building2,
  Calculator,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronsUpDown,
  DollarSign,
  FileSignature,
  FileText,
  Globe,
  Home,
  Inbox,
  LifeBuoy,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  Mic,
  MonitorSmartphone,
  PhoneCall,
  Plus,
  Receipt,
  Repeat,
  Route,
  Search,
  Settings,
  SquareKanban,
  Tag,
  Timer,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import Avatar from "@/components/Avatar";
import { resolveAccent, shade, textOn } from "@/lib/branding";
import { dsBrandVars } from "@/lib/ds-theme";
import { FONT } from "./kit";

/**
 * The real AppShell, drawn for the marketing site's app-screen demos: the
 * Live sidebar (company mark, Search, six daily drivers with what's waiting
 * beside each, the Work / Money / Business groups with the one holding the
 * page open, Help, Settings, the user) and the top bar (Search · Ctrl K, Create in the company primary,
 * Chat, bell, gear) — the same class names as components/AppShell.tsx, so
 * globals.css / ds.css paint them exactly as in the app. Brightwire
 * Electric (lib/demo-company.ts) has no logo, so the rail shows the
 * monogram tile on its primary, as the real app does.
 *
 * Two modes:
 *  - default: the chrome is zoomed down (CHROME_ZOOM) around a page area
 *    whose children are drawn at demo scale (the older demos).
 *  - `real`: everything, children included, is drawn at the app's real
 *    pixel sizes on a `designWidth`-wide desktop and zoomed to fit the
 *    container — children can use the app's own classes and sizes.
 *
 * `PhoneApp` is the phone tree (iOS large-title header, floating glass tab
 * bar) for a coded phone screen inside kit's `Phone`.
 */

export const BRAND = {
  name: "Brightwire Electric",
  user: "Mike Delgado",
  primary: "#10244A",
  secondary: "#F5B700",
} as const;

const CHROME_ZOOM = 0.74;

function tint(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `#${((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
}

const RAIL_ACCENT = resolveAccent([BRAND.primary, BRAND.secondary], "#F1F2F4", "#0A1428");

/** The CSS variables AppShell puts on its root for this company (light theme). */
export function appVars(): React.CSSProperties {
  const a = BRAND.primary;
  return {
    "--mobile-accent-light": a,
    "--mobile-on-accent-light": textOn(a),
    "--mobile-accent-soft-light": `${a}1A`,
    "--wb-accent-bright-light": tint(a, 0.14),
    "--wb-accent-light": a,
    "--wb-accent-strong-light": shade(a, 0.14),
    "--wb-on-accent-light": textOn(a),
    "--wb-ink-light": a,
    "--wb-ink-strong-light": shade(a, 0.14),
    "--wb-primary-l": a,
    "--wb-primary": a,
    "--rail-accent-l": RAIL_ACCENT,
    ...dsBrandVars(BRAND.primary, BRAND.secondary),
  } as React.CSSProperties;
}

type Item = { icon: typeof Home; label: string };
const DRIVERS: Item[] = [
  { icon: Home, label: "Home" },
  { icon: CalendarDays, label: "Schedule" },
  { icon: Users, label: "Clients" },
  { icon: FileText, label: "Quotes" },
  { icon: Briefcase, label: "Jobs" },
  { icon: Receipt, label: "Invoices" },
];
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Work",
    items: [
      { icon: SquareKanban, label: "Leads" },
      { icon: Inbox, label: "Requests" },
      { icon: Calculator, label: "Estimator tools" },
      { icon: MessageSquare, label: "Messages" },
      { icon: PhoneCall, label: "Calls" },
      { icon: CalendarClock, label: "Appointments" },
      { icon: Route, label: "Routes" },
      { icon: ListChecks, label: "Tasks" },
      { icon: FileSignature, label: "Agreements" },
      // Owners reach Timesheets through Business → Overview; only listed
      // when a demo is ON that page (a tech's rail has it here).
      { icon: Timer, label: "Timesheets" },
    ],
  },
  {
    label: "Money",
    items: [
      { icon: DollarSign, label: "Payments" },
      { icon: Repeat, label: "Recurring" },
    ],
  },
  {
    label: "Business",
    items: [
      { icon: Building2, label: "Overview" },
      { icon: Zap, label: "Automations" },
      { icon: Tag, label: "Services" },
      { icon: Globe, label: "Booking & forms" },
      { icon: MonitorSmartphone, label: "Website" },
      { icon: UserPlus, label: "Team & roles" },
    ],
  },
];

/** What the Live sidebar writes beside a page (AppShell railMeta), for Brightwire's day. */
export const LIVE_META: Record<string, string> = {
  Schedule: "5 today",
  Quotes: "3 waiting",
  Jobs: "2 to bill",
  Invoices: "$2,619 owed",
};

function NavLink({
  Icon,
  label,
  on,
  meta,
  charge = false,
}: {
  Icon: typeof Home;
  label: string;
  on: boolean;
  meta?: string;
  charge?: boolean;
}) {
  return (
    <a
      data-rail-active={on ? "true" : undefined}
      data-charge={charge ? "" : undefined}
      className={`rail-row group font-display relative mx-2 flex h-[34px] items-center gap-2.5 rounded-[9px] pl-2.5 pr-2.5 text-[13.5px] ${
        on ? "font-bold text-[color:var(--rail-ink)]" : "font-medium text-[color:var(--rail-muted)]"
      }`}
    >
      {on && (
        <span
          aria-hidden
          className="rail-indicator rail-indicator-on"
          style={{ top: 0, left: 0, right: 0, height: "100%", transform: "none", zIndex: -1 }}
        />
      )}
      <Icon
        size={18}
        strokeWidth={on ? 2.6 : 2.3}
        className={on ? "shrink-0 text-[color:var(--rail-accent)]" : "shrink-0 text-[color:var(--rail-muted)]"}
      />
      <span className="truncate">{label}</span>
      {meta && <span className="rail-meta ml-auto">{meta}</span>}
    </a>
  );
}

/**
 * The Live sidebar (AppShell, 2026-11-24), at the app's real size (256 px):
 * the company mark + name, the Search row, the six daily drivers with what's
 * waiting beside each ("5 today", "$2,619 owed"), then Work / Money /
 * Business as groups that fold (the one holding the page is open), and the
 * foot: Help, Settings, the user. The page you're on is a wash of the
 * company primary; `charge` plays the click's secondary line on that row.
 */
export function LiveRail({ nav, height, charge = false }: { nav: string; height: number; charge?: boolean }) {
  const holder = GROUPS.find((g) => g.items.some((i) => i.label === nav))?.label ?? "Work";
  return (
    <aside className="rail-gray rail-live flex shrink-0 border-r border-[color:var(--rail-line)]" style={{ height }}>
      <a className="rail-live-co">
        <span className="rail-live-mark font-display" style={{ backgroundColor: RAIL_ACCENT, color: textOn(RAIL_ACCENT) }}>
          {BRAND.name.charAt(0)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="rail-live-name">{BRAND.name}</span>
        </span>
      </a>
      <span className="rail-live-search">
        <Search size={15} strokeWidth={2.2} />
        <span className="flex-1 text-left">Search</span>
        <kbd>Ctrl K</kbd>
      </span>
      <nav className="rail-live-nav" style={{ overflow: "hidden" }}>
        {DRIVERS.map((d) => (
          <NavLink key={d.label} Icon={d.icon} label={d.label} on={d.label === nav} meta={LIVE_META[d.label]} charge={charge && d.label === nav} />
        ))}
        {GROUPS.map((g) => {
          const open = g.label === holder;
          const items = g.items.filter((i) => i.label !== "Timesheets" || nav === "Timesheets");
          return (
            <div key={g.label} className="rail-live-group">
              <span className="rail-live-ghead">
                <span>{g.label}</span>
                <ChevronDown size={14} strokeWidth={2.4} className={`rail-live-chev ${open ? "is-open" : ""}`} />
              </span>
              {open &&
                items.map((i) => (
                  <NavLink key={i.label} Icon={i.icon} label={i.label} on={i.label === nav} meta={LIVE_META[i.label]} charge={charge && i.label === nav} />
                ))}
            </div>
          );
        })}
      </nav>
      <div className="rail-live-foot">
        <span className="rail-live-row">
          <LifeBuoy size={17} strokeWidth={2.3} />
          <span className="flex-1">Help</span>
        </span>
        <span className={`rail-live-row ${nav === "Settings" ? "is-here" : ""}`}>
          <Settings size={17} strokeWidth={2.3} />
          <span className="flex-1">Settings</span>
        </span>
        <div className="rail-live-me">
          <div className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
            <Avatar name={BRAND.user} size={30} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[color:var(--rail-ink)]">{BRAND.user}</p>
              <p className="truncate text-[11.5px] text-[color:var(--rail-faint)]">Owner</p>
            </div>
            <ChevronsUpDown size={13} className="shrink-0 text-[color:var(--rail-faint)]" />
          </div>
        </div>
      </div>
    </aside>
  );
}

/** The desktop rail (kept as the name the older demos import). */
function Rail({ nav, height }: { nav: string; height: number }) {
  return <LiveRail nav={nav} height={height} />;
}

/**
 * The desktop top bar, at the app's real size (57 px): Search · Ctrl K,
 * Create in the company's CTA color, Chat, the bell, the gear. `deep`: over
 * Home's band the bar takes the band's top color with light controls
 * (app/ds-brand.css, .app-ui:has(.bb-band) .app-header).
 */
export function TopBar({ deep = false }: { deep?: boolean }) {
  const onDeep = deep
    ? {
        bar: { background: "var(--bb-deep)", borderBottomColor: "transparent" } as React.CSSProperties,
        search: { background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" } as React.CSSProperties,
        kbd: { background: "rgba(255,255,255,0.14)", borderColor: "transparent", color: "rgba(255,255,255,0.8)" } as React.CSSProperties,
        chat: { borderColor: "rgba(255,255,255,0.28)", color: "rgba(255,255,255,0.85)" } as React.CSSProperties,
        icon: { color: "rgba(255,255,255,0.75)" } as React.CSSProperties,
      }
    : null;
  return (
    <header
      className="app-header relative flex min-h-[57px] shrink-0 items-center gap-4 border-b border-gray-200 bg-chrome px-6"
      style={onDeep?.bar}
    >
      <span
        className="ml-auto flex w-full max-w-xs items-center gap-2 rounded-md border border-transparent bg-gray-100 px-3 py-1.5 text-sm text-gray-400"
        style={onDeep?.search}
      >
        <Search size={14} />
        <span>Search</span>
        <kbd className="ml-auto rounded border border-gray-200 bg-white px-1.5 py-px text-[10px] font-semibold text-gray-400" style={onDeep?.kbd}>
          Ctrl K
        </kbd>
      </span>
      <span className="flex items-center gap-1.5 rounded-full bg-green-600 px-3.5 py-1.5 text-sm font-semibold text-[color:var(--wb-on-accent,#ffffff)]">
        <Plus size={15} />
        Create
      </span>
      <span className="relative flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600" style={onDeep?.chat}>
        <MessagesSquare size={15} />
        Chat
      </span>
      <span className="relative flex rounded-md p-2 text-gray-400" style={onDeep?.icon}>
        <Bell size={17} />
      </span>
      <span className="flex rounded-md p-2 text-gray-400" style={onDeep?.icon}>
        <Settings size={17} />
      </span>
    </header>
  );
}

/** The phone header's left slot: round monogram + company name + switcher chevron. */
function PhoneTopBar() {
  return (
    <header className="app-header relative flex min-h-[57px] shrink-0 items-center gap-4 border-b border-gray-200 bg-chrome px-4">
      <div className="flex min-w-max flex-1 basis-0 items-center">
        <span className="-ml-0.5 flex h-10 items-center gap-2.5">
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--mobile-accent)] text-[13px] font-bold text-[color:var(--mobile-on-accent)] ring-1 ring-black/10">
            {BRAND.name.charAt(0)}
          </span>
          <span className="truncate text-[16px] font-bold tracking-tight text-gray-900">{BRAND.name}</span>
          <ChevronDown size={15} strokeWidth={2.6} className="shrink-0 text-gray-400" />
        </span>
      </div>
      <div className="flex min-w-max flex-1 basis-0 items-center justify-end">
        <span className="glass-control mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ color: BRAND.secondary }}>
          <Mic size={20} />
        </span>
        <span className="glass-control relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700">
          <Bell size={20} />
        </span>
        <span className="glass-control ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700">
          <Settings size={20} />
        </span>
      </div>
    </header>
  );
}

const SIDEBAR = { md: ["hidden md:block", "md:hidden"], lg: ["hidden lg:block", "lg:hidden"], xl: ["hidden xl:block", "xl:hidden"] } as const;

/** Zoom that fits a `designWidth`-wide drawing into the element's width. */
export function useFitZoom(designWidth: number, max = 1) {
  const ref = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setZ(Math.min(max, w / designWidth));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designWidth, max]);
  return { ref, z };
}

export default function WBAppFrame({
  nav,
  children,
  height = 360,
  heightSm,
  sidebarFrom = "md",
  className = "",
  real = false,
  designWidth = 1040,
  deepBar = false,
  toast,
  charge = false,
}: {
  /** The active sidebar label: "Schedule", "Quotes", "Routes", "Recurring", "Timesheets"… */
  nav: string;
  children: React.ReactNode;
  /** Height of the page area under the top bar, fixed so loops never shift the page.
   *  In `real` mode it is in the app's own pixels (before the fit zoom). */
  height?: number;
  /** Height under 640px wide, when the phone layout needs less room (default: height). */
  heightSm?: number;
  sidebarFrom?: "md" | "lg" | "xl";
  className?: string;
  /** Draw the page at the app's real sizes and zoom the whole window to fit. */
  real?: boolean;
  /** `real` mode: the width of the desktop window being drawn (rail included). */
  designWidth?: number;
  /** `real` mode: the top bar over Home's band (the band's deep color). */
  deepBar?: boolean;
  /** `real` mode: a live notification card in the top-right of the page. */
  toast?: React.ReactNode;
  /** Play the sidebar's click line on the active row. */
  charge?: boolean;
}) {
  const fit = useFitZoom(designWidth);

  if (real) {
    const z = fit.z ?? 0.6;
    return (
      <div ref={fit.ref} className={`select-none text-left ${className}`} aria-hidden>
        <div
          className="app-ui ds flex overflow-hidden rounded-xl bg-paper-plain shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-30px_rgba(10,20,40,0.5)]"
          style={{ ...appVars(), ...FONT, zoom: z, height: height + 57, opacity: fit.z === null ? 0 : 1 } as React.CSSProperties}
        >
          <LiveRail nav={nav} height={height + 57} charge={charge} />
          <div className="page-atmo relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <TopBar deep={deepBar} />
            <main className="app-main relative flex-1 overflow-hidden">{children}</main>
            {toast && <div className="pointer-events-none absolute right-6 top-[70px] z-30 w-[360px]">{toast}</div>}
          </div>
        </div>
      </div>
    );
  }

  const [asideCls, phoneBarCls] = SIDEBAR[sidebarFrom];
  const barH = Math.round(57 * CHROME_ZOOM);
  return (
    <div className={`select-none text-left ${className}`} style={FONT} aria-hidden>
      <div className="app-ui ds overflow-hidden rounded-xl bg-paper-plain shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-30px_rgba(10,20,40,0.5)]" style={appVars()}>
        <div className="flex">
          <div className={`${asideCls} flex-none overflow-hidden`} style={{ width: 256 * CHROME_ZOOM }}>
            <div style={{ zoom: CHROME_ZOOM } as React.CSSProperties}>
              <Rail nav={nav} height={Math.round((height + barH) / CHROME_ZOOM)} />
            </div>
          </div>
          <div className="page-atmo relative min-w-0 flex-1">
            <div className={asideCls} style={{ zoom: CHROME_ZOOM } as React.CSSProperties}>
              <TopBar />
            </div>
            <div className={phoneBarCls} style={{ zoom: CHROME_ZOOM } as React.CSSProperties}>
              <PhoneTopBar />
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

/**
 * The phone app (390 px wide, drawn at real size; put it inside kit's
 * `Phone` with `Fit`): the header with the company, the page, and the
 * docked tab bar with Create in the middle (components/wb/PhoneTabBarMock.tsx).
 * `tab` lights Home / Schedule / Chat / Menu (a page reached from Menu lights none).
 */
export function PhoneApp({ tab, children, height = 780 }: { tab?: MockTab; children: React.ReactNode; height?: number }) {
  return (
    <div className="app-ui ds relative flex flex-col overflow-hidden bg-paper-plain" style={{ ...appVars(), ...FONT, width: 390, height }}>
      <PhoneTopBar />
      <main className="app-main relative min-h-0 flex-1 overflow-hidden">{children}</main>
      <PhoneTabBarMock on={tab} />
    </div>
  );
}
