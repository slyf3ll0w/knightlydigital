"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Home,
  Briefcase,
  Bell,
  CalendarClock,
  CalendarDays,
  Users,
  Inbox,
  FileText,
  Receipt,
  Settings,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  DollarSign,
  BarChart3,
  Search,
  Globe,
  UserPlus,
  Tag,
  FileSignature,
  Repeat,
  Route as RouteGlyph,
  ChevronsUpDown,
  CircleUserRound,
  LifeBuoy,
  MessageSquare,
  MessagesSquare,
  SquareKanban,
  Timer,
  X,
  Check,
  Loader2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import SwipeBack from "@/components/SwipeBack";
import PullToRefresh from "@/components/PullToRefresh";
import ConfirmSheetHost from "@/components/ConfirmSheet";
import NotificationsSheet from "@/components/NotificationsSheet";
import { HomeFill, ScheduleFill, ChatFill, MoreFill } from "@/components/TabIcons";
import { mobileBackFor } from "@/lib/mobile-nav";
import { AtlasMark } from "@/components/AtlasIcon";
import TourGuide from "@/components/TourGuide";
import AssistantDrawer from "@/components/AssistantDrawer";
import { resolveAccent, shade, textOn } from "@/lib/branding";
import {
  SECTION_HUES,
  hueInk,
  sanitizeSectionColors,
  sectionColorVars,
} from "@/lib/section-colors";
import { hapticImpact } from "@/lib/haptics";
import { syncAppBadge } from "@/lib/badge";
import { switchToMembership } from "@/lib/company-switch";
import { WALLPAPER_PATTERNS } from "@/lib/wallpapers";
import { GOOGLE_FONT_RE } from "@/lib/booking-form";

function luminanceOf(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

/** Same accent for light surfaces (mobile tab bar / FAB / create sheet),
 *  where too-LIGHT colors disappear — those flip to console near-black. */
function surfaceAccent(hex: string): string {
  const luminance = luminanceOf(hex);
  return luminance === null || luminance > 200 ? "#0A1428" : hex;
}

/** And for DARK surfaces (dark-theme tab bar), where too-dark colors blend
 *  into the bar — those flip to white. */
function darkSurfaceAccent(hex: string): string {
  const luminance = luminanceOf(hex);
  return luminance === null || luminance < 70 ? "#FFFFFF" : hex;
}

/** Mix two hexes — `t` is the weight of `b` (0 = all a, 1 = all b). */
function mixHex(a: string, b: string, t: number): string {
  const pa = /^#?([0-9a-f]{6})$/i.exec(a);
  const pb = /^#?([0-9a-f]{6})$/i.exec(b);
  if (!pa || !pb) return a;
  const na = parseInt(pa[1], 16);
  const nb = parseInt(pb[1], 16);
  const ch = (sa: number, sb: number) => Math.round(sa + (sb - sa) * t);
  const r = ch((na >> 16) & 255, (nb >> 16) & 255);
  const g = ch((na >> 8) & 255, (nb >> 8) & 255);
  const bl = ch(na & 255, nb & 255);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Lighten toward white — the brighter sibling of shade(), so brand-colored
 *  buttons keep a visible hover shift between their 500/600 slots. */
function tint(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// Per-role visibility, mirroring lib/permissions.ts (server still enforces):
// sell = managers/USER/SALES, money = managers/USER/SALES-with-toggle (the
// toggle isn't known client-side, so SALES keeps the nav item and the page
// decides), manage = OWNER/ADMIN.
type NavItem = { href: string; label: string; icon: typeof Home; show?: (role: string) => boolean };

const isManagerRole = (r: string) => r === "OWNER" || r === "ADMIN";
const sellRoles = (r: string) => isManagerRole(r) || r === "USER" || r === "SALES";
const moneyRoles = (r: string) => isManagerRole(r) || r === "USER" || r === "SALES";

// Jobber-style grouping: Home + Schedule, then the work lifecycle in order,
// then business tools. Labeled sections read like mainstream SaaS nav.
const navGroups: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/app/dashboard", label: "Home", icon: Home },
      { href: "/app/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/app/schedule/map", label: "Routes", icon: RouteGlyph },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/app/contacts", label: "Clients", icon: Users, show: sellRoles },
      { href: "/app/requests", label: "Requests", icon: Inbox, show: sellRoles },
      { href: "/app/messages", label: "Messages", icon: MessageSquare, show: sellRoles },
      { href: "/app/leads", label: "Leads", icon: SquareKanban, show: sellRoles },
      { href: "/app/appointments", label: "Appointments", icon: CalendarClock, show: sellRoles },
      { href: "/app/quotes", label: "Quotes", icon: FileText, show: sellRoles },
      { href: "/app/contracts", label: "Agreements", icon: FileSignature, show: sellRoles },
      { href: "/app/jobs", label: "Jobs", icon: Briefcase },
      // Managers reach timesheets through the Business hub; techs/USER need
      // a direct path to their own hours.
      { href: "/app/timesheets", label: "Timesheets", icon: Timer, show: (r) => !isManagerRole(r) && r !== "SALES" },
      { href: "/app/invoices", label: "Invoices", icon: Receipt, show: moneyRoles },
      { href: "/app/payments", label: "Payments", icon: DollarSign, show: moneyRoles },
      { href: "/app/subscriptions", label: "Recurring", icon: Repeat, show: moneyRoles },
    ],
  },
  {
    label: "Business",
    items: [
      // Hub page: Insights + Team Map + Timesheets live behind one entry
      { href: "/app/business", label: "Business", icon: BarChart3, show: isManagerRole },
      { href: "/app/settings/products", label: "Services", icon: Tag, show: isManagerRole },
      { href: "/app/settings/contracts", label: "Contracts", icon: FileSignature, show: isManagerRole },
    ],
  },
];

// ── Desktop rail v2 ─────────────────────────────────────────────────────────
// Six daily drivers always visible; everything else lives in collapsible
// groups (open state remembered per user, and a group holding the active
// route is always held open). Mobile keeps `navGroups` above — the More
// sheet is its own surface and stays as-is.
const railDrivers: NavItem[] = [
  { href: "/app/dashboard", label: "Home", icon: Home },
  { href: "/app/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/app/contacts", label: "Clients", icon: Users, show: sellRoles },
  { href: "/app/quotes", label: "Quotes", icon: FileText, show: sellRoles },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase },
  { href: "/app/invoices", label: "Invoices", icon: Receipt, show: moneyRoles },
];

const railGroups: { key: string; label: string; items: NavItem[] }[] = [
  {
    key: "work",
    label: "Work",
    items: [
      { href: "/app/leads", label: "Leads", icon: SquareKanban, show: sellRoles },
      { href: "/app/requests", label: "Requests", icon: Inbox, show: sellRoles },
      { href: "/app/messages", label: "Messages", icon: MessageSquare, show: sellRoles },
      { href: "/app/appointments", label: "Appointments", icon: CalendarClock, show: sellRoles },
      { href: "/app/schedule/map", label: "Routes", icon: RouteGlyph },
      { href: "/app/contracts", label: "Agreements", icon: FileSignature, show: sellRoles },
      // Managers reach timesheets through the Business hub; techs/USER need
      // a direct path to their own hours.
      { href: "/app/timesheets", label: "Timesheets", icon: Timer, show: (r) => !isManagerRole(r) && r !== "SALES" },
    ],
  },
  {
    key: "money",
    label: "Money",
    items: [
      { href: "/app/payments", label: "Payments", icon: DollarSign, show: moneyRoles },
      { href: "/app/subscriptions", label: "Recurring", icon: Repeat, show: moneyRoles },
    ],
  },
  {
    key: "business",
    label: "Business",
    items: [
      { href: "/app/business", label: "Business", icon: BarChart3, show: isManagerRole },
      { href: "/app/settings/products", label: "Services", icon: Tag, show: isManagerRole },
      { href: "/app/settings/contracts", label: "Contracts", icon: FileSignature, show: isManagerRole },
      { href: "/app/settings/booking", label: "Forms", icon: Globe, show: isManagerRole },
      { href: "/app/settings/team", label: "Team", icon: UserPlus, show: isManagerRole },
    ],
  },
];

const createItems: NavItem[] = [
  { href: "/app/contacts/new", label: "Client", icon: Users, show: sellRoles },
  { href: "/app/contacts/new?type=lead", label: "Lead", icon: SquareKanban, show: sellRoles },
  { href: "/app/requests/new", label: "Request", icon: Inbox, show: sellRoles },
  { href: "/app/appointments/new", label: "Appointment", icon: CalendarClock, show: sellRoles },
  { href: "/app/quotes/new", label: "Quote", icon: FileText, show: sellRoles },
  { href: "/app/contracts/new", label: "Agreement", icon: FileSignature, show: sellRoles },
  { href: "/app/jobs/new", label: "Job", icon: Briefcase, show: (r) => isManagerRole(r) || r === "USER" },
  { href: "/app/invoices/new", label: "Invoice", icon: Receipt, show: moneyRoles },
  { href: "/app/payments/new", label: "Payment", icon: DollarSign, show: moneyRoles },
];

// One hue per entity so the create grid scans at a glance (identical ink
// tiles made the sheet a guessing game). Hues live in lib/section-colors.ts —
// the same palette drives page titles, filter pills, and KPI rules.
const createTints: Record<string, string> = {
  "/app/contacts/new": SECTION_HUES.clients,
  "/app/contacts/new?type=lead": SECTION_HUES.leads,
  "/app/requests/new": SECTION_HUES.requests,
  "/app/appointments/new": SECTION_HUES.schedule,
  "/app/quotes/new": SECTION_HUES.quotes,
  "/app/contracts/new": SECTION_HUES.contracts,
  "/app/jobs/new": SECTION_HUES.jobs,
  "/app/invoices/new": SECTION_HUES.invoices,
  "/app/payments/new": SECTION_HUES.payments,
};

// The same color language on navigation: More-sheet icon tiles and the
// desktop sidebar's hover/active states. Home + Settings stay neutral (and
// keep the tenant's brand accent) — everything with an entity gets its hue.
const sectionTints: Record<string, string> = {
  "/app/schedule": SECTION_HUES.schedule,
  "/app/schedule/map": SECTION_HUES.schedule,
  "/app/contacts": SECTION_HUES.clients,
  "/app/requests": SECTION_HUES.requests,
  "/app/leads": SECTION_HUES.leads,
  "/app/appointments": SECTION_HUES.schedule,
  "/app/quotes": SECTION_HUES.quotes,
  "/app/contracts": SECTION_HUES.contracts,
  "/app/jobs": SECTION_HUES.jobs,
  "/app/invoices": SECTION_HUES.invoices,
  "/app/payments": SECTION_HUES.payments,
  "/app/subscriptions": SECTION_HUES.subscriptions,
  "/app/business": SECTION_HUES.business,
  "/app/settings/products": SECTION_HUES.services,
  "/app/settings/contracts": SECTION_HUES.contracts,
  "/app/chat": SECTION_HUES.chat,
  "/app/messages": SECTION_HUES.chat,
  "/app/settings/booking": SECTION_HUES.forms,
  "/app/settings/team": SECTION_HUES.team,
};

// Tab bar: Home · Schedule · [create] · Chat · More. Everything else lives
// in the More drawer — the hamburger pattern is retired on mobile, and the
// assistant moved to a headline row in the More sheet when Chat took its
// tab (Daylight & Dusk chrome).

// iOS back control: on subpages the mobile header swaps the settings gear for
// a "‹ Section" control (the label names where you came from, like a native
// nav bar). Route map lives in lib/mobile-nav.ts — the edge-swipe-back
// gesture (components/SwipeBack.tsx) shares it.
//
// Naming it needs the route we arrived FROM, so the shell remembers the last
// pathname it rendered. Module-level (like the template's push/pop tracker)
// so it survives a shell remount, and guarded on equality so React's double
// render in dev doesn't shift the pair.
let lastPath: string | null = null;
let priorPath: string | null = null;

function trackPath(pathname: string): string | null {
  if (lastPath !== pathname) {
    priorPath = lastPath;
    lastPath = pathname;
  }
  return priorPath;
}

const forRole = (items: NavItem[], role: string) =>
  items.filter((i) => !i.show || i.show(role));

// Guided-tour anchors (components/TourGuide.tsx). Keyed by href so the
// desktop sidebar and mobile tab bar both carry them — the visible one wins.
const tourKeys: Record<string, string> = {
  "/app/requests": "nav-requests",
  "/app/quotes": "nav-quotes",
  "/app/schedule": "nav-schedule",
  "/app/invoices": "nav-invoices",
  "/app/settings/booking": "nav-forms",
  "/app/settings/team": "nav-team",
};

/**
 * Global create menu (desktop top bar). Self-contained state + ref — a shared
 * ref made the click-outside handler swallow item clicks. The button wears
 * the same accent as every page CTA (the green→accent bridge), so the
 * shell's most prominent action finally matches the product's.
 */
function CreateMenu({ role, previewMode }: { role: string; previewMode?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Invoicing + payment recording are locked pre-approval — no dead doors
  const items = forRole(createItems, role).filter(
    (i) => !previewMode || (i.href !== "/app/invoices/new" && i.href !== "/app/payments/new")
  );

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Techs can't create anything — no point showing the button
  if (items.length === 0) return null;

  return (
    <div className="relative hidden lg:block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        data-tour="create"
        className="flex items-center gap-1.5 rounded-full bg-green-600 px-3.5 py-1.5 text-sm font-semibold text-[color:var(--wb-on-accent,#ffffff)] hover:bg-green-500 transition-colors"
      >
        {/* The plus twirls into an × while the menu is open — springy overshoot */}
        <Plus
          size={15}
          className={`transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            open ? "rotate-[135deg]" : ""
          }`}
        />
        Create
      </button>
      {open && (
        <div className="anim-create-pop absolute right-0 top-full z-50 mt-1.5 w-52 card-ledger py-1.5 shadow-xl overflow-hidden">
          {/* Plain rows, neutral icons — the entity-hue tiles stay on the
              mobile create sheet, where color is wayfinding across a grid.
              A nine-row desktop list reads by label. */}
          {items.map(({ href, label, icon: Icon }, i) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              style={{ animationDelay: `${i * 25}ms` }}
              className="anim-create-item flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <Icon size={15} className="text-gray-400" strokeWidth={2} />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Bottom-of-rail identity card → upward popover. The ONE place for "who am
 * I / which company am I in": company switching, profile, help, sign out —
 * the top bar no longer carries a second avatar doing half of this job.
 * Desktop only — phones get the same links in the More sheet.
 */
function UserMenu({
  userName,
  userEmail,
  userId,
  companyName,
}: {
  userName?: string | null;
  userEmail?: string | null;
  userId?: string | null;
  companyName?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { memberships, switching, switchTo } = useMemberships(open);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative" ref={ref}>
      {open && (
        <div className="sheet-material absolute bottom-full left-2 right-2 mb-1.5 z-50 rounded-lg shadow-xl ring-1 ring-black/5 py-1.5 overflow-hidden">
          <p className="px-3.5 pb-1 pt-1.5 text-[11px] font-semibold text-gray-400">
            Your companies
          </p>
          <MembershipRows
            memberships={memberships}
            switching={switching}
            switchTo={switchTo}
            onClose={() => setOpen(false)}
            compact
          />
          <div className="my-1 border-t border-gray-100" />
          <Link
            href="/app/support"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <LifeBuoy size={14} className="text-gray-400" />
            Help &amp; Feedback
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/app/login" })}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <LogOut size={14} className="text-gray-400" />
            Sign out
          </button>
          <p className="flex items-center gap-1.5 border-t border-gray-100 mt-1 px-3.5 pt-2 pb-1 text-[10px] text-gray-400">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/workbench-icon.png" alt="" className="h-2.5 w-auto shrink-0 opacity-60" />
            Powered by WorkBench
          </p>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--rail-hover)] transition-colors text-left"
      >
        <Avatar name={userName} userId={userId} size={30} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[color:var(--rail-ink)] truncate">{userName}</p>
          <p className="text-[11px] text-[color:var(--rail-faint)] truncate">
            {companyName ?? userEmail}
          </p>
        </div>
        <ChevronsUpDown size={13} className="text-[color:var(--rail-faint)] shrink-0" />
      </button>
    </div>
  );
}

// ── Company switcher ─────────────────────────────────────────────────────────
// One login can belong to several companies (multi-company accounts). The
// top-bar profile picture opens this: a bottom sheet on phones, an anchored
// dropdown on larger screens. Switching re-points the session at the chosen
// membership and hard-reloads into its dashboard (lib/company-switch.ts).

type MembershipEntry = {
  userId: string;
  companyId: string;
  companyName: string;
  companyLogoUrl: string | null;
  role: string;
  roleLabel: string;
  current: boolean;
};

/** Lazy-loads memberships the first time the switcher opens. */
function useMemberships(open: boolean) {
  const { update } = useSession();
  const [memberships, setMemberships] = useState<MembershipEntry[] | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (!open || memberships !== null) return;
    let cancelled = false;
    fetch("/api/app/account/companies")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setMemberships((d?.companies as MembershipEntry[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) setMemberships([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, memberships]);

  async function switchTo(m: MembershipEntry) {
    if (m.current || switching) return;
    setSwitching(m.userId);
    hapticImpact("MEDIUM");
    await switchToMembership(update, m.userId);
  }

  return { memberships, switching, switchTo };
}

/** Round company mark for the mobile header — the uploaded logo in a
 *  circle, monogram on the brand accent as fallback. theme-fixed: the white
 *  logo plate must not invert in dark mode. */
function CompanyDot({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  return (
    <span className="theme-fixed relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--mobile-accent)] text-[13px] font-bold text-[color:var(--mobile-on-accent)] ring-1 ring-black/10">
      {(name.trim()[0] ?? "W").toUpperCase()}
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="theme-fixed absolute inset-0 h-full w-full bg-white object-contain p-0.5"
        />
      )}
    </span>
  );
}

/** Square logo tile with the company initial underneath as fallback. */
function CompanyTile({ name, logoUrl, size = 36 }: { name: string; logoUrl: string | null; size?: number }) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-gray-900 font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="absolute inset-0 h-full w-full bg-white object-contain" />
      )}
    </span>
  );
}

function MembershipRows({
  memberships,
  switching,
  switchTo,
  onClose,
  compact,
}: {
  memberships: MembershipEntry[] | null;
  switching: string | null;
  switchTo: (m: MembershipEntry) => void;
  onClose: () => void;
  compact?: boolean;
}) {
  const pad = compact ? "px-3.5 py-2" : "px-4 py-3";
  return (
    <>
      {memberships === null && (
        <div className={`flex items-center gap-2.5 ${pad} text-sm text-gray-400`}>
          <Loader2 size={15} className="animate-spin" />
          Loading your companies…
        </div>
      )}
      {memberships?.map((m) => (
        <button
          key={m.userId}
          onClick={() => switchTo(m)}
          disabled={Boolean(switching)}
          className={`flex w-full items-center gap-3 ${pad} text-left transition-colors ${
            m.current ? "" : "hover:bg-gray-50 active:bg-gray-50"
          } disabled:opacity-60`}
        >
          <CompanyTile name={m.companyName} logoUrl={m.companyLogoUrl} size={compact ? 30 : 36} />
          <span className="min-w-0 flex-1">
            <span className={`block truncate font-semibold text-gray-900 ${compact ? "text-sm" : "text-[15px]"}`}>
              {m.companyName}
            </span>
            <span className="block truncate text-xs text-gray-500">{m.roleLabel}</span>
          </span>
          {switching === m.userId ? (
            <Loader2 size={16} className="shrink-0 animate-spin text-gray-400" />
          ) : m.current ? (
            <Check size={16} className="shrink-0 text-green-600" strokeWidth={2.5} />
          ) : null}
        </button>
      ))}
      <div className="my-1 border-t border-gray-100" />
      <Link
        href="/app/register"
        onClick={() => {
          hapticImpact("LIGHT");
          onClose();
        }}
        className={`flex items-center gap-3 ${pad} transition-colors hover:bg-gray-50 active:bg-gray-50`}
      >
        <span
          className="flex shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-gray-300 text-gray-400"
          style={{ width: compact ? 30 : 36, height: compact ? 30 : 36 }}
        >
          <Plus size={16} />
        </span>
        <span className={`font-medium text-gray-700 ${compact ? "text-sm" : "text-[15px]"}`}>
          New company
        </span>
      </Link>
      <div className="my-1 border-t border-gray-100" />
      <Link
        href="/app/settings/profile"
        onClick={() => {
          hapticImpact("LIGHT");
          onClose();
        }}
        className={`flex items-center gap-3 ${pad} transition-colors hover:bg-gray-50 active:bg-gray-50`}
      >
        <span
          className="flex shrink-0 items-center justify-center rounded-[10px] bg-gray-100 text-gray-500"
          style={{ width: compact ? 30 : 36, height: compact ? 30 : 36 }}
        >
          <CircleUserRound size={16} />
        </span>
        <span className={`font-medium text-gray-700 ${compact ? "text-sm" : "text-[15px]"}`}>
          My Profile
        </span>
      </Link>
    </>
  );
}

/** Phone bottom sheet for the switcher — same material as the More sheet. */
function CompanySwitcherSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { memberships, switching, switchTo } = useMemberships(open);
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 lg:hidden transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`sheet-material fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col rounded-t-3xl shadow-[0_-8px_30px_rgba(28,25,23,0.18)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] lg:hidden ${
          open ? "" : "pointer-events-none translate-y-full"
        }`}
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-gray-300" />
        <p className="px-5 pb-1 pt-3 text-[13px] font-semibold text-gray-500">Your companies</p>
        <div className="overflow-y-auto px-1.5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <MembershipRows
            memberships={memberships}
            switching={switching}
            switchTo={switchTo}
            onClose={onClose}
          />
        </div>
      </div>
    </>
  );
}

interface AppShellProps {
  children: React.ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  role?: string | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  wallpaper?: string | null;
  sidebarTheme?: string | null;
  sidebarLogoColor?: string | null;
  brandColor?: string | null;
  brandColorSecondary?: string | null;
  /** Company.brandFont — app-wide Google Font override (Settings → Branding) */
  brandFont?: string | null;
  /** Company.sectionColors — per-section hue overrides (Settings → Branding) */
  sectionColors?: unknown;
  teamCount?: number;
  needsTour?: boolean;
  aiEnabled?: boolean;
  assistantName?: string | null;
  userId?: string | null;
  /** Pre-approval preview: Atlas is hidden entirely (every turn costs money);
   *  the layout banner tells users AI unlocks at approval. */
  previewMode?: boolean;
}

export default function AppShell({
  children,
  userName,
  userEmail,
  role,
  companyName,
  companyLogoUrl,
  wallpaper = "none",
  sidebarTheme,
  sidebarLogoColor,
  brandColor,
  brandColorSecondary,
  brandFont,
  sectionColors,
  teamCount = 1,
  needsTour = false,
  aiEnabled = false,
  assistantName,
  userId,
  previewMode = false,
}: AppShellProps) {
  const assistantAvailable = aiEnabled && !previewMode;
  const userRole = role ?? "OWNER";
  const manager = isManagerRole(userRole);
  // Tenant-selectable rail theme; unknown values fall back to black
  const rail = sidebarTheme === "white" || sidebarTheme === "gray" ? sidebarTheme : "black";
  const railDark = rail === "black";
  // The black rail takes the tenant PRIMARY's temperature — near-ink with a
  // whisper of their color instead of flat #121212, so the frame carries the
  // brand before any accent shows. Light rails keep their stock paper.
  const railBrandBg =
    railDark && (brandColor || brandColorSecondary)
      ? mixHex("#101318", (brandColor || brandColorSecondary) as string, 0.16)
      : undefined;
  const railBgHex =
    rail === "white" ? "#FFFFFF" : rail === "gray" ? "#F1F2F4" : railBrandBg ?? "#121212";
  // Both brand colors, one rule: SECONDARY is the accent, primary backs it
  // up, and a color that can't hold 3:1 contrast against this rail falls
  // back to the rail's guaranteed ink (lib/branding.ts resolveAccent). Two
  // resolutions — the dark-mode bridge repaints every rail near-black, so
  // the indicator accent re-resolves against that surface via CSS vars.
  const railAccent = resolveAccent(
    [brandColorSecondary, brandColor],
    railBgHex,
    railDark ? "#FFFFFF" : "#0A1428"
  );
  const railAccentDark = resolveAccent(
    [brandColorSecondary, brandColor],
    railBrandBg ?? "#1B1D22",
    "#FFFFFF"
  );
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [companySheetOpen, setCompanySheetOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Rail v2: collapsible group open-state, remembered per user (a group
  // holding the active route is additionally forced open at render, so
  // "where am I" never hides).
  const groupsKey = `wb-rail-groups:${userId ?? "shared"}`;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setOpenGroups(JSON.parse(localStorage.getItem(groupsKey) ?? "{}") ?? {});
    } catch {
      // storage blocked — groups just start collapsed
    }
  }, [groupsKey]);
  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !(prev[key] ?? false) };
      try {
        localStorage.setItem(groupsKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

  // The sliding accent bar: ONE indicator that travels to the active row
  // instead of each row painting its own. Repositioned after every render —
  // row offsets move when groups toggle or counts change size.
  const railNavRef = useRef<HTMLElement>(null);
  const railIndRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const nav = railNavRef.current;
    const ind = railIndRef.current;
    if (!nav || !ind) return;
    const el = nav.querySelector<HTMLElement>('[data-rail-active="true"]');
    if (!el) {
      ind.classList.remove("rail-indicator-on");
      return;
    }
    ind.style.transform = `translateY(${el.offsetTop + 5}px)`;
    ind.style.height = `${el.offsetHeight - 10}px`;
    ind.classList.add("rail-indicator-on");
  });

  // iOS large-title collapse: TitleSentinel (inside each PageTitle) reports
  // when the big in-page title scrolls away; the header raises a small one.
  const [headerTitle, setHeaderTitle] = useState<{ text: string; shown: boolean }>({
    text: "",
    shown: false,
  });
  useEffect(() => {
    const onTitle = (e: Event) => {
      const { title, hidden } = (e as CustomEvent<{ title: string; hidden: boolean }>).detail;
      setHeaderTitle({ text: title, shown: hidden });
    };
    window.addEventListener("wb:pagetitle", onTitle);
    return () => window.removeEventListener("wb:pagetitle", onTitle);
  }, []);
  useEffect(() => {
    setHeaderTitle((t) => ({ ...t, shown: false }));
  }, [pathname]);

  // Intro speech bubble on the assistant button — a compass alone doesn't
  // say "chat with me", so Atlas introduces himself. Reappears every few
  // days (per user), never during the welcome tour, and goes quiet for the
  // interval the moment it's shown, dismissed, or the drawer opens.
  const TEASER_EVERY_MS = 3 * 24 * 60 * 60 * 1000;
  const teaserKey = `sf-atlas-teaser:${userId ?? "shared"}`;
  const [teaserVisible, setTeaserVisible] = useState(false);
  useEffect(() => {
    if (!assistantAvailable || needsTour) return;
    let last = 0;
    try {
      last = Number(localStorage.getItem(teaserKey)) || 0;
    } catch {
      // storage blocked — skip the teaser rather than nag every load
      return;
    }
    if (Date.now() - last < TEASER_EVERY_MS) return;
    const show = setTimeout(() => {
      setTeaserVisible(true);
      try {
        localStorage.setItem(teaserKey, String(Date.now()));
      } catch {
        // ignore
      }
    }, 1500);
    const hide = setTimeout(() => setTeaserVisible(false), 21500);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantAvailable, needsTour, teaserKey]);
  useEffect(() => {
    if (assistantOpen) setTeaserVisible(false);
  }, [assistantOpen]);
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState({ requests: 0, pastDue: 0, chat: 0, leads: 0, messages: 0 });

  // Bell-dot memory: "Clear all" in the notifications sheet snapshots the
  // badge counts, and the dot only returns when a count grows PAST its
  // snapshot (something genuinely new arrived). Counts that shrink ratchet
  // the snapshot down so the next new item still fires the dot.
  const bellSnapKey = `wb-bell-snap:${userId ?? "shared"}`;
  const [bellSnap, setBellSnap] = useState<{ r: number; p: number; l: number } | null>(null);
  useEffect(() => {
    try {
      setBellSnap(JSON.parse(localStorage.getItem(bellSnapKey) ?? "null"));
    } catch {
      setBellSnap(null);
    }
  }, [bellSnapKey]);
  useEffect(() => {
    if (!bellSnap) return;
    const next = {
      r: Math.min(bellSnap.r, counts.requests),
      p: Math.min(bellSnap.p, counts.pastDue),
      l: Math.min(bellSnap.l, counts.leads),
    };
    if (next.r !== bellSnap.r || next.p !== bellSnap.p || next.l !== bellSnap.l) {
      setBellSnap(next);
      try {
        localStorage.setItem(bellSnapKey, JSON.stringify(next));
      } catch {
        // storage blocked — the dot just stays live
      }
    }
  }, [counts, bellSnap, bellSnapKey]);
  const bellDot =
    counts.requests > (bellSnap?.r ?? 0) ||
    counts.pastDue > (bellSnap?.p ?? 0) ||
    counts.leads > (bellSnap?.l ?? 0);
  const snapshotBell = () => {
    const snap = { r: counts.requests, p: counts.pastDue, l: counts.leads };
    setBellSnap(snap);
    try {
      localStorage.setItem(bellSnapKey, JSON.stringify(snap));
    } catch {
      // ignore
    }
  };

  // Auth pages render standalone even when a session cookie exists
  const isAuthPage = pathname.startsWith("/app/login") || pathname.startsWith("/app/register");

  useEffect(() => {
    setMoreOpen(false);
    setNotifsOpen(false);
  }, [pathname]);

  // Nav badges (new requests, past-due invoices) — refreshed on every
  // navigation so the counts stay honest without polling.
  useEffect(() => {
    if (isAuthPage) return;
    let cancelled = false;
    fetch("/api/app/nav-counts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !cancelled) {
          setCounts({
            requests: d.requests ?? 0,
            pastDue: d.pastDue ?? 0,
            chat: d.chat ?? 0,
            leads: d.leads ?? 0,
            messages: d.messages ?? 0,
          });
          // Native shell: mirror the actionable unreads onto the app icon
          syncAppBadge((d.requests ?? 0) + (d.chat ?? 0) + (d.messages ?? 0));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname, isAuthPage]);

  function isActive(href: string) {
    if (href === "/app/dashboard") return pathname === href;
    // Routes (/app/schedule/map) has its own nav item — don't light Schedule
    if (href === "/app/schedule") {
      return pathname.startsWith(href) && !pathname.startsWith("/app/schedule/map");
    }
    // Booking Form / Team / Services / Contracts / My Profile live under
    // /app/settings/ but have their own nav items
    if (href === "/app/settings") {
      return (
        pathname.startsWith(href) &&
        !pathname.startsWith("/app/settings/booking") &&
        !pathname.startsWith("/app/settings/team") &&
        !pathname.startsWith("/app/settings/products") &&
        !pathname.startsWith("/app/settings/contracts") &&
        !pathname.startsWith("/app/settings/profile")
      );
    }
    return pathname.startsWith(href);
  }

  const mobileBack = mobileBackFor(pathname, trackPath(pathname));
  const goBack = () => {
    if (!mobileBack) return;
    if (window.history.length > 1) router.back();
    else router.push(mobileBack.to);
  };

  if (isAuthPage) return <>{children}</>;

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) router.push(`/app/contacts?q=${encodeURIComponent(search.trim())}`);
  }

  // Live counts: new requests / unread messages (neutral), past-due
  // invoices (red — urgent). Shared by rail rows and group roll-ups.
  const badgeCount = (href: string) =>
    href === "/app/requests"
      ? counts.requests
      : href === "/app/invoices"
        ? counts.pastDue
        : href === "/app/chat"
          ? counts.chat
          : href === "/app/leads"
            ? counts.leads
            : href === "/app/messages"
              ? counts.messages
              : 0;

  // Rail v2 row: full-bleed (no rounded chip), neutral ink icon, ONE accent
  // (the sliding indicator paints it — rows carry no per-section hue), and
  // counts as right-aligned ledger numerals instead of badge pills.
  const navLink = (href: string, label: string, Icon: typeof Home, animIndex?: number) => {
    const active = isActive(href);
    const badge = badgeCount(href);
    return (
      <Link
        key={href}
        href={href}
        data-tour={tourKeys[href]}
        data-rail-active={active ? "true" : undefined}
        style={animIndex !== undefined ? { animationDelay: `${animIndex * 22}ms` } : undefined}
        className={`${animIndex !== undefined ? "rail-item-in " : ""}group font-display flex items-center gap-2.5 py-2 pl-4 pr-4 text-[13px] transition-colors ${
          active
            ? "bg-[var(--rail-active)] font-semibold text-[color:var(--rail-ink)]"
            : "font-medium text-[color:var(--rail-muted)] hover:bg-[var(--rail-hover)] hover:text-[color:var(--rail-ink)]"
        }`}
      >
        <Icon
          size={15}
          className={
            active
              ? "text-[color:var(--rail-ink)]"
              : "text-[color:var(--rail-faint)] transition-colors group-hover:text-[color:var(--rail-muted)]"
          }
        />
        <span className="truncate">{label}</span>
        {badge > 0 && (
          <span
            className={`numeral-ledger ml-auto text-[12px] font-semibold ${
              href === "/app/invoices"
                ? "text-[color:var(--rail-num-due)]"
                : "text-[color:var(--rail-num)]"
            }`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  };

  const sidebarInner = (
    <>
      {/* Rail v2: six daily drivers, then collapsible groups. Full-bleed
          rows on a calm rail — the sliding indicator is the only accent.
          Create moved to the top bar; the rail is pure navigation. */}
      <nav ref={railNavRef} className="relative flex-1 py-3 overflow-y-auto">
        <span ref={railIndRef} aria-hidden className="rail-indicator" />
        {forRole(railDrivers, userRole).map(({ href, label, icon: Icon }) =>
          navLink(href, label, Icon)
        )}
        {railGroups
          .map((g) => ({ ...g, items: forRole(g.items, userRole) }))
          .filter((g) => g.items.length > 0)
          .map((g) => {
            const open = (openGroups[g.key] ?? false) || g.items.some((i) => isActive(i.href));
            const rollup = open ? 0 : g.items.reduce((n, i) => n + badgeCount(i.href), 0);
            return (
              <div key={g.key} className="mt-2.5 border-t border-[color:var(--rail-line)] pt-1.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.key)}
                  aria-expanded={open}
                  className="w-full font-display flex items-center py-2 pl-4 pr-4 text-[12.5px] font-medium text-[color:var(--rail-faint)] hover:text-[color:var(--rail-muted)] transition-colors"
                >
                  <span className="truncate">{g.label}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {rollup > 0 && (
                      <span className="numeral-ledger text-[12px] font-semibold text-[color:var(--rail-num)]">
                        {rollup > 99 ? "99+" : rollup}
                      </span>
                    )}
                    <ChevronDown
                      size={13}
                      className={`shrink-0 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
                    />
                  </span>
                </button>
                {open && (
                  <div>
                    {g.items.map(({ href, label, icon: Icon }, i) => navLink(href, label, Icon, i))}
                  </div>
                )}
              </div>
            );
          })}

        {/* Team chat lives in the top bar on desktop (and the More sheet on
            mobile) — it's a companion to every page, not a destination */}
      </nav>

      {/* Settings + identity */}
      <div className="py-1.5 border-t border-[color:var(--rail-line)]">
        {manager && navLink("/app/settings", "Settings", Settings)}
        <UserMenu
          userName={userName}
          userEmail={userEmail}
          userId={userId}
          companyName={companyName}
        />
      </div>
    </>
  );

  // Sidebar header is the company's identity, not ours: ONE geometry — a
  // 36px mark tile + the company name on a 57px row whose hairline continues
  // the top bar's, logo or not. (The old floating logo card ignored that
  // hairline and made the rail's whole rhythm depend on whether a logo was
  // uploaded.) Uploaded logos sit on their pickable plate color; the
  // fallback monogram wears the resolved brand accent.
  const logo = (
    <div className="flex items-center gap-2.5 px-4 min-h-[57px] border-b border-[color:var(--rail-line)] min-w-0">
      {companyLogoUrl ? (
        <span
          className="theme-fixed flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[8px] ring-1 ring-[color:var(--rail-line)]"
          style={{ backgroundColor: sidebarLogoColor || "#FFFFFF" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={companyLogoUrl}
            alt={companyName ?? ""}
            className="h-full w-full object-contain p-0.5"
          />
        </span>
      ) : (
        <span
          className="w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 font-display font-bold text-sm"
          style={{ backgroundColor: railAccent, color: textOn(railAccent) }}
        >
          {companyName?.charAt(0).toUpperCase() ?? "W"}
        </span>
      )}
      <span className="font-display font-semibold text-[14px] tracking-tight text-[color:var(--rail-ink)] truncate">
        {companyName ?? "WorkBench"}
      </span>
    </div>
  );

  // Tenant brand color → per-theme mobile accent tokens (globals.css holds
  // the WorkBench-blue defaults; CSS resolves light vs dark, so the
  // active tab / create button read on BOTH bars).
  const rawBrand = brandColorSecondary || brandColor || null;
  const lightAccent = rawBrand ? surfaceAccent(rawBrand) : null;
  const darkAccent = rawBrand ? darkSurfaceAccent(rawBrand) : null;
  const mobileAccentVars =
    rawBrand && lightAccent && darkAccent
      ? ({
          "--mobile-accent-light": lightAccent,
          "--mobile-on-accent-light": textOn(lightAccent),
          "--mobile-accent-soft-light": `${lightAccent}1A`,
          "--mobile-accent-dark": darkAccent,
          "--mobile-on-accent-dark": textOn(darkAccent),
          "--mobile-accent-soft-dark": `${darkAccent}24`,
          // Solid primary buttons app-wide (the green→accent bridge in
          // globals.css): 500/600/700 slots as bright/base/pressed.
          "--wb-accent-bright-light": tint(lightAccent, 0.14),
          "--wb-accent-light": lightAccent,
          "--wb-accent-strong-light": shade(lightAccent, 0.14),
          "--wb-on-accent-light": textOn(lightAccent),
          "--wb-accent-bright-dark": tint(darkAccent, 0.14),
          "--wb-accent-dark": darkAccent,
          "--wb-accent-strong-dark": shade(darkAccent, 0.14),
          "--wb-on-accent-dark": textOn(darkAccent),
          // Accent as ink (links/icons/tints). Dark ink runs brighter, like
          // the default #0B57D8 → #3B82F6 step.
          "--wb-ink-light": lightAccent,
          "--wb-ink-strong-light": shade(lightAccent, 0.14),
          "--wb-ink-dark": tint(darkAccent, 0.2),
          "--wb-ink-strong-dark": tint(darkAccent, 0.38),
        } as React.CSSProperties)
      : undefined;

  // PRIMARY brand color = structural ink (surfaces/frame/tool hardware),
  // mirroring the client-facing split where primary drives headers and
  // secondary drives buttons. Falls back to the secondary so single-color
  // companies stay cohesive; unset = WorkBench console navy.
  const rawPrimary = brandColor || brandColorSecondary || null;
  const primaryVars = rawPrimary
    ? (() => {
        // Light surfaces: near-white primaries flip to navy. Dark surfaces:
        // near-black primaries lift toward slate instead of vanishing.
        const lightPrimary = surfaceAccent(rawPrimary);
        const darkPrimary =
          (luminanceOf(rawPrimary) ?? 0) < 70 ? tint(rawPrimary, 0.4) : rawPrimary;
        return {
          "--wb-primary-l": lightPrimary,
          "--wb-primary-d": darkPrimary,
          // Tool hardware (chip-tool/card-tool/btn-tool outlines + hard
          // offsets): a deep-primary ink instead of stock console navy —
          // mostly primary, with just enough navy to keep pale picks
          // readable; the dark half tints the translucent line/offset —
          // offsets must stay light like the lines or they vanish on the
          // dark canvas.
          "--tool-line-l": mixHex(lightPrimary, "#0a1428", 0.25),
          "--tool-shadow-l": mixHex(lightPrimary, "#0a1428", 0.25),
          "--tool-line-d": hexToRgba(tint(darkPrimary, 0.35), 0.45),
          "--tool-shadow-d": hexToRgba(tint(darkPrimary, 0.35), 0.45),
        } as React.CSSProperties;
      })()
    : undefined;

  // Custom section colors (Settings → Branding → Section colors): four
  // theme-guarded vars per overridden section; defaults live in globals.css.
  const sectionVars = sectionColorVars(sanitizeSectionColors(sectionColors));

  // App-wide brand font (Settings → Branding): any Google Font, loaded on the
  // fly exactly like the booking forms do. Overrides body + display vars on
  // the shell root; .numeral-ledger and .stamp pin Oxanium explicitly in
  // globals.css, so ledger numerals keep their character.
  const appFont = brandFont && GOOGLE_FONT_RE.test(brandFont) ? brandFont : null;
  const fontHref = appFont
    ? `https://fonts.googleapis.com/css2?family=${appFont.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`
    : null;
  const fontVars = appFont
    ? ({
        "--font-body": `"${appFont}", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
        "--font-sans": `"${appFont}", "Oxanium", sans-serif`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      className="app-ui flex h-screen bg-paper-plain overflow-hidden"
      style={{ ...(mobileAccentVars ?? {}), ...(primaryVars ?? {}), ...sectionVars, ...(fontVars ?? {}) } as React.CSSProperties}
    >
      {fontHref && (
        <>
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="stylesheet" href={fontHref} />
        </>
      )}
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside
        className={`hidden lg:flex flex-col w-[232px] shrink-0 rail-${rail}`}
        style={
          {
            "--rail-accent-l": railAccent,
            "--rail-accent-d": railAccentDark,
            ...(railBrandBg ? { "--rail-bg": railBrandBg } : {}),
          } as React.CSSProperties
        }
      >
        {logo}
        {sidebarInner}
      </aside>

      {/* ── Mobile "More" sheet — grouped native list, replaces the old
             black sidebar drawer on phones ──────────────────────────────── */}
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        role={userRole}
        counts={counts}
        teamCount={teamCount}
        userName={userName}
        userEmail={userEmail}
        userId={userId}
        isActive={isActive}
        aiEnabled={assistantAvailable}
        assistantName={assistantName || "Atlas"}
        assistantAccent={brandColorSecondary || brandColor || undefined}
        openAssistant={() => setAssistantOpen(true)}
      />

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Optional company wallpaper — pinned behind every page (it doesn't
            scroll with the content). Either the huge logo watermark (tilted
            or straight) or one of the .wp-* patterns from globals.css
            (lib/wallpapers.ts). The header paints over its own strip;
            <main> is transparent. */}
        {(wallpaper === "logo" || wallpaper === "logo-straight") && companyLogoUrl && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={companyLogoUrl}
              alt=""
              className={`logo-wallpaper max-w-none shrink-0 object-contain ${
                wallpaper === "logo" ? "w-[120%] rotate-45" : "w-[85%] max-h-[80%]"
              }`}
            />
          </div>
        )}
        {wallpaper && (WALLPAPER_PATTERNS as readonly string[]).includes(wallpaper) && (
          <div aria-hidden className={`wp-layer wp-${wallpaper} pointer-events-none absolute inset-0`} />
        )}
        {/* Top bar */}
        <header className="app-header relative flex items-center gap-4 px-4 lg:px-6 min-h-[57px] pt-[env(safe-area-inset-top)] border-b border-gray-200 bg-chrome shrink-0">
          {/* Ledger margin rule — both brand colors meet on the app frame:
              primary (structure) running into secondary (accent). Desktop
              only: the phone header is clear, no line. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -bottom-px hidden h-[2.5px] lg:block"
            style={{ background: "linear-gradient(90deg, var(--wb-primary), var(--wb-accent))" }}
          />
          {/* Mobile header, left slot: an iOS "‹ Section" back control on
              subpages; at the top level it's the company's identity — round
              logo, name, and a switcher chevron (the ClickWise header). The
              hamburger is retired — the More tab opens the drawer. */}
          {mobileBack ? (
            <button
              type="button"
              onClick={() => {
                hapticImpact("LIGHT");
                goBack();
              }}
              aria-label={`Back to ${mobileBack.label}`}
              className="lg:hidden -ml-2 flex h-9 min-w-0 shrink items-center pr-1 text-[color:var(--mobile-accent)] active:opacity-50 transition-opacity"
            >
              <ChevronLeft size={27} strokeWidth={2.1} className="-mr-0.5 shrink-0" />
              <span className="truncate text-[16px] font-medium">{mobileBack.label}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                hapticImpact("LIGHT");
                setCompanySheetOpen(true);
              }}
              aria-label="Switch company"
              className="lg:hidden -ml-0.5 flex h-10 min-w-0 max-w-[52%] shrink items-center gap-2.5 active:opacity-60 transition-opacity"
            >
              <CompanyDot name={companyName ?? "WorkBench"} logoUrl={companyLogoUrl} />
              <span className="truncate text-[16px] font-bold tracking-tight text-gray-900">
                {companyName ?? "WorkBench"}
              </span>
              <ChevronDown size={15} strokeWidth={2.6} className="shrink-0 text-gray-400" />
            </button>
          )}

          {/* Recent notifications — bare bell icon, red dot when anything
              needs a look (requests / past-due / new leads). Chat moved to
              the tab bar; settings keep their gear next door. */}
          <button
            type="button"
            onClick={() => {
              hapticImpact("LIGHT");
              setNotifsOpen(true);
            }}
            aria-label="Notifications"
            className="lg:hidden ml-auto relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-600 active:bg-gray-100 transition-colors"
          >
            <Bell size={21} />
            {bellDot && (
              <span className="absolute right-1 top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
            )}
          </button>
          <Link
            href={manager ? "/app/settings" : "/app/settings/profile"}
            onClick={() => hapticImpact("LIGHT")}
            aria-label={manager ? "Settings" : "My Profile"}
            className="lg:hidden -ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-600 active:bg-gray-100 transition-colors"
          >
            <Settings size={21} />
          </Link>

          {/* Desktop left slot: the page's title rises into the bar once the
              in-page h1 scrolls away (the iOS collapse, at a desk) — context
              without duplicating the heading that's already on the page. */}
          <div className="hidden lg:flex min-w-0 flex-initial items-center" aria-hidden>
            <span
              className={`truncate font-display text-[15px] font-semibold text-gray-900 transition-all duration-200 ${
                headerTitle.shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              }`}
            >
              {headerTitle.text}
            </span>
          </div>

          <form
            onSubmit={onSearch}
            className={`ml-auto w-full max-w-xs ${sellRoles(userRole) ? "hidden sm:block" : "hidden"}`}
          >
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients..."
                className="w-full pl-8 pr-3 py-1.5 bg-gray-100 hover:bg-gray-50 border border-transparent focus:border-gray-300 focus:bg-white rounded-md text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none transition-colors"
              />
            </div>
          </form>

          {/* Global create — the page-level CTA color, one click from
              anywhere (the rail is pure navigation now) */}
          <CreateMenu role={userRole} previewMode={previewMode} />

          {/* Team chat — always one click away without spending sidebar space.
              Shown even for solo companies: the chat page nudges them to add
              a teammate, and hiding it entirely read as "chat is gone". */}
          <Link
            href="/app/chat"
            className={`hidden lg:flex relative items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive("/app/chat")
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            } ${sellRoles(userRole) ? "" : "ml-auto"}`}
            title="Team chat"
          >
            <MessagesSquare size={15} />
            Chat
            {counts.chat > 0 && (
              <span
                className={`numeral-ledger text-[12px] font-semibold ${
                  isActive("/app/chat") ? "text-red-300" : "text-red-600"
                }`}
              >
                {counts.chat > 99 ? "99+" : counts.chat}
              </span>
            )}
          </Link>

          {/* Desktop notifications — the bell finally exists at a desk (it
              was phone-only chrome before). Same sheet, anchored top-right. */}
          <button
            type="button"
            onClick={() => setNotifsOpen(true)}
            aria-label="Notifications"
            className="hidden lg:flex relative p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            <Bell size={17} />
            {bellDot && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>

          <Link
            href={manager ? "/app/settings" : "/app/settings/profile"}
            className="hidden lg:flex p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            title={manager ? "Settings" : "My Profile"}
          >
            <Settings size={17} />
          </Link>

          {/* Collapsed large title — fades up into the blurred bar once the
              in-page title scrolls away (iOS nav-bar behavior). Bottom-anchored
              so the safe-area inset above never offsets it. */}
          <span
            aria-hidden
            className="lg:hidden pointer-events-none absolute inset-x-0 bottom-0 flex h-[57px] items-center justify-center"
          >
            <span
              className={`max-w-[55%] truncate text-[16px] font-semibold text-gray-900 transition-all duration-200 ${
                headerTitle.shown ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0"
              }`}
            >
              {headerTitle.text}
            </span>
          </span>
        </header>

        {/* Pull-to-refresh spinner sits in the canvas gap that opens when
            <main> is dragged down (main's background is transparent) */}
        <PullToRefresh mainRef={mainRef} />

        {/* Scrollable content */}
        <main
          ref={mainRef}
          className="app-main relative flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0"
        >
          {children}
        </main>
        <SwipeBack
          enabled={mobileBack !== null}
          mainRef={mainRef}
          onBack={goBack}
          onForward={() => router.forward()}
          pathname={pathname}
        />
      </div>

      {/* Mobile confirm sheet — imperative host for confirmSheet() */}
      <ConfirmSheetHost />

      {/* Phone company switcher — outside the header (its backdrop-filter
          would otherwise trap this fixed sheet) */}
      <CompanySwitcherSheet open={companySheetOpen} onClose={() => setCompanySheetOpen(false)} />

      {/* Recent notifications — behind the header bell */}
      <NotificationsSheet
        open={notifsOpen}
        onClose={() => setNotifsOpen(false)}
        userId={userId}
        onClearAll={snapshotBell}
      />

      <MobileTabBar
        role={userRole}
        isActive={isActive}
        pastDue={counts.pastDue}
        chatUnread={counts.chat}
        openMore={() => setMoreOpen(true)}
        previewMode={previewMode}
      />

      {/* Assistant bubble — floats above the mobile tab bar, hides while open */}
      {assistantAvailable && !assistantOpen && (
        <>
          {teaserVisible && (
            <div className="atlas-teaser-pop theme-fixed fixed bottom-[92px] right-6 z-40 hidden w-[264px] rounded-2xl rounded-br-md border border-gray-200 bg-white p-3.5 pr-8 shadow-xl lg:block">
              <button
                type="button"
                onClick={() => {
                  hapticImpact("LIGHT");
                  setAssistantOpen(true);
                }}
                className="block w-full text-left"
              >
                <p className="text-sm font-semibold text-gray-900">
                  Hi, I&apos;m {assistantName || "Atlas"} 👋
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                  Ask me anything about your business — or tell me what to do and I&apos;ll
                  handle it.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTeaserVisible(false)}
                aria-label="Dismiss"
                className="absolute right-1.5 top-1.5 rounded-md p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={13} />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              hapticImpact("LIGHT");
              setAssistantOpen(true);
            }}
            aria-label="Open assistant"
            title={assistantName || "Atlas"}
            className="fixed z-40 hidden lg:block rounded-full shadow-lg transition-transform hover:scale-105 lg:bottom-6 lg:right-6"
          >
            <AtlasMark size={52} accent={brandColorSecondary || brandColor || undefined} className="block" />
          </button>
        </>
      )}
      {assistantAvailable && (
        <AssistantDrawer
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          name={assistantName || "Atlas"}
          storageScope={userId ?? ""}
          accent={brandColorSecondary || brandColor || undefined}
        />
      )}

      <TourGuide role={userRole} needsTour={needsTour} />
    </div>
  );
}

/**
 * Mobile bottom tab bar with a raised center create button. Daylight & Dusk
 * chrome: every tab is tinted in the brand color (the active one at full
 * strength — the Venmo read), icons are filled silhouettes, the create
 * button rides proud of the bar on a chrome-colored ring, and More wears
 * the user's avatar like a "Me" tab. Chat holds the fourth slot with a red
 * dot when messages wait.
 */
function MobileTabBar({
  role,
  isActive,
  pastDue,
  chatUnread,
  openMore,
  previewMode,
}: {
  role: string;
  isActive: (href: string) => boolean;
  pastDue: number;
  chatUnread: number;
  openMore: () => void;
  previewMode?: boolean;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const creates = forRole(createItems, role).filter(
    (i) => !previewMode || (i.href !== "/app/invoices/new" && i.href !== "/app/payments/new")
  );

  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  const tabClass = (active: boolean) =>
    `flex-1 flex flex-col items-center gap-1 pt-2 pb-2.5 text-[10.5px] transition-colors ${
      active ? "tab-ink-on font-semibold" : "tab-ink font-medium"
    }`;

  const tabLink = (
    href: string,
    label: string,
    Icon: React.ComponentType<{ size?: number; className?: string }>,
    dot = false
  ) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        data-tour={tourKeys[href]}
        onClick={() => hapticImpact("LIGHT")}
        className={tabClass(active)}
      >
        <span className="relative">
          <Icon size={24} />
          {dot && (
            <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[color:var(--fab-ring)]" />
          )}
        </span>
        {label}
      </Link>
    );
  };

  return (
    <>
      {/* Create sheet — backdrop fades, sheet springs up (iOS curve), tiles
          cascade in. Icons ride console-ink tiles like the Atlas mark.
          Light dim only: the glass sheet needs content behind it to frost. */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 lg:hidden transition-opacity duration-300 ${
          sheetOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSheetOpen(false)}
        aria-hidden
      />
      {creates.length > 0 && (
        <div
          className={`sheet-material fixed inset-x-0 bottom-0 z-50 lg:hidden rounded-t-3xl shadow-[0_-8px_30px_rgba(28,25,23,0.18)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] ${
            /* open = NO transform: iOS kills backdrop-filter on transformed elements */
            sheetOpen ? "" : "translate-y-full pointer-events-none"
          }`}
        >
          <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-gray-200" />
          <p className="font-display px-5 pt-3.5 pb-2.5 text-[16px] font-bold text-gray-900">
            Create
          </p>
          {/* 6-col grid, tiles span 2 — lets a lone tile on the last row sit
              centered (col 3) and a pair sit symmetric (cols 2+4). */}
          <div className="grid grid-cols-6 gap-y-1.5 px-3 pb-2">
            {creates.map(({ href, label, icon: Icon }, i) => {
              const rem = creates.length % 3;
              const placement =
                rem === 1 && i === creates.length - 1
                  ? "col-start-3"
                  : rem === 2 && i === creates.length - 2
                    ? "col-start-2"
                    : "";
              // Tiles erupt from the FAB: the bottom-center tile pops first,
              // then the wave spreads up and outward (delay = grid distance
              // from bottom-center, so it reads as bursting out of the +).
              const rows = Math.ceil(creates.length / 3);
              const rowFromBottom = rows - 1 - Math.floor(i / 3);
              const colFromCenter = Math.abs((i % 3) - 1);
              const delay = 60 + rowFromBottom * 60 + colFromCenter * 35;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setSheetOpen(false)}
                  style={sheetOpen ? { animationDelay: `${delay}ms` } : undefined}
                  className={`col-span-2 ${placement} flex flex-col items-center gap-2 rounded-2xl px-1 py-3.5 transition-transform active:scale-95 ${
                    sheetOpen ? "anim-tile-pop" : ""
                  }`}
                >
                  {/* Solid hue tile — the create grid scans by color (one hue
                      per entity, tenant-repaintable via Settings → Branding) */}
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
                    style={{
                      backgroundColor: createTints[href] ?? "#0A1428",
                      color: hueInk(createTints[href] ?? "#0A1428"),
                    }}
                  >
                    <Icon size={19} strokeWidth={2.25} />
                  </span>
                  <span className="font-display text-[11px] font-semibold text-gray-800">
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
          {/* The FAB's + twirls to an × here, on top of the sheet — the real
              FAB sits underneath it and can't show the animation itself */}
          <div className="flex justify-center pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => {
                hapticImpact("LIGHT");
                setSheetOpen(false);
              }}
              aria-label="Close"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-600 active:scale-90 transition-transform"
            >
              <Plus size={20} strokeWidth={2.5} className={sheetOpen ? "anim-x-twirl" : ""} />
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────── */}
      <nav className="mobile-tab-bar lg:hidden fixed bottom-0 inset-x-0 z-30 bg-chrome border-t border-gray-200 flex items-stretch pb-[env(safe-area-inset-bottom)]">
        {tabLink("/app/dashboard", "Home", HomeFill)}
        {tabLink("/app/schedule", "Schedule", ScheduleFill)}
        {creates.length > 0 && (
          <div className="relative w-[72px] shrink-0">
            <button
              onClick={() => {
                setSheetOpen((v) => {
                  if (!v) hapticImpact("MEDIUM");
                  return !v;
                });
              }}
              aria-label="Create"
              data-tour="create"
              className="absolute left-1/2 -translate-x-1/2 -top-6 flex h-14 w-14 items-center justify-center rounded-full border-4 border-[color:var(--fab-ring)] bg-[color:var(--mobile-accent)] text-[color:var(--mobile-on-accent)] shadow-[0_6px_16px_rgba(10,20,40,0.24)] active:scale-95 transition-transform"
            >
              <Plus
                size={24}
                strokeWidth={2.5}
                className={`transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                  sheetOpen ? "rotate-[135deg]" : ""
                }`}
              />
            </button>
          </div>
        )}
        {tabLink("/app/chat", "Chat", ChatFill, chatUnread > 0)}
        <button
          type="button"
          onClick={() => {
            hapticImpact("LIGHT");
            openMore();
          }}
          className={tabClass(false)}
        >
          <span className="relative">
            <MoreFill size={24} />
            {pastDue > 0 && (
              <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[color:var(--fab-ring)]" />
            )}
          </span>
          More
        </button>
      </nav>
    </>
  );
}

/**
 * Mobile "More" sheet — everything that used to hide in the black sidebar
 * drawer, laid out as grouped native list rows (the Amex/iOS-settings
 * pattern): profile card up top, sectioned rows with icon tiles and inline
 * badges, sign-out at the bottom.
 */
function MoreSheet({
  open,
  onClose,
  role,
  counts,
  teamCount,
  userName,
  userEmail,
  userId,
  isActive,
  aiEnabled,
  assistantName,
  assistantAccent,
  openAssistant,
}: {
  open: boolean;
  onClose: () => void;
  role: string;
  counts: { requests: number; pastDue: number; chat: number };
  teamCount: number;
  userName?: string | null;
  userEmail?: string | null;
  userId?: string | null;
  isActive: (href: string) => boolean;
  aiEnabled: boolean;
  assistantName: string;
  assistantAccent?: string;
  openAssistant: () => void;
}) {
  const manager = isManagerRole(role);

  const badgeFor = (href: string): { count: number; urgent: boolean } | null => {
    if (href === "/app/requests" && counts.requests > 0)
      return { count: counts.requests, urgent: false };
    if (href === "/app/invoices" && counts.pastDue > 0)
      return { count: counts.pastDue, urgent: true };
    if (href === "/app/chat" && counts.chat > 0) return { count: counts.chat, urgent: true };
    return null;
  };

  const row = ({ href, label, icon: Icon }: NavItem, i: number, total: number) => {
    const badge = badgeFor(href);
    const active = isActive(href);
    // Section hue on the icon tile — with this many destinations the color
    // is wayfinding: a quick glance finds Jobs orange / Invoices sky without
    // reading labels. (Tenants can repaint these in Settings → Branding.)
    // The hue rainbow stays CONFINED to the two nav sheets — lists, tiles,
    // and chips elsewhere on phones hold the one-accent discipline.
    const tint = sectionTints[href];
    return (
      <Link
        key={href}
        href={href}
        onClick={() => hapticImpact("LIGHT")}
        className={`flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors ${
          i < total - 1 ? "border-b border-gray-100" : ""
        }`}
        style={
          active
            ? { backgroundColor: "color-mix(in srgb, var(--wb-ink) 9%, transparent)" }
            : undefined
        }
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ${
            tint ? "" : "bg-[color:var(--mobile-accent)] text-[color:var(--mobile-on-accent)]"
          }`}
          style={tint ? { backgroundColor: tint, color: hueInk(tint) } : undefined}
        >
          <Icon size={16} strokeWidth={2.25} />
        </span>
        <span className="flex-1 text-[15px] font-medium text-gray-900">{label}</span>
        {badge && (
          <span
            className={`min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums ${
              badge.urgent ? "bg-red-500 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {badge.count > 99 ? "99+" : badge.count}
          </span>
        )}
        <ChevronRight size={16} className="text-gray-300 shrink-0" />
      </Link>
    );
  };

  const group = (label: string | null, items: NavItem[]) => {
    if (items.length === 0) return null;
    return (
      <div key={label ?? "top"}>
        {label && (
          <p className="px-4 pb-1.5 pt-4 text-[13px] font-semibold text-gray-500">
            {label}
          </p>
        )}
        <div className="card-tool overflow-hidden">
          {items.map((item, i) => row(item, i, items.length))}
        </div>
      </div>
    );
  };

  const teamItems: NavItem[] = [
    ...(teamCount > 1 ? [{ href: "/app/chat", label: "Team Chat", icon: MessagesSquare }] : []),
    ...(manager
      ? [
          { href: "/app/settings/booking", label: "Forms", icon: Globe },
          { href: "/app/settings/team", label: "Team", icon: UserPlus },
          { href: "/app/settings", label: "Settings", icon: Settings },
        ]
      : []),
  ];

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 lg:hidden transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`sheet-material fixed inset-x-0 bottom-0 z-50 lg:hidden flex max-h-[88dvh] flex-col rounded-t-3xl shadow-[0_-8px_30px_rgba(28,25,23,0.18)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] ${
          open ? "" : "translate-y-full pointer-events-none"
        }`}
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-gray-300" />
        <div className="overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
          {/* Profile card */}
          <Link
            href="/app/settings/profile"
            onClick={() => hapticImpact("LIGHT")}
            className="card-tool flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors"
          >
            <Avatar name={userName} userId={userId} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-gray-900">{userName}</p>
              <p className="truncate text-xs text-gray-500">{userEmail}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 shrink-0" />
          </Link>

          {/* The assistant's seat since Chat took its tab — a headline row,
              not a buried list item. */}
          {aiEnabled && (
            <button
              type="button"
              onClick={() => {
                hapticImpact("LIGHT");
                onClose();
                openAssistant();
              }}
              className="card-tool mt-3 flex w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors"
            >
              <AtlasMark size={36} accent={assistantAccent} className="shrink-0 rounded-[10px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-gray-900">
                  {assistantName}
                </span>
                <span className="block truncate text-xs text-gray-500">
                  Ask anything — or hand off a task
                </span>
              </span>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </button>
          )}

          {navGroups
            .slice(1) // Home + Schedule already live on the tab bar
            .map((g) => group(g.label ?? null, forRole(g.items, role)))}
          {group(teamItems.length > 0 ? "Team" : null, teamItems)}
          {group("Support", [{ href: "/app/support", label: "Help & Feedback", icon: LifeBuoy }])}

          {/* Sign out */}
          <div className="card-tool mt-4 overflow-hidden">
            <button
              onClick={() => signOut({ callbackUrl: "/app/login" })}
              className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-red-50 text-red-600">
                <LogOut size={16} strokeWidth={2} />
              </span>
              <span className="text-[15px] font-medium text-red-600">Sign out</span>
            </button>
          </div>

          <p className="pt-4 text-center text-[11px] text-gray-400">
            Powered by WorkBench
          </p>
        </div>
      </div>
    </>
  );
}
