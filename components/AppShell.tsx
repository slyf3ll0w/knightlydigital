"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Home,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Users,
  Inbox,
  FileText,
  Receipt,
  Settings,
  LogOut,
  MoreHorizontal,
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
  ChevronsUpDown,
  CircleUserRound,
  MessagesSquare,
  SquareKanban,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import AtlasIcon from "@/components/AtlasIcon";
import TourGuide from "@/components/TourGuide";
import AssistantDrawer from "@/components/AssistantDrawer";
import { textOn } from "@/lib/branding";
import { hapticImpact } from "@/lib/haptics";

const DEFAULT_ACCENT = "#FFFFFF"; // console default: white on the dark rail

function luminanceOf(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

/** Brand accent, guarded: too-dark colors are invisible on the console rail. */
function sidebarAccent(hex: string): string {
  const luminance = luminanceOf(hex);
  return luminance === null || luminance < 70 ? DEFAULT_ACCENT : hex;
}

/** Same accent for light surfaces (mobile tab bar / FAB / create sheet),
 *  where too-LIGHT colors disappear — those flip to console near-black. */
function surfaceAccent(hex: string): string {
  const luminance = luminanceOf(hex);
  return luminance === null || luminance > 200 ? "#0C0F0C" : hex;
}

/** And for DARK surfaces (dark-theme tab bar), where too-dark colors blend
 *  into the bar — those flip to white. */
function darkSurfaceAccent(hex: string): string {
  const luminance = luminanceOf(hex);
  return luminance === null || luminance < 70 ? "#FFFFFF" : hex;
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
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/app/contacts", label: "Clients", icon: Users, show: sellRoles },
      { href: "/app/requests", label: "Requests", icon: Inbox, show: sellRoles },
      { href: "/app/leads", label: "Leads", icon: SquareKanban, show: sellRoles },
      { href: "/app/quotes", label: "Quotes", icon: FileText, show: sellRoles },
      { href: "/app/jobs", label: "Jobs", icon: Briefcase },
      { href: "/app/invoices", label: "Invoices", icon: Receipt, show: moneyRoles },
      { href: "/app/subscriptions", label: "Subscriptions", icon: Repeat, show: moneyRoles },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/app/insights", label: "Insights", icon: BarChart3, show: isManagerRole },
      { href: "/app/settings/products", label: "Services", icon: Tag, show: isManagerRole },
      { href: "/app/settings/contracts", label: "Contracts", icon: FileSignature, show: isManagerRole },
    ],
  },
];

const createItems: NavItem[] = [
  { href: "/app/contacts/new", label: "Client", icon: Users, show: sellRoles },
  { href: "/app/contacts/new?type=lead", label: "Lead", icon: SquareKanban, show: sellRoles },
  { href: "/app/requests/new", label: "Request", icon: Inbox, show: sellRoles },
  { href: "/app/appointments/new", label: "Appointment", icon: CalendarClock, show: sellRoles },
  { href: "/app/quotes/new", label: "Quote", icon: FileText, show: sellRoles },
  { href: "/app/jobs/new", label: "Job", icon: Briefcase, show: (r) => isManagerRole(r) || r === "USER" },
  { href: "/app/invoices/new", label: "Invoice", icon: Receipt, show: moneyRoles },
  { href: "/app/payments/new", label: "Payment", icon: DollarSign, show: moneyRoles },
];

// One hue per entity so the create grid scans at a glance (identical ink
// tiles made the sheet a guessing game). Echoes the status-color language:
// requests amber, quotes green, money teal.
const createTints: Record<string, string> = {
  "/app/contacts/new": "#3B82F6", // Client — blue
  "/app/contacts/new?type=lead": "#84CC16", // Lead — lime, matches the Leads board
  "/app/requests/new": "#F59E0B", // Request — amber
  "/app/appointments/new": "#8B5CF6", // Appointment — violet
  "/app/quotes/new": "#22C55E", // Quote — green
  "/app/jobs/new": "#F97316", // Job — orange
  "/app/invoices/new": "#0EA5E9", // Invoice — sky
  "/app/payments/new": "#14B8A6", // Payment — teal
};

// The same color language on navigation: More-sheet icon tiles and the
// desktop sidebar's hover/active states. Home + Settings stay neutral (and
// keep the tenant's brand accent) — everything with an entity gets its hue.
const sectionTints: Record<string, string> = {
  "/app/schedule": "#8B5CF6", // appointments live here
  "/app/contacts": "#3B82F6",
  "/app/requests": "#F59E0B",
  "/app/leads": "#84CC16", // lime — between request amber and quote green
  "/app/quotes": "#22C55E",
  "/app/jobs": "#F97316",
  "/app/invoices": "#0EA5E9",
  "/app/subscriptions": "#14B8A6",
  "/app/insights": "#6366F1",
  "/app/settings/products": "#EC4899",
  "/app/settings/contracts": "#A855F7",
  "/app/chat": "#F43F5E",
  "/app/settings/booking": "#06B6D4",
  "/app/settings/team": "#10B981",
};

// Tab bar: Home · Schedule · [create] · Atlas · More. Everything else lives
// in the More drawer — the hamburger pattern is retired on mobile.
const mobileNav: NavItem[] = [
  { href: "/app/dashboard", label: "Home", icon: Home },
  { href: "/app/schedule", label: "Schedule", icon: CalendarDays },
];
// Companies with the assistant disabled get Jobs in the Atlas slot.
const jobsTab: NavItem = { href: "/app/jobs", label: "Jobs", icon: Briefcase };

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
 * Global create menu (desktop sidebar). Self-contained state + ref — a shared
 * ref made the click-outside handler swallow item clicks.
 */
function CreateMenu({ accent, role }: { accent: string; role: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = forRole(createItems, role);

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
    <div className="px-3 pt-4 relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        data-tour="create"
        style={{ backgroundColor: accent, color: textOn(accent) }}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 hover:brightness-110 text-sm font-semibold rounded-full transition-[filter,transform] duration-150 active:scale-[0.96]"
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
        <div className="anim-create-pop absolute left-3 right-3 top-full mt-1.5 z-50 bg-white rounded-lg shadow-xl ring-1 ring-black/5 py-1.5 overflow-hidden">
          {items.map(({ href, label, icon: Icon }, i) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              style={{ animationDelay: `${i * 25}ms` }}
              className="anim-create-item flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Icon size={14} style={{ color: createTints[href] ?? "#9CA3AF" }} />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Bottom-of-sidebar user card → upward popover (profile, sign out).
 * Desktop only — phones get the same links in the More sheet.
 */
function UserMenu({
  userName,
  userEmail,
  userId,
}: {
  userName?: string | null;
  userEmail?: string | null;
  userId?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        <div className="absolute bottom-full left-0 right-0 mb-1.5 z-50 bg-white rounded-lg shadow-xl ring-1 ring-black/5 py-1.5 overflow-hidden">
          <Link
            href="/app/settings/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <CircleUserRound size={14} className="text-gray-400" />
            My Profile
          </Link>
          <div className="my-1 border-t border-gray-100" />
          <button
            onClick={() => signOut({ callbackUrl: "/app/login" })}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <LogOut size={14} className="text-gray-400" />
            Sign out
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-3 rounded-md hover:bg-[var(--rail-hover)] transition-colors text-left"
      >
        <Avatar name={userName} userId={userId} size={28} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[color:var(--rail-ink)] truncate">{userName}</p>
          <p className="text-[11px] text-[color:var(--rail-faint)] truncate">{userEmail}</p>
        </div>
        <ChevronsUpDown size={13} className="text-[color:var(--rail-faint)] shrink-0" />
      </button>
    </div>
  );
}

interface AppShellProps {
  children: React.ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  role?: string | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  logoWallpaper?: boolean;
  sidebarTheme?: string | null;
  sidebarLogoColor?: string | null;
  brandColor?: string | null;
  brandColorSecondary?: string | null;
  teamCount?: number;
  needsTour?: boolean;
  aiEnabled?: boolean;
  assistantName?: string | null;
  userId?: string | null;
}

export default function AppShell({
  children,
  userName,
  userEmail,
  role,
  companyName,
  companyLogoUrl,
  logoWallpaper = false,
  sidebarTheme,
  sidebarLogoColor,
  brandColor,
  brandColorSecondary,
  teamCount = 1,
  needsTour = false,
  aiEnabled = false,
  assistantName,
  userId,
}: AppShellProps) {
  const userRole = role ?? "OWNER";
  const manager = isManagerRole(userRole);
  // Tenant-selectable rail theme; unknown values fall back to black
  const rail = sidebarTheme === "white" || sidebarTheme === "gray" ? sidebarTheme : "black";
  const railDark = rail === "black";
  // Secondary brand color is the accent; primary fills in when it's unset.
  // Guarded per rail: colors that would vanish flip to the readable default.
  const accent = railDark
    ? sidebarAccent(brandColorSecondary || brandColor || DEFAULT_ACCENT)
    : surfaceAccent(brandColorSecondary || brandColor || "#0C0F0C");
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState({ requests: 0, pastDue: 0, chat: 0, leads: 0 });

  // Auth pages render standalone even when a session cookie exists
  const isAuthPage = pathname.startsWith("/app/login") || pathname.startsWith("/app/register");

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Nav badges (new requests, past-due invoices) — refreshed on every
  // navigation so the counts stay honest without polling.
  useEffect(() => {
    if (isAuthPage) return;
    let cancelled = false;
    fetch("/api/app/nav-counts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !cancelled)
          setCounts({
            requests: d.requests ?? 0,
            pastDue: d.pastDue ?? 0,
            chat: d.chat ?? 0,
            leads: d.leads ?? 0,
          });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname, isAuthPage]);

  function isActive(href: string) {
    if (href === "/app/dashboard") return pathname === href;
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

  if (isAuthPage) return <>{children}</>;

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) router.push(`/app/contacts?q=${encodeURIComponent(search.trim())}`);
  }

  const navLink = (href: string, label: string, Icon: typeof Home) => {
    const active = isActive(href);
    // Section hue for active/hover; unmapped items keep the tenant accent
    const tint = sectionTints[href] ?? accent;
    // Live badges: new requests (neutral), past-due invoices (red — urgent)
    const badge =
      href === "/app/requests"
        ? counts.requests
        : href === "/app/invoices"
          ? counts.pastDue
          : href === "/app/chat"
            ? counts.chat
            : href === "/app/leads"
              ? counts.leads
              : 0;
    return (
      <Link
        key={href}
        href={href}
        data-tour={tourKeys[href]}
        className={`group font-display relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors ${
          active
            ? "font-semibold text-[color:var(--rail-ink)]"
            : "font-medium text-[color:var(--rail-muted)] hover:bg-[var(--rail-hover)] hover:text-[color:var(--rail-ink)]"
        }`}
        style={{ "--st": tint, ...(active ? { backgroundColor: `${tint}26` } : {}) } as React.CSSProperties}
      >
        {active && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
            style={{ backgroundColor: tint }}
            aria-hidden
          />
        )}
        <Icon
          size={16}
          className={active ? undefined : "transition-colors group-hover:text-[color:var(--st)]"}
          style={active ? { color: tint } : undefined}
        />
        {label}
        {badge > 0 && (
          <span
            className={`ml-auto min-w-[18px] rounded-full px-1.5 py-px text-center text-[10px] font-bold tabular-nums ${
              href === "/app/invoices"
                ? "bg-red-500 text-white"
                : "bg-[var(--rail-chip)] text-[color:var(--rail-chip-ink)]"
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
      <CreateMenu accent={accent} role={userRole} />

      {/* Nav groups — labeled sections instead of bare dividers */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {navGroups
          .map((group) => ({ ...group, items: forRole(group.items, userRole) }))
          .filter((group) => group.items.length > 0)
          .map((group, i) => (
            <div key={i} className={i > 0 ? "mt-4" : undefined}>
              {group.label && (
                <div className="flex items-center gap-2 px-3 pb-1.5">
                  <span className="font-display text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--rail-faint)]">
                    {group.label}
                  </span>
                  <span className="h-px flex-1 bg-[var(--rail-line)]" aria-hidden />
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => navLink(href, label, Icon))}
              </div>
            </div>
          ))}

        {/* Team chat lives in the top bar on desktop (and the More sheet on
            mobile) — it's a companion to every page, not a destination */}
      </nav>

      {/* Settings + user */}
      <div className="px-3 py-3 border-t border-[color:var(--rail-line)] space-y-0.5">
        {manager && navLink("/app/settings/booking", "Forms", Globe)}
        {manager && navLink("/app/settings/team", "Team", UserPlus)}
        {manager && navLink("/app/settings", "Settings", Settings)}
        <UserMenu userName={userName} userEmail={userEmail} userId={userId} />
        <p className="px-3 pt-1.5 pb-1 text-[10px] text-[color:var(--rail-faint)] flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/streamflaire-hub-mark.png"
            alt=""
            className={`h-2.5 w-auto shrink-0 opacity-60 brightness-0 ${railDark ? "invert" : ""}`}
          />
          Powered by Streamflaire Hub
        </p>
      </div>
    </>
  );

  // Sidebar header is the company's identity, not ours (their logo when
  // uploaded, otherwise a brand-colored initial tile). The logo rides a
  // floating rounded card on a tenant-pickable backdrop — margins all
  // around mean it never has to line up with the top bar's hairline, so
  // any logo shape or size reads as intentional.
  const logo = companyLogoUrl ? (
    <div className="px-3 pt-3 pb-1.5">
      <div
        className="theme-fixed flex items-center justify-center rounded-xl px-3 py-2.5 ring-1 ring-[color:var(--rail-line)]"
        style={{ backgroundColor: sidebarLogoColor || "#FFFFFF" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={companyLogoUrl}
          alt={companyName ?? ""}
          className="max-h-24 w-full object-contain"
        />
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2.5 px-4 py-2.5 min-h-[57px] border-b border-[color:var(--rail-line)] min-w-0">
      <div
        className="chamfer w-9 h-9 rounded-md flex items-center justify-center shrink-0 font-display font-bold text-sm"
        style={{ backgroundColor: accent, color: textOn(accent) }}
      >
        {companyName?.charAt(0).toUpperCase() ?? "J"}
      </div>
      <span className="font-display font-bold text-[14px] tracking-tight text-[color:var(--rail-ink)] truncate">
        {companyName ?? "Streamflaire Hub"}
      </span>
    </div>
  );

  // Tenant brand color → per-theme mobile accent tokens (globals.css holds
  // the Streamflaire-green defaults; CSS resolves light vs dark, so the
  // active tab / create button read on BOTH bars).
  const rawBrand = brandColorSecondary || brandColor || null;
  const mobileAccentVars = rawBrand
    ? ({
        "--mobile-accent-light": surfaceAccent(rawBrand),
        "--mobile-on-accent-light": textOn(surfaceAccent(rawBrand)),
        "--mobile-accent-soft-light": `${surfaceAccent(rawBrand)}1A`,
        "--mobile-accent-dark": darkSurfaceAccent(rawBrand),
        "--mobile-on-accent-dark": textOn(darkSurfaceAccent(rawBrand)),
        "--mobile-accent-soft-dark": `${darkSurfaceAccent(rawBrand)}24`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div className="app-ui flex h-screen bg-paper-plain overflow-hidden" style={mobileAccentVars}>
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className={`hidden lg:flex flex-col w-[232px] shrink-0 rail-${rail}`}>
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
      />

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Optional company wallpaper — a huge tilted watermark of the logo
            pinned behind every page (it doesn't scroll with the content).
            The header paints over its own strip; <main> is transparent. */}
        {logoWallpaper && companyLogoUrl && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={companyLogoUrl}
              alt=""
              className="logo-wallpaper w-[120%] max-w-none shrink-0 rotate-45 object-contain"
            />
          </div>
        )}
        {/* Top bar */}
        <header className="relative flex items-center gap-4 px-4 lg:px-6 min-h-[57px] pt-[env(safe-area-inset-top)] border-b border-gray-200 bg-white shrink-0">
          {/* Company identity lives in the sidebar on desktop; the header
              carries it on mobile — the logo when one's uploaded (white tile
              so dark marks survive dark mode), else the name. The hamburger
              is retired — the More tab opens the drawer. */}
          {companyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={companyLogoUrl}
              alt={companyName ?? ""}
              className="lg:hidden theme-fixed h-8 w-auto max-w-[150px] rounded-md bg-white object-contain px-1 py-0.5"
            />
          ) : (
            <span className="lg:hidden font-display font-bold text-[15px] text-gray-900 truncate">
              {companyName ?? "Streamflaire Hub"}
            </span>
          )}

          {/* Team chat, one tap from anywhere — red dot when messages wait */}
          <Link
            href="/app/chat"
            onClick={() => hapticImpact("LIGHT")}
            aria-label="Team chat"
            className="lg:hidden ml-auto relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 active:bg-gray-100 transition-colors"
          >
            <MessagesSquare size={20} />
            {counts.chat > 0 && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
            )}
          </Link>

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
            <MessagesSquare size={15} style={{ color: isActive("/app/chat") ? undefined : "#F43F5E" }} />
            Chat
            {counts.chat > 0 && (
              <span className="min-w-[18px] rounded-full bg-red-500 px-1.5 py-px text-center text-[10px] font-bold text-white tabular-nums">
                {counts.chat > 99 ? "99+" : counts.chat}
              </span>
            )}
          </Link>

          <Link
            href={manager ? "/app/settings" : "/app/settings/profile"}
            className="hidden sm:flex p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            title={manager ? "Settings" : "My Profile"}
          >
            <Settings size={17} />
          </Link>
          <Avatar name={userName} userId={userId} size={32} className="hidden sm:flex ring-gray-200" />
        </header>

        {/* Scrollable content */}
        <main className="app-main relative flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
      </div>

      <MobileTabBar
        role={userRole}
        isActive={isActive}
        pastDue={counts.pastDue}
        aiEnabled={aiEnabled}
        assistantName={assistantName || "Atlas"}
        assistantOpen={assistantOpen}
        openAssistant={() => setAssistantOpen(true)}
        openMore={() => setMoreOpen(true)}
      />

      {/* Assistant bubble — floats above the mobile tab bar, hides while open */}
      {aiEnabled && !assistantOpen && (
        <button
          type="button"
          onClick={() => {
            hapticImpact("LIGHT");
            setAssistantOpen(true);
          }}
          aria-label="Open assistant"
          title={assistantName || "Atlas"}
          className="fixed z-40 hidden lg:flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#0C0F0C] text-green-400 transition-all hover:scale-105 hover:bg-[#181D18] hover:text-green-300 lg:bottom-6 lg:right-6"
        >
          <AtlasIcon size={24} />
        </button>
      )}
      {aiEnabled && (
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
 * Mobile bottom tab bar with a raised center create button. The button opens
 * a bottom sheet listing the same create actions as the sidebar menu — on
 * phones the sidebar is buried behind the hamburger, so creating anything
 * used to take three taps.
 */
function MobileTabBar({
  role,
  isActive,
  pastDue,
  aiEnabled,
  assistantName,
  assistantOpen,
  openAssistant,
  openMore,
}: {
  role: string;
  isActive: (href: string) => boolean;
  pastDue: number;
  aiEnabled: boolean;
  assistantName: string;
  assistantOpen: boolean;
  openAssistant: () => void;
  openMore: () => void;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const tabs = forRole(mobileNav, role);
  const creates = forRole(createItems, role);

  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  const tabLink = ({ href, label, icon: Icon }: NavItem) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        data-tour={tourKeys[href]}
        onClick={() => hapticImpact("LIGHT")}
        className={`font-display flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
          active
            ? "text-[color:var(--mobile-accent)] font-semibold"
            : "text-gray-400 hover:text-gray-600"
        }`}
      >
        <Icon size={18} />
        {label}
      </Link>
    );
  };

  const tabButton = (
    label: string,
    Icon: React.ComponentType<{ size?: number }>,
    onPress: () => void,
    active: boolean,
    badge = false
  ) => (
    <button
      type="button"
      onClick={() => {
        hapticImpact("LIGHT");
        onPress();
      }}
      className={`font-display flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
        active
          ? "text-[color:var(--mobile-accent)] font-semibold"
          : "text-gray-400 hover:text-gray-600"
      }`}
    >
      <span className="relative">
        <Icon size={18} />
        {badge && (
          <span className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        )}
      </span>
      {label}
    </button>
  );

  return (
    <>
      {/* Create sheet — backdrop fades, sheet springs up (iOS curve), tiles
          cascade in. Icons ride console-ink tiles like the Atlas mark. */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity duration-300 ${
          sheetOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSheetOpen(false)}
        aria-hidden
      />
      {creates.length > 0 && (
        <div
          className={`fixed inset-x-0 bottom-0 z-50 lg:hidden rounded-t-3xl bg-white shadow-[0_-8px_30px_rgba(28,25,23,0.18)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] ${
            sheetOpen ? "translate-y-0" : "translate-y-full pointer-events-none"
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
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setSheetOpen(false)}
                  style={
                    sheetOpen
                      ? { animation: "tile-in 300ms cubic-bezier(0.22,1,0.36,1) both", animationDelay: `${70 + i * 28}ms` }
                      : undefined
                  }
                  className={`col-span-2 ${placement} flex flex-col items-center gap-2 rounded-2xl px-1 py-3.5 transition-transform active:scale-95`}
                >
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                    style={{
                      backgroundColor: `${createTints[href] ?? "#0C0F0C"}1c`,
                      color: createTints[href] ?? "#0C0F0C",
                      boxShadow: `inset 0 0 0 1.5px ${createTints[href] ?? "#0C0F0C"}30`,
                    }}
                  >
                    <Icon size={19} strokeWidth={2} />
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
      <nav className="mobile-tab-bar lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex items-stretch pb-[env(safe-area-inset-bottom)]">
        {tabs.map(tabLink)}
        {creates.length > 0 && (
          <div className="relative w-16 shrink-0">
            <button
              onClick={() => {
                setSheetOpen((v) => {
                  if (!v) hapticImpact("MEDIUM");
                  return !v;
                });
              }}
              aria-label="Create"
              data-tour="create"
              className="absolute left-1/2 -translate-x-1/2 -top-4 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--mobile-accent)] text-[color:var(--mobile-on-accent)] shadow-[0_4px_14px_rgba(0,0,0,0.18)] active:scale-95 transition-transform"
            >
              <Plus
                size={22}
                strokeWidth={2.5}
                className={`transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                  sheetOpen ? "rotate-[135deg]" : ""
                }`}
              />
            </button>
          </div>
        )}
        {aiEnabled
          ? tabButton(assistantName, AtlasIcon, openAssistant, assistantOpen)
          : tabLink(jobsTab)}
        {tabButton("More", MoreHorizontal, openMore, false, pastDue > 0)}
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
    // Section hue on the icon tile — the list scans by color, like the
    // create sheet. Unmapped rows keep the tenant accent.
    const tint = sectionTints[href];
    return (
      <Link
        key={href}
        href={href}
        onClick={() => hapticImpact("LIGHT")}
        className={`flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors ${
          i < total - 1 ? "border-b border-gray-100" : ""
        }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${
            tint
              ? ""
              : active
                ? "bg-[color:var(--mobile-accent)] text-[color:var(--mobile-on-accent)]"
                : "bg-[color:var(--mobile-accent-soft)] text-[color:var(--mobile-accent)]"
          }`}
          style={
            tint
              ? active
                ? { backgroundColor: tint, color: "#ffffff" }
                : { backgroundColor: `${tint}1c`, color: tint }
              : undefined
          }
        >
          <Icon size={16} strokeWidth={2} />
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
          <p className="font-display px-4 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
            {label}
          </p>
        )}
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
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
        className={`fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-50 lg:hidden flex max-h-[88dvh] flex-col rounded-t-3xl bg-paper-plain shadow-[0_-8px_30px_rgba(28,25,23,0.18)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] ${
          open ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-gray-300" />
        <div className="overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
          {/* Profile card */}
          <Link
            href="/app/settings/profile"
            onClick={() => hapticImpact("LIGHT")}
            className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 ring-1 ring-black/5 active:bg-gray-50 transition-colors"
          >
            <Avatar name={userName} userId={userId} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-gray-900">{userName}</p>
              <p className="truncate text-xs text-gray-500">{userEmail}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 shrink-0" />
          </Link>

          {navGroups
            .slice(1) // Home + Schedule already live on the tab bar
            .map((g) => group(g.label ?? null, forRole(g.items, role)))}
          {group(teamItems.length > 0 ? "Team" : null, teamItems)}

          {/* Sign out */}
          <div className="mt-4 overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
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
            Powered by Streamflaire Hub
          </p>
        </div>
      </div>
    </>
  );
}
