"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  Bell,
  Briefcase,
  Building2,
  Calculator,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Camera,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ClipboardCheck,
  DollarSign,
  Eye,
  FileSignature,
  FileText,
  Globe,
  Home,
  Inbox,
  Info,
  LifeBuoy,
  ListChecks,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Mic,
  MonitorSmartphone,
  MoreHorizontal,
  PenLine,
  Pencil,
  PhoneCall,
  Play,
  Plus,
  Receipt,
  Repeat,
  RotateCcw,
  Route as RouteGlyph,
  Search,
  Send,
  Settings,
  Square,
  SquareKanban,
  Tag,
  User,
  UserPlus,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import Avatar from "@/components/Avatar";
import StatusChip from "@/components/StatusChip";
import { AtlasMark } from "@/components/AtlasIcon";
import { dsBrandVars } from "@/lib/ds-theme";
import { shade } from "@/lib/branding";
import "./wb-open.css";

/**
 * "Win more of the work" — one job's path through WorkBench, each step on a
 * copy of the REAL app screen (2026-11-20 fidelity pass, David: "all shown
 * interfaces need to look exactly like they are in the software"). The
 * screens are drawn with the app's own classes and pieces (.app-ui + .ds,
 * the rail, StatusChip, Avatar, AtlasMark, ds-card, btn-primary, the
 * ritual overlays) at the app's real desktop size (a 1280 px window) and
 * scaled to fit, so type, spacing and color are the app's own:
 *   Request   — the booking arrives: the live "New request" card + the row
 *   Quote     — Email to client → the send ritual → Awaiting Response
 *   Approved  — the approval notice, the page refreshes Approved with the
 *               deposit paid, confetti (the app's Celebration), Convert to job
 *   Scheduled — the job lands on Thursday 9:00 on the week calendar
 *   Done      — Clock in, the clock runs, photos added, Complete job
 *   Invoiced  — Send to client → the send ritual → Awaiting Payment
 *   Paid      — "Payment received", the invoice turns Paid, confetti
 * A rail above names the step; it loops while on screen and rests on Paid
 * under reduced motion. Demo company (Brightwire Electric) only.
 *
 * The desktop chrome (AppWindow) is exported for the other coded copies of
 * the app on the site (WBLiveApp, WBTeamDemo).
 */

/* ── the demo company, as the app would theme it ─────────────────────────── */

/** Brightwire Electric (lib/demo-company.ts): no logo, so the rail shows the
 *  letter tile on the primary, exactly as AppShell does. */
export const BW = {
  name: "Brightwire Electric",
  primary: "#10244A",
  secondary: "#F5B700",
  owner: "Mike Delgado",
};

function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `#${((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
}

/** The custom properties AppShell puts on its root for this company. */
export const APP_VARS = {
  ...dsBrandVars(BW.primary, BW.secondary),
  "--wb-primary-l": BW.primary,
  "--wb-accent-bright-light": tint(BW.primary, 0.14),
  "--wb-accent-light": BW.primary,
  "--wb-accent-strong-light": shade(BW.primary, 0.14),
  "--wb-on-accent-light": "#ffffff",
  "--wb-ink-light": BW.primary,
  "--wb-ink-strong-light": shade(BW.primary, 0.14),
  "--mobile-accent-light": BW.primary,
  "--mobile-on-accent-light": "#ffffff",
  "--mobile-accent-soft-light": `${BW.primary}1A`,
} as React.CSSProperties;

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/* ── scaling: the app at its real size, fitted to the box ────────────────── */

/**
 * Renders `children` in a window of the app's real desktop size (1280 px
 * wide; 1024, the smallest desktop the app draws, in narrow boxes) and
 * scales it to the box's width. Nothing inside is interactive.
 */
export function AppCanvas({
  height,
  children,
  className = "",
}: {
  height: number;
  children: (w: number) => React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const w = box > 0 && box < 640 ? 1024 : 1280;
  const s = box ? box / w : 0;
  return (
    <div
      ref={ref}
      aria-hidden
      inert
      className={`pointer-events-none relative w-full select-none overflow-hidden rounded-xl text-left shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-30px_rgba(10,20,40,0.5)] ${className}`}
      style={s ? { height: height * s } : { aspectRatio: `1280 / ${height}` }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: w,
          height,
          transform: `scale(${s || 1})`,
          visibility: s ? undefined : "hidden",
        }}
      >
        {children(w)}
      </div>
    </div>
  );
}

/* ── the rail (components/AppShell.tsx, rail v2) ─────────────────────────── */

type NavItem = { label: string; icon: typeof Home };
const DRIVERS: NavItem[] = [
  { label: "Home", icon: Home },
  { label: "Schedule", icon: CalendarDays },
  { label: "Clients", icon: Users },
  { label: "Quotes", icon: FileText },
  { label: "Jobs", icon: Briefcase },
  { label: "Invoices", icon: Receipt },
];
const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Work",
    items: [
      { label: "Leads", icon: SquareKanban },
      { label: "Requests", icon: Inbox },
      { label: "Estimator tools", icon: Calculator },
      { label: "Messages", icon: MessageSquare },
      { label: "Calls", icon: PhoneCall },
      { label: "Appointments", icon: CalendarClock },
      { label: "Routes", icon: RouteGlyph },
      { label: "Tasks", icon: ListChecks },
      { label: "Agreements", icon: FileSignature },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Payments", icon: DollarSign },
      { label: "Recurring", icon: Repeat },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Reports", icon: Building2 },
      { label: "Automations", icon: Zap },
      { label: "Services", icon: Tag },
      { label: "Booking & forms", icon: Globe },
      { label: "Website", icon: MonitorSmartphone },
      { label: "Team & roles", icon: UserPlus },
    ],
  },
];

/** What's waiting beside a page in the Live sidebar (AppShell railMeta). */
const RAIL_META: Record<string, string> = {
  Schedule: "5 today",
  Quotes: "3 waiting",
  Jobs: "2 to bill",
  Invoices: "$2,619 owed",
};

function RailRow({
  item,
  active,
  count,
}: {
  item: NavItem;
  active: boolean;
  count?: number;
}) {
  const Icon = item.icon;
  const meta = RAIL_META[item.label];
  return (
    <a
      data-rail-active={active ? "true" : undefined}
      className={`rail-row group font-display relative mx-2 flex h-[34px] items-center gap-2.5 rounded-[9px] pl-2.5 pr-2.5 text-[13.5px] ${active ? "font-bold text-[color:var(--rail-ink)]" : "font-medium text-[color:var(--rail-muted)]"}`}
    >
      {active && (
        <span
          aria-hidden
          className="rail-indicator rail-indicator-on"
          style={{ left: 0, right: 0, height: "100%", zIndex: -1 }}
        />
      )}
      <Icon
        size={18}
        strokeWidth={active ? 2.6 : 2.3}
        className={active ? "shrink-0 text-[color:var(--rail-accent)]" : "shrink-0 text-[color:var(--rail-muted)]"}
      />
      <span className="truncate">{item.label}</span>
      {meta && <span className="rail-meta ml-auto">{meta}</span>}
      {count ? (
        <span key={count} className={`rail-count ${meta ? "ml-2" : "ml-auto"}`}>
          {count}
        </span>
      ) : null}
    </a>
  );
}

/**
 * The desktop AppShell: rail (letter tile + name, six drivers, the Work /
 * Money / Business groups — the one holding the page opens, Settings, the
 * user row) and the top bar (Search Ctrl K, Create, Chat, bell, gear), with
 * the Atlas pill bottom right. `overlay` paints over the whole window, like
 * the app's body-level rituals.
 */
export function AppWindow({
  nav,
  counts = {},
  bellDot = false,
  children,
  overlay,
  toast,
}: {
  nav: string;
  counts?: Record<string, number>;
  bellDot?: boolean;
  children: React.ReactNode;
  overlay?: React.ReactNode;
  toast?: React.ReactNode;
}) {
  return (
    <div
      className="app-ui ds relative flex h-full overflow-hidden bg-paper-plain"
      style={APP_VARS}
    >
      {/* The Live sidebar (AppShell, 2026-11-24): the company, Search, the
          six daily drivers with what's waiting beside them, then Work /
          Money / Business as open groups, Help, Settings and the user. */}
      <aside
        className="rail-gray rail-live flex shrink-0 border-r border-[color:var(--rail-line)]"
        style={{ "--rail-accent-l": BW.primary } as React.CSSProperties}
      >
        <a className="rail-live-co">
          <span className="rail-live-mark font-display" style={{ backgroundColor: BW.primary, color: "#ffffff" }}>
            B
          </span>
          <span className="min-w-0 flex-1">
            <span className="rail-live-name">{BW.name}</span>
          </span>
        </a>
        <span className="rail-live-search">
          <Search size={15} strokeWidth={2.2} />
          <span className="flex-1 text-left">Search</span>
          <kbd>Ctrl K</kbd>
        </span>
        <nav className="rail-live-nav">
          {DRIVERS.map((it) => (
            <RailRow key={it.label} item={it} active={it.label === nav} count={counts[it.label]} />
          ))}
          {GROUPS.map((g) => (
            <div key={g.label} className="rail-live-group">
              <span className="rail-live-ghead">
                <span>{g.label}</span>
                <ChevronDown size={14} strokeWidth={2.4} className="rail-live-chev is-open" />
              </span>
              {g.items.map((it) => (
                <RailRow key={it.label} item={it} active={it.label === nav} count={counts[it.label]} />
              ))}
            </div>
          ))}
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
            <div className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <Avatar name={BW.owner} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-[color:var(--rail-ink)]">{BW.owner}</p>
                <p className="truncate text-[11px] text-[color:var(--rail-faint)]">{BW.name}</p>
              </div>
              <ChevronsUpDown size={13} className="shrink-0 text-[color:var(--rail-faint)]" />
            </div>
          </div>
        </div>
      </aside>

      <div className="page-atmo relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="app-header relative flex min-h-[57px] shrink-0 items-center gap-4 border-b border-gray-200 bg-chrome px-6">
          <span className="ml-auto flex w-full max-w-xs items-center gap-2 rounded-md border border-transparent bg-gray-100 px-3 py-1.5 text-sm text-gray-400">
            <Search size={14} />
            <span>Search</span>
            <kbd className="ml-auto rounded border border-gray-200 bg-white px-1.5 py-px text-[10px] font-semibold text-gray-400">
              Ctrl K
            </kbd>
          </span>
          <span className="group flex items-center gap-1.5 rounded-full bg-green-600 px-3.5 py-1.5 text-sm font-semibold text-[color:var(--wb-on-accent,#ffffff)]">
            <Plus size={15} />
            Create
          </span>
          <span className="relative flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600">
            <MessagesSquare size={15} />
            Chat
          </span>
          <span className="relative flex rounded-md p-2 text-gray-400">
            <Bell size={17} />
            {bellDot && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            )}
          </span>
          <span className="flex rounded-md p-2 text-gray-400">
            <Settings size={17} />
          </span>
        </header>
        <main className="app-main relative flex-1 overflow-hidden bg-[color:var(--ds-surface)]">
          {children}
        </main>
        <div className="absolute bottom-6 right-6 z-40 flex items-center gap-0.5 rounded-full bg-white p-1.5 shadow-lg ring-1 ring-black/[0.06]">
          <AtlasMark size={44} accent={BW.secondary} className="block" />
          <span aria-hidden className="mx-0.5 h-6 w-px bg-gray-200" />
          <span className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500">
            <Mic size={19} strokeWidth={2.1} />
          </span>
        </div>
        {toast && (
          <div className="pointer-events-none absolute right-5 top-5 z-[70] flex w-[360px] flex-col gap-2">
            {toast}
          </div>
        )}
      </div>
      {overlay}
    </div>
  );
}

/* ── the app's own moments ───────────────────────────────────────────────── */

const LIVE_ICON = {
  request: Inbox,
  booking: CalendarClock,
  payment: DollarSign,
  quote: FileText,
  message: MessageSquare,
} as const;

/** A live notification card (components/LiveToasts.tsx, the desktop corner card). */
export function LiveCard({
  kind,
  title,
  sub,
}: {
  kind: keyof typeof LIVE_ICON;
  title: string;
  sub: string;
}) {
  const Icon = LIVE_ICON[kind];
  return (
    <div className="toast-enter sheet-material flex items-center gap-3 rounded-2xl px-3.5 py-3 shadow-xl ring-1 ring-black/5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-700">
        <Icon size={17} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[14px] font-semibold text-gray-900">
          {title}
        </span>
        <span className="block truncate text-xs text-gray-600">{sub}</span>
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500">
        <X size={15} />
      </span>
    </div>
  );
}

/** The send ritual (lib/send-ritual.ts): plane, then "On its way". */
export function SendRitual({ line }: { line: string }) {
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSent(true), 850);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      className="charge-overlay absolute inset-0 z-[90] flex items-center justify-center px-6"
      style={{
        background: "rgba(255,255,255,0.8)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div className="w-full max-w-[320px] text-center">
        {!sent ? (
          <>
            <div className="relative mx-auto h-24 w-24">
              <svg
                className="send-fly"
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16A34A"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  margin: "-17px 0 0 -17px",
                }}
              >
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            </div>
            <p className="mt-5 text-sm text-[#6B7280]">Sending…</p>
          </>
        ) : (
          <>
            <div className="charge-pop mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#16A34A]">
              <svg viewBox="0 0 48 48" className="h-12 w-12">
                <path
                  className="charge-draw"
                  d="M12 25 L21 34 L37 16"
                  fill="none"
                  stroke="white"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="mt-5 text-lg font-bold text-[#111827]">On its way</p>
            <p className="mt-1 break-all text-sm text-[#4B5563]">{line}</p>
          </>
        )}
      </div>
    </div>
  );
}

const CONFETTI = ["#22C55E", "#16A34A", "#4ADE80", "#FBBF24", "#0C0F0C"];

/** The win confetti (components/Celebration.tsx), drawn over the window. */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (
      !canvas ||
      !ctx ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w;
    canvas.height = h;
    const ps = Array.from({ length: 90 }, () => ({
      x: Math.random() * w,
      y: -20 - Math.random() * h * 0.3,
      vy: 140 + Math.random() * 160,
      sway: 25 + Math.random() * 35,
      phase: Math.random() * Math.PI * 2,
      spin: 2 + Math.random() * 4,
      size: 5 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
    }));
    const DURATION = 2800;
    const FADE = 600;
    let last = performance.now();
    const start = last;
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      const alpha =
        t > DURATION - FADE ? Math.max(0, (DURATION - t) / FADE) : 1;
      for (const p of ps) {
        p.vy = Math.min(p.vy + 220 * dt, 340);
        p.y += p.vy * dt;
        p.phase += p.spin * dt;
        p.x += Math.cos(p.phase) * p.sway * dt;
        if (p.y > h + 20) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot + Math.sin(p.phase) * 0.6);
        ctx.scale(1, 0.35 + Math.abs(Math.sin(p.phase)) * 0.65);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (t < DURATION) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 z-[95] h-full w-full"
    />
  );
}

/* ── page pieces (the app's own markup) ──────────────────────────────────── */

/** The (i) trigger, closed (components/ds/InfoTip.tsx). */
export function InfoDot() {
  return (
    <span className="relative inline-flex align-middle">
      <span className="ds-info">
        <Info size={15} strokeWidth={2.2} />
      </span>
    </span>
  );
}

/** components/PageTitle.tsx at desktop size. */
export function Title({
  children,
  info,
  sub,
  eyebrow,
}: {
  children: React.ReactNode;
  info?: boolean;
  sub?: React.ReactNode;
  /** The open header's context line above the title (PageHeader eyebrow). */
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      {eyebrow && <p className="ds-eyebrow ds-eyebrow-plain">{eyebrow}</p>}
      <h1 className="ds-title mt-1 flex items-center gap-2" style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em" }}>
        <span className="min-w-0">{children}</span>
        {info && <InfoDot />}
      </h1>
      {sub && (
        <p className="ds-small mt-1.5 max-w-prose text-[13.5px]">{sub}</p>
      )}
    </div>
  );
}

function Fact({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <div>
      <span className="block text-[12.5px] font-medium text-[color:var(--ds-muted)]">{label}</span>
      <span className={`mt-0.5 block text-[14.5px] ${tone ?? "font-medium text-[color:var(--ds-ink)]"}`}>{children}</span>
    </div>
  );
}

function Facts({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap gap-x-10 gap-y-3 border-y border-[color:var(--ds-line)] py-4 text-sm">
      {children}
    </div>
  );
}

function DetailHead({
  kind,
  status,
  title,
  client,
  actions,
}: {
  kind: "quote" | "invoice" | "job";
  status: string;
  title: string;
  client: string;
  actions: React.ReactNode;
}) {
  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-[13px] text-[color:var(--ds-muted)]">
        <span className="font-medium">{kind === "quote" ? "Quotes" : kind === "invoice" ? "Invoices" : "Jobs"}</span>
        <ChevronRight size={13} className="text-[color:var(--ds-faint)]" />
        <span>{client}</span>
        <span className="ml-1">
          <StatusChip key={status} kind={kind} status={status} />
        </span>
      </div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <Title sub={<span className="ds-link">{client}</span>}>{title}</Title>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
    </>
  );
}

function Btn({
  icon: Icon,
  children,
  pressed,
}: {
  icon: typeof Send;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <span
      className="ds-btn ds-btn-primary"
      style={pressed ? { transform: "scale(0.97)" } : undefined}
    >
      <Icon size={15} />
      {children}
    </span>
  );
}

function IconBtn({ icon: Icon }: { icon: typeof Send }) {
  return (
    <span className="ds-btn ds-btn-ghost px-2.5">
      <Icon size={17} />
    </span>
  );
}

const ROW_IN = {
  animation: "listIn 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) both",
} as React.CSSProperties;

/* ── the job the journey follows ─────────────────────────────────────────── */

export type StepKey =
  "req" | "quote" | "ok" | "sched" | "done" | "inv" | "paid";
const ALL_STEPS: {
  key: StepKey;
  label: string;
  icon: typeof Inbox;
  nav: string;
}[] = [
  { key: "req", label: "Request", icon: Inbox, nav: "Requests" },
  { key: "quote", label: "Quote", icon: FileText, nav: "Quotes" },
  { key: "ok", label: "Approved", icon: FileSignature, nav: "Quotes" },
  { key: "sched", label: "Scheduled", icon: CalendarDays, nav: "Schedule" },
  { key: "done", label: "Done", icon: ClipboardCheck, nav: "Jobs" },
  { key: "inv", label: "Invoiced", icon: Receipt, nav: "Invoices" },
  { key: "paid", label: "Paid", icon: Wallet, nav: "Invoices" },
];
const STEP_MS = 5200;

/** The job the journey follows. Trade pages pass their own (built from the
 *  trade's typical line items, lib/wb-tools.ts TRADE_TEMPLATES); the home
 *  and feature pages use Grace Kim's ceiling fans. Deposit = 25%. */
export type JourneyJob = {
  client: string;
  /** "Ceiling fan install" — the quote title. */
  title: string;
  /** Short, for the calendar block and job page: "Ceiling fans". */
  short: string;
  lines: { name: string; qty: number; unit: number }[];
};
export const DEFAULT_JOB: JourneyJob = {
  client: "Grace Kim",
  title: "Ceiling fan install",
  short: "Ceiling fans",
  lines: [
    { name: "Ceiling fan install", qty: 2, unit: 190 },
    { name: "Wiring + new fan-rated box", qty: 1, unit: 140 },
  ],
};
const JobCtx = createContext(DEFAULT_JOB);
const useJob = () => {
  const j = useContext(JobCtx);
  const total = j.lines.reduce((a, l) => a + l.qty * l.unit, 0);
  const deposit = Math.round(total * 0.25);
  const first = j.client.split(" ")[0];
  const email = `${j.client.toLowerCase().replace(/[^a-z]+/g, ".")}@gmail.com`;
  return { ...j, total, deposit, balance: total - deposit, first, email };
};

/** A beat inside a step: 0 on arrival, then 1, 2, 3 on a timer. */
function useBeat(active: boolean, times: number[]) {
  const [b, setB] = useState(0);
  useEffect(() => {
    if (!active) return;
    setB(0);
    const t = times.map((ms, k) => setTimeout(() => setB(k + 1), ms));
    return () => t.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return b;
}

/* ── the screens ─────────────────────────────────────────────────────────── */

const LIST_PAGE = "wb-open mx-auto w-full max-w-6xl px-8 pb-10 pt-8";
const DETAIL_PAGE = "wb-open mx-auto w-full max-w-6xl px-8 pb-10 pt-8";

function chip(active: boolean) {
  const base =
    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3 py-1.5 text-sm";
  return active
    ? `${base} bg-[color:var(--ds-surface)] font-semibold text-[color:var(--ds-ink)] shadow-[0_1px_2px_rgba(10,19,40,0.12)]`
    : `${base} font-medium text-[color:var(--ds-muted)]`;
}

/** The open page's underline tabs (with counts), as on every list page. */
function UTabs({ items, on = 0 }: { items: [string, number?][]; on?: number }) {
  return (
    <div className="flex items-center gap-6 border-b border-[color:var(--ds-line-strong)]">
      {items.map(([label, n], i) => (
        <span
          key={label}
          className={`relative pb-2.5 text-[14px] ${i === on ? "font-semibold text-[color:var(--ds-ink)]" : "font-medium text-[color:var(--ds-muted)]"}`}
        >
          {label}
          {n !== undefined && <span className="ml-1.5 text-[color:var(--ds-faint)]">{n}</span>}
          {i === on && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[color:var(--ds-primary)]" />}
        </span>
      ))}
    </div>
  );
}

function RequestsPage({ b }: { b: number }) {
  const job = useJob();
  const rows = [
    {
      who: "Hannah Brooks",
      what: "Smoke detectors, whole home",
      when: "Oct 25, 2026",
      status: "NEW",
    },
    {
      who: "Tom Becker",
      what: "Walkthrough for panel upgrade",
      when: "Oct 22, 2026",
      status: "CONVERTED",
    },
    {
      who: "Olivia Park",
      what: "Outlets not working in the kitchen",
      when: "Oct 19, 2026",
      status: "CONVERTED",
    },
  ];
  const list = [
    ...(b >= 1
      ? [{ who: job.client, what: job.title, when: "Just now", status: "NEW", fresh: true }]
      : []),
    ...rows.map((r) => ({ ...r, when: r.when.replace(", 2026", "") })),
  ];
  const sel = list[0];
  const fresh = "fresh" in sel;
  return (
    <div className={LIST_PAGE}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <Title eyebrow={`${b >= 1 ? 2 : 1} new · 1 needs approval`}>Requests</Title>
        <span className="ds-btn ds-btn-primary">
          <Plus size={15} />
          New request
        </span>
      </div>
      <div className="grid grid-cols-[380px_minmax(0,1fr)] gap-12">
        <div className="min-w-0">
          <UTabs items={[["New", b >= 1 ? 2 : 1], ["Open", 3], ["Converted", 2], ["Archived"]]} />
          <div className="mt-1">
            {list.map((r, i) => (
              <div
                key={r.who + r.what}
                className={`relative flex items-start gap-3 border-b border-[color:var(--ds-line)] py-3.5 ${i === 0 ? "-mx-3 rounded-[10px] border-transparent bg-[color:var(--ds-surface-2)] px-3" : ""}`}
                style={"fresh" in r ? ROW_IN : undefined}
              >
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: r.status === "NEW" ? "var(--ds-secondary)" : "transparent" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-[14.5px] text-[color:var(--ds-ink)] ${r.status === "NEW" ? "font-semibold" : "font-medium"}`}>{r.who}</span>
                    <span className="shrink-0 text-[12.5px] text-[color:var(--ds-muted)]">{r.when}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[13.5px] text-[color:var(--ds-muted)]">{r.what}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0" key={sel.who}>
          <div className="mb-2 flex items-center gap-2 text-[13px] text-[color:var(--ds-muted)]">
            <span>{fresh ? "Booked on your website" : "From your website form"}</span>
            <span>·</span>
            <span>{sel.when}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[24px] font-bold tracking-[-0.025em] text-[color:var(--ds-ink)]">{sel.who}</h2>
              <p className="mt-0.5 text-[15px] text-[color:var(--ds-ink-2)]">{sel.what}</p>
            </div>
            <StatusChip kind="request" status={sel.status} />
          </div>
          <p className="mt-5 max-w-prose text-[14.5px] leading-relaxed text-[color:var(--ds-ink-2)]">
            {fresh
              ? "Hi, we'd like two ceiling fans put in, the living room and the main bedroom. Any morning next week works."
              : "Would like someone to take a look this week if possible."}
          </p>
          <div className="mt-6 border-t border-[color:var(--ds-line-strong)]">
            {[
              ["Phone", "(469) 555-0142"],
              ["Email", fresh ? job.email : "hello@example.com"],
              ["Address", "412 Oak Ln, Plano, TX 75024"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-[color:var(--ds-line)] py-3 text-[14px]">
                <span className="text-[color:var(--ds-muted)]">{k}</span>
                <span className="font-medium text-[color:var(--ds-ink)]">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-2">
            <span className="ds-btn ds-btn-primary">
              <FileText size={15} />
              Make a quote
            </span>
            <span className="ds-btn ds-btn-outline">
              <CalendarClock size={15} />
              Schedule a visit
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LineTable({ head }: { head: string }) {
  const job = useJob();
  return (
    <div className="px-6 py-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="py-2 text-left text-xs font-semibold text-gray-500">
              {head}
            </th>
            <th className="w-16 py-2 text-right text-xs font-semibold text-gray-500">
              Qty
            </th>
            <th className="w-24 py-2 text-right text-xs font-semibold text-gray-500">
              Unit Price
            </th>
            <th className="w-24 py-2 text-right text-xs font-semibold text-gray-500">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {job.lines.map((l) => (
            <tr key={l.name}>
              <td className="py-3">
                <p className="font-medium text-gray-900">{l.name}</p>
              </td>
              <td className="ds-num py-3 text-right text-gray-600">{l.qty}</td>
              <td className="ds-num py-3 text-right text-gray-600">
                {usd(l.unit)}
              </td>
              <td className="ds-num py-3 text-right font-medium text-gray-900">
                {usd(l.qty * l.unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuoteBody() {
  const job = useJob();
  return (
    <div className="ds-card overflow-hidden">
      <div className="border-b border-gray-100 px-6 py-4">
        <p className="whitespace-pre-wrap text-sm text-gray-700">
          Thanks for having us out, {job.first}. Here is the price for the work
          we talked about.
        </p>
      </div>
      <LineTable head="Product / Service" />
      <div className="border-t border-[color:var(--ds-line)] px-6 py-4">
        <div className="ml-auto w-64 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal</span>
            <span className="ds-num text-gray-800">{usd(job.total)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-bold">
            <span className="text-gray-900">Total</span>
            <span className="ds-num text-gray-900">{usd(job.total)}</span>
          </div>
          <div className="flex justify-between text-[color:var(--ds-primary)]">
            <span>Required deposit (25%)</span>
            <span className="ds-num font-semibold">{usd(job.deposit)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Quote: Email to client → the send ritual → Awaiting Response. */
function QuotePage({ b }: { b: number }) {
  const job = useJob();
  const sent = b >= 3;
  return (
    <div className={DETAIL_PAGE}>
      <DetailHead
        kind="quote"
        status={sent ? "AWAITING_RESPONSE" : "DRAFT"}
        title={job.title}
        client={job.client}
        actions={
          <>
            {sent ? (
              <Btn icon={CheckCircle}>Mark approved</Btn>
            ) : (
              <Btn icon={Send} pressed={b === 1}>
                Email to client
              </Btn>
            )}
            <IconBtn icon={Pencil} />
            <IconBtn icon={MoreHorizontal} />
          </>
        }
      />
      <Facts>
        <Fact label="Quote #">1051</Fact>
        <Fact label="Created">Oct 26, 2026</Fact>
        {sent && (
          <Fact label="Viewed" tone="text-gray-400">
            Not viewed yet
          </Fact>
        )}
        <Fact label="Valid until">Nov 25, 2026</Fact>
        <Fact label="Required deposit" tone="font-semibold text-gray-800">
          {usd(job.deposit)}
        </Fact>
      </Facts>
      <QuoteBody />
    </div>
  );
}

/** Approved: the client approves online and pays the deposit. */
function ApprovedPage({ b }: { b: number }) {
  const job = useJob();
  const approved = b >= 2;
  const paid = b >= 3;
  return (
    <div className={DETAIL_PAGE}>
      <DetailHead
        kind="quote"
        status={approved ? "APPROVED" : "AWAITING_RESPONSE"}
        title={job.title}
        client={job.client}
        actions={
          <>
            {approved ? (
              <Btn icon={Briefcase} pressed={b >= 4}>
                Convert to job
              </Btn>
            ) : (
              <Btn icon={CheckCircle}>Mark approved</Btn>
            )}
            <IconBtn icon={Pencil} />
            <IconBtn icon={MoreHorizontal} />
          </>
        }
      />
      <Facts>
        <Fact label="Quote #">1051</Fact>
        <Fact label="Created">Oct 26, 2026</Fact>
        <Fact
          label="Viewed"
          tone="inline-flex items-center gap-1 font-medium text-green-700"
        >
          <Eye size={13} />
          Oct 26, 2026
        </Fact>
        <Fact label="Valid until">Nov 25, 2026</Fact>
        {approved ? (
          <Fact
            label="Deposit"
            tone={`font-medium ${paid ? "text-[color:var(--ds-good)]" : "text-[color:var(--ds-warn)]"}`}
          >
            {usd(job.deposit)} · {paid ? "Paid" : "Invoiced"} (#2489)
          </Fact>
        ) : (
          <Fact label="Required deposit" tone="font-semibold text-gray-800">
            {usd(job.deposit)}
          </Fact>
        )}
        {approved && <Fact label="Approved">Oct 26, 2026 by {job.client}</Fact>}
      </Facts>
      <QuoteBody />
    </div>
  );
}

/* the week calendar (app/platform/schedule TimeGrid) */
const HOUR = 48;
const FIRST_HOUR = 7;
const WEEK = [
  { d: "Sun 25", open: false },
  { d: "Mon 26", open: true, today: true },
  { d: "Tue 27", open: true },
  { d: "Wed 28", open: true },
  { d: "Thu 29", open: true },
  { d: "Fri 30", open: true },
  { d: "Sat 31", open: false },
];
const BOOKED: [number, number, number, string, string][] = [
  [1, 8, 2, "Maria Hernandez", "AC disconnect replacement"],
  [1, 13, 2, "Marcus Bell", "Pool pump circuit"],
  [2, 9, 1, "Olivia Park", "Outlet repair"],
  [2, 14, 1.5, "Hannah Brooks", "Smoke detectors"],
  [3, 10, 2, "James Whitfield", "EV charger install"],
  [4, 13, 1, "Alicia Gomez", "Garage lighting"],
  [5, 8, 1.5, "Derek Olsen", "Sub-panel for workshop"],
];
const hourLabel = (h: number) =>
  `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
const clock = (h: number) =>
  `${Math.floor(h) % 12 === 0 ? 12 : Math.floor(h) % 12}:${h % 1 ? "30" : "00"}${h < 12 ? "am" : "pm"}`;

function SchedulePage({ b }: { b: number }) {
  const job = useJob();
  const placed = b >= 2;
  const toolBtn =
    "ds-btn ds-btn-outline";
  const block = (
    day: number,
    start: number,
    len: number,
    client: string,
    title: string,
    extra?: React.CSSProperties,
  ) => (
    <div
      key={client + day}
      className="absolute overflow-hidden rounded-lg border-l-2 border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)] px-1.5 py-0.5 text-xs font-medium text-[color:var(--ds-ink)] shadow-sm"
      style={{
        top: (start - FIRST_HOUR) * HOUR + 1,
        height: len * HOUR - 2,
        left: 2,
        right: 2,
        ...extra,
      }}
    >
      <span className="block truncate font-semibold">{client}</span>
      <span className="block truncate">
        {clock(start)} · {title}
      </span>
      <span className="absolute inset-x-0 bottom-0 h-2.5">
        <span className="mx-auto mt-1 block h-0.5 w-6 rounded-full bg-current opacity-30" />
      </span>
    </div>
  );
  return (
    <div className="wb-open mx-auto max-w-6xl px-8 pb-10 pt-8">
      <div className="mb-6 flex items-end justify-between gap-2">
        <Title eyebrow={placed ? "6 jobs this week · Thursday is the busiest" : "5 jobs this week · 1 waiting to be scheduled"}>Schedule</Title>
        <div className="flex items-center gap-2">
          <span className={toolBtn}>
            <UserPlus size={16} />
            Schedule someone
            {!placed && (
              <span className="min-w-[18px] rounded-full bg-[color:var(--ds-warn-soft)] px-1 py-px text-center text-[11px] font-bold text-[color:var(--ds-warn)]">
                1
              </span>
            )}
          </span>
          <span className={toolBtn}>
            <CalendarOff size={16} />
            Block time
          </span>
          <span className="ds-btn ds-btn-ghost">
            <CalendarClock size={16} />
            New appointment
          </span>
          <span className="ds-btn ds-btn-primary">
            <Plus size={15} />
            New job
          </span>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex items-center gap-1">
          <span className="rounded-full p-2">
            <ChevronLeft size={18} className="text-gray-600" />
          </span>
          <span className="rounded-full p-2">
            <ChevronRight size={18} className="text-gray-600" />
          </span>
          <span className="btn-tool-line rounded-[10px] bg-white px-3 py-1.5 text-sm font-medium text-gray-700">
            Today
          </span>
        </div>
        <h2 className="text-lg font-bold text-gray-900">
          Oct 25 – Oct 31, 2026
        </h2>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-[10px] bg-[color:var(--ds-surface-2)] p-0.5">
          <span className={chip(false)}>Month</span>
          <span className={chip(true)}>Week</span>
          <span className={chip(false)}>Day</span>
          <span className={chip(false)}>
            <RouteGlyph size={14} />
            Map
          </span>
        </div>
      </div>
      <div className="overflow-hidden rounded-[12px] border border-[color:var(--ds-line)]">
        <div
          className="grid border-b border-gray-200"
          style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}
        >
          <div />
          {WEEK.map((c) => (
            <div
              key={c.d}
              className="border-l border-gray-100 px-1 py-2 text-center"
            >
              <div
                className={`truncate text-sm font-semibold ${c.today ? "text-[color:var(--ds-primary)]" : "text-gray-900"}`}
              >
                {c.d}
              </div>
            </div>
          ))}
        </div>
        <div
          className="grid border-b border-gray-200"
          style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}
        >
          <div className="flex items-start justify-end px-2 py-1.5">
            <span className="text-[11px] font-medium text-gray-400">
              Anytime
            </span>
          </div>
          {WEEK.map((c) => (
            <div
              key={c.d}
              className="min-h-[34px] border-l border-gray-100 p-1"
            />
          ))}
        </div>
        <div
          className="relative grid"
          style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}
        >
          <div>
            {Array.from({ length: 11 }, (_, k) => FIRST_HOUR + k).map((h) => (
              <div
                key={h}
                className="relative border-b border-gray-50"
                style={{ height: HOUR }}
              >
                <span className="absolute -top-2 right-2 bg-white px-0.5 text-[10px] text-gray-400">
                  {h === FIRST_HOUR ? "" : hourLabel(h)}
                </span>
              </div>
            ))}
          </div>
          {WEEK.map((c, day) => (
            <div
              key={c.d}
              className={`relative border-l border-gray-100 ${c.today ? "cal-today" : ""}`}
              style={{ height: 11 * HOUR }}
            >
              {c.open ? (
                <>
                  <div
                    className="cal-offhours pointer-events-none absolute inset-x-0"
                    style={{ top: 0, height: HOUR }}
                  />
                  <div
                    className="cal-offhours pointer-events-none absolute inset-x-0"
                    style={{ top: 10 * HOUR, height: HOUR }}
                  />
                </>
              ) : (
                <div className="cal-offhours pointer-events-none absolute inset-0" />
              )}
              {Array.from({ length: 11 }, (_, k) => (
                <div
                  key={k}
                  className="cal-hourline pointer-events-none absolute inset-x-0 border-b"
                  style={{ top: k * HOUR, height: HOUR }}
                >
                  <div className="cal-halfline absolute inset-x-0 top-1/2 border-b border-dashed" />
                </div>
              ))}
              {BOOKED.filter((r) => r[0] === day).map(([, s, l, who, what]) =>
                block(day, s, l, who, what),
              )}
              {day === 4 && b === 1 && (
                <div
                  className="pointer-events-none absolute left-[2px] right-[2px] z-20 overflow-visible rounded-lg border-2 border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)] px-1.5 py-0.5 text-xs font-medium text-[color:var(--ds-ink)] shadow-lg"
                  style={{ top: (9 - FIRST_HOUR) * HOUR, height: 2 * HOUR }}
                >
                  <span className="absolute -top-6 left-0 whitespace-nowrap rounded-md bg-gray-900 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow">
                    Thu 9:00am
                  </span>
                  <span className="block truncate font-semibold">
                    {job.client}
                  </span>
                </div>
              )}
              {day === 4 &&
                placed &&
                block(day, 9, 2, job.client, job.title, ROW_IN)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Job: Clock in, the clock runs, photos, Clock out, Complete job. */
function JobPage({ b }: { b: number }) {
  const job = useJob();
  const [ms, setMs] = useState(0);
  const onClock = b >= 1 && b < 5;
  useEffect(() => {
    if (b === 0) setMs(0);
    if (!onClock) return;
    const t = setInterval(
      () => setMs((m) => Math.min(m + 60000 * 3, 2 * 3600000 + 600000)),
      60,
    );
    return () => clearInterval(t);
  }, [onClock, b]);
  const dur = (v: number) => {
    const total = Math.round(v / 60000);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
  };
  const done = b >= 6;
  const photos = [
    "linear-gradient(135deg,#C9C2B6,#8F877B)",
    "linear-gradient(135deg,#B9C6D6,#6E7F95)",
    "linear-gradient(135deg,#E2DCCF,#A79F8E)",
  ];
  return (
    <div className={DETAIL_PAGE}>
      <DetailHead
        kind="job"
        status={done ? "REQUIRES_INVOICING" : "ACTIVE"}
        title={job.title}
        client={job.client}
        actions={
          done ? (
            <>
              <Btn icon={Receipt}>Create invoice</Btn>
              <IconBtn icon={MoreHorizontal} />
            </>
          ) : (
            <>
              <span className="ds-btn ds-btn-outline">
                <PenLine size={15} />
                Collect signature
              </span>
              <Btn icon={CheckCircle} pressed={b === 5}>
                Complete job
              </Btn>
              <IconBtn icon={MoreHorizontal} />
            </>
          )
        }
      />
      <Facts>
        <Fact label="Job #">318</Fact>
        <div className="min-w-0">
          <span className="block text-xs font-medium text-gray-500">
            Scheduled
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-[color:var(--ds-primary)]">
            <CalendarDays size={14} />
            Oct 29, 9:00 AM
          </span>
        </div>
      </Facts>
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-4">
          <div className="ds-card p-5">
            <h2 className="mb-4 flex items-center gap-1.5 text-[14.5px] font-semibold text-[color:var(--ds-ink)]">
              Details
            </h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CalendarDays
                  size={15}
                  className="mt-0.5 shrink-0 text-gray-400"
                />
                <p className="text-sm text-gray-800">
                  Thursday, October 29, 2026 9:00 AM – 11:00 AM
                </p>
              </div>
              <div className="flex items-start gap-3">
                <MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" />
                <p className="text-sm text-gray-800">
                  412 Oak Ln, Plano, TX 75024
                </p>
              </div>
              <div className="flex items-start gap-3">
                <User size={15} className="mt-0.5 shrink-0 text-gray-400" />
                <p className="text-sm text-gray-800">{BW.owner}</p>
              </div>
            </div>
          </div>
          <div className="card-ledger overflow-hidden">
            <div className="flex w-full items-center justify-between px-5 py-4">
              <h2 className="text-[14.5px] font-semibold text-[color:var(--ds-ink)]">
                Notes &amp; Activity
              </h2>
            </div>
            <div className="border-t border-gray-100">
              <div className="space-y-3 p-4">
                <div className="mt-2 flex gap-2">
                  <span className="h-[58px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-400">
                    Add a note…
                  </span>
                  <span className="btn-primary shrink-0 opacity-50">
                    <Send size={14} />
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="card-ledger overflow-hidden">
            <div className="flex w-full items-center justify-between px-5 py-4">
              <h2 className="text-[14.5px] font-semibold text-[color:var(--ds-ink)]">
                Photos
              </h2>
            </div>
            <div className="border-t border-gray-100 p-4">
              {b >= 2 ? (
                <div className="grid grid-cols-4 gap-2">
                  {photos.slice(0, Math.min(3, b - 1)).map((bg) => (
                    <span
                      key={bg}
                      className="aspect-square rounded-lg"
                      style={{ background: bg, ...ROW_IN }}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm font-medium text-gray-800">
                  No photos attached yet
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <span className="flex items-center gap-6 rounded-[10px] border border-gray-300 px-3 py-1.5 text-xs text-gray-800">
                  Photo <ChevronDown size={12} />
                </span>
                <span className="btn-tool-line flex items-center gap-1.5 rounded-[10px] bg-white px-3 py-1.5 text-sm font-semibold text-gray-800">
                  <Camera size={13} />
                  Add photos
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          {!done && (
            <div className="ds-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[14.5px] font-semibold text-[color:var(--ds-ink)]">
                  Time clock
                </h2>
                {b >= 5 && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    {dur(ms)} logged
                  </span>
                )}
              </div>
              {onClock ? (
                <>
                  <p className="numeral-ledger mb-3 text-2xl font-semibold tabular-nums text-gray-900">
                    {dur(ms)}
                  </p>
                  <span className="ds-btn ds-btn-lg w-full justify-center bg-[color:var(--ds-ink)] text-[color:var(--ds-surface)]">
                    <Square size={14} fill="currentColor" />
                    Clock out
                  </span>
                </>
              ) : (
                <span className="btn-primary btn-lg w-full justify-center">
                  <Play size={14} fill="currentColor" />
                  Clock in
                </span>
              )}
            </div>
          )}
          <div className="ds-card p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-[14.5px] font-semibold text-[color:var(--ds-ink)]">
              <Users size={13} />
              Team
            </h2>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-[color:var(--ds-primary)] text-white">
                <Check size={11} strokeWidth={3} />
              </span>
              {BW.owner}
            </label>
          </div>
          <div className="ds-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14.5px] font-semibold text-[color:var(--ds-ink)]">
                Billing
              </h2>
              {done && (
                <span className="ds-link text-xs font-medium">
                  + Create Invoice
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {done ? "This job is waiting to be invoiced." : "No invoice yet."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Invoice: Send to client (unpaid), or the payment arriving (paid). */
function InvoicePage({ b, paid }: { b: number; paid?: boolean }) {
  const job = useJob();
  const status = paid
    ? b >= 2
      ? "PAID"
      : "AWAITING_PAYMENT"
    : b >= 3
      ? "AWAITING_PAYMENT"
      : "DRAFT";
  const isPaid = status === "PAID";
  const balance = isPaid ? 0 : job.balance;
  return (
    <div className={DETAIL_PAGE}>
      <DetailHead
        kind="invoice"
        status={status}
        title={job.title}
        client={job.client}
        actions={
          <>
            {status === "DRAFT" && (
              <Btn icon={Send} pressed={b === 1}>
                Send to client
              </Btn>
            )}
            {status === "AWAITING_PAYMENT" && (
              <Btn icon={DollarSign}>Collect payment</Btn>
            )}
            {isPaid && (
              <span className="ds-btn ds-btn-outline">
                <RotateCcw size={13} />
                Re-open Invoice
              </span>
            )}
            <IconBtn icon={MoreHorizontal} />
          </>
        }
      />
      <Facts>
        <Fact label="Invoice #">2490</Fact>
        <Fact label="Invoice for" tone="ds-link">
          Job #318
        </Fact>
        <Fact label="From quote" tone="ds-link">
          Quote #1051
        </Fact>
        <Fact label="Issued">Oct 29, 2026</Fact>
        <Fact label="Due date">Nov 28, 2026</Fact>
        {status !== "DRAFT" &&
          (paid ? (
            <Fact
              label="Viewed"
              tone="inline-flex items-center gap-1 font-medium text-green-700"
            >
              <Eye size={13} />
              Oct 29, 2026
            </Fact>
          ) : (
            <Fact label="Viewed" tone="text-gray-400">
              Not viewed yet
            </Fact>
          ))}
        {isPaid && <Fact label="Paid">Oct 29, 2026</Fact>}
      </Facts>
      <div className="ds-card mb-6 overflow-hidden">
        <LineTable head="Line item" />
        <div className="border-t border-[color:var(--ds-line)] px-6 py-4">
          <div className="ml-auto w-64 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="ds-num text-gray-800">{usd(job.total)}</span>
            </div>
            <div className="flex justify-between text-[color:var(--ds-good)]">
              <span>Deposit applied</span>
              <span className="ds-num">−{usd(job.deposit)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-bold">
              <span className="text-gray-900">Total</span>
              <span className="ds-num text-gray-900">{usd(job.balance)}</span>
            </div>
            {isPaid && (
              <div className="flex justify-between text-[color:var(--ds-good)]">
                <span>Payments</span>
                <span className="ds-num">−{usd(job.balance)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <span className="text-gray-900">Invoice balance</span>
              <span
                className={`ds-num ${balance > 0 ? "text-gray-900" : "text-[color:var(--ds-good)]"}`}
              >
                {usd(balance)}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="ds-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-700">Payments</h2>
          {!isPaid && (
            <span className="ds-link text-xs">+ Collect Payment</span>
          )}
        </div>
        {isPaid ? (
          <div
            className="flex items-center justify-between px-5 py-3"
            style={ROW_IN}
          >
            <div>
              <p className="text-sm font-medium text-gray-900">
                Credit/debit card
              </p>
              <p className="text-xs text-gray-500">
                Oct 29, 2026 · Online payment
              </p>
            </div>
            <span className="ds-num text-sm font-semibold text-gray-900">
              {usd(job.balance)}
            </span>
          </div>
        ) : (
          <p className="px-5 py-6 text-center text-sm text-gray-500">
            No payments recorded yet.
          </p>
        )}
      </div>
    </div>
  );
}

/** One step of the journey: the page, plus the app's moment for it. */
function Step({ k, w }: { k: StepKey; w: number }) {
  const job = useJob();
  const beats: Record<StepKey, number[]> = {
    req: [900, 3600],
    quote: [1100, 1400, 3700],
    ok: [600, 1900, 3100, 4300],
    sched: [900, 2100],
    done: [700, 1500, 2100, 2700, 3500, 4100],
    inv: [1100, 1400, 3700],
    paid: [700, 1500],
  };
  const b = useBeat(true, beats[k]);
  const step = ALL_STEPS.find((s) => s.key === k)!;
  const counts: Record<string, number> = {
    Requests: k === "req" ? (b >= 1 ? 2 : 1) : 1,
  };
  let toast: React.ReactNode = null;
  let overlay: React.ReactNode = null;
  if (k === "req" && b === 1)
    toast = (
      <LiveCard
        kind="request"
        title="New request"
        sub={`${job.title} · ${job.client}`}
      />
    );
  if ((k === "quote" || k === "inv") && b === 2)
    overlay = <SendRitual line={`Emailed to ${job.email}`} />;
  if (k === "ok" && b === 1)
    toast = (
      <LiveCard
        kind="quote"
        title={`${job.client} approved Quote #1051`}
        sub={`${usd(job.total)} · deposit invoice sent`}
      />
    );
  if (k === "ok" && b === 3)
    toast = (
      <LiveCard
        kind="payment"
        title={`Payment received · ${usd(job.deposit)}`}
        sub={job.client}
      />
    );
  if (k === "ok" && b >= 2) overlay = <Confetti key="ok" />;
  if (k === "paid" && b === 1)
    toast = (
      <LiveCard
        kind="payment"
        title={`Payment received · ${usd(job.balance)}`}
        sub={job.client}
      />
    );
  if (k === "paid" && b >= 2) overlay = <Confetti key="paid" />;
  return (
    <div style={{ width: w, height: 800 }}>
      <AppWindow
        nav={step.nav}
        counts={counts}
        bellDot={Boolean(toast)}
        toast={toast}
        overlay={overlay}
      >
        {k === "req" && <RequestsPage b={b} />}
        {k === "quote" && <QuotePage b={b} />}
        {k === "ok" && <ApprovedPage b={b} />}
        {k === "sched" && <SchedulePage b={b} />}
        {k === "done" && <JobPage b={b} />}
        {k === "inv" && <InvoicePage b={b} />}
        {k === "paid" && <InvoicePage b={b} paid />}
      </AppWindow>
    </div>
  );
}

/** The step drawn finished (reduced motion): no timers, last beat. */
function StillStep({ k, w }: { k: StepKey; w: number }) {
  const step = ALL_STEPS.find((s) => s.key === k)!;
  return (
    <div style={{ width: w, height: 800 }}>
      <AppWindow nav={step.nav} counts={{ Requests: 2 }}>
        {k === "req" && <RequestsPage b={2} />}
        {k === "quote" && <QuotePage b={3} />}
        {k === "ok" && <ApprovedPage b={3} />}
        {k === "sched" && <SchedulePage b={2} />}
        {k === "done" && <JobPage b={6} />}
        {k === "inv" && <InvoicePage b={3} />}
        {k === "paid" && <InvoicePage b={2} paid />}
      </AppWindow>
    </div>
  );
}

export default function WBAppJourney({
  job = DEFAULT_JOB,
  steps: only,
}: { job?: JourneyJob; steps?: StepKey[] } = {}) {
  const STEPS = only
    ? ALL_STEPS.filter((st) => only.includes(st.key))
    : ALL_STEPS;
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [run, setRun] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      setI(STEPS.length - 1);
      return;
    }
    const io = new IntersectionObserver(([e]) => setRun(e.isIntersecting), {
      threshold: 0.3,
    });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!run) return;
    const t = setTimeout(
      () => setI((n) => (n + 1) % STEPS.length),
      i === STEPS.length - 1 ? STEP_MS + 1200 : STEP_MS,
    );
    return () => clearTimeout(t);
  }, [i, run, STEPS.length]);

  const s = STEPS[i];
  const pct = STEPS.length > 1 ? (i / (STEPS.length - 1)) * 100 : 100;

  return (
    <JobCtx.Provider value={job}>
      <div ref={ref}>
        {/* the rail */}
        <div className="relative mx-2 sm:mx-6">
          <div className="absolute left-0 right-0 top-[19px] h-[3px] rounded-full bg-[#E3E8F0]" />
          <div
            className="absolute left-0 top-[19px] h-[3px] rounded-full bg-[#F86A0A] transition-[width] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
            style={{ width: `${pct}%` }}
          />
          <ol className="relative flex justify-between">
            {STEPS.map((st, n) => {
              const StIcon = st.icon;
              return (
                <li key={st.key} className="flex w-0 flex-col items-center">
                  <button
                    type="button"
                    onClick={() => setI(n)}
                    aria-label={st.label}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,color,box-shadow,transform] duration-500 ${
                      n === i
                        ? "scale-110 bg-[#F86A0A] text-white shadow-[0_0_0_5px_rgba(248,106,10,0.18)]"
                        : n < i
                          ? "bg-[#0A1428] text-white"
                          : "bg-white text-gray-400 shadow-[0_0_0_1px_rgba(10,20,40,0.12)]"
                    }`}
                  >
                    {n < i ? (
                      <Check className="h-4 w-4" strokeWidth={3} />
                    ) : (
                      <StIcon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                    )}
                  </button>
                  <span
                    className={`mt-2.5 whitespace-nowrap text-[12px] font-bold transition-colors duration-500 max-sm:hidden sm:text-[13.5px] ${n === i ? "text-[#0A1428]" : "text-gray-500"}`}
                  >
                    {st.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* the app */}
        <div className="mt-10">
          <AppCanvas height={800}>
            {(w) =>
              still || !(run || i === 0) ? (
                <StillStep key={s.key} k={s.key} w={w} />
              ) : (
                <Step key={`${s.key}-${run}`} k={s.key} w={w} />
              )
            }
          </AppCanvas>
        </div>
      </div>
    </JobCtx.Provider>
  );
}
