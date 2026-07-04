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
  Menu,
  X,
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
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import TourGuide from "@/components/TourGuide";
import AssistantDrawer from "@/components/AssistantDrawer";
import { textOn } from "@/lib/branding";

const DEFAULT_ACCENT = "#22C55E"; // green-500

/** Brand accent, guarded: too-light colors are invisible on the manila rail. */
function sidebarAccent(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return DEFAULT_ACCENT;
  const n = parseInt(m[1], 16);
  const luminance =
    0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return luminance > 215 ? DEFAULT_ACCENT : hex;
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
  { href: "/app/requests/new", label: "Request", icon: Inbox, show: sellRoles },
  { href: "/app/appointments/new", label: "Appointment", icon: CalendarClock, show: sellRoles },
  { href: "/app/quotes/new", label: "Quote", icon: FileText, show: sellRoles },
  { href: "/app/jobs/new", label: "Job", icon: Briefcase, show: (r) => isManagerRole(r) || r === "USER" },
  { href: "/app/invoices/new", label: "Invoice", icon: Receipt, show: moneyRoles },
  { href: "/app/payments/new", label: "Payment", icon: DollarSign, show: moneyRoles },
];

const mobileNav: NavItem[] = [
  { href: "/app/dashboard", label: "Home", icon: Home },
  { href: "/app/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase },
  { href: "/app/invoices", label: "Invoices", icon: Receipt, show: moneyRoles },
];

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
 * Global create menu. Self-contained state + ref so each sidebar instance
 * (desktop + mobile drawer) gets its own — a shared ref made the click-outside
 * handler swallow item clicks.
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
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 hover:brightness-110 text-sm font-semibold rounded-md shadow-sm transition-[filter]"
      >
        <Plus size={15} />
        Create
      </button>
      {open && (
        <div className="absolute left-3 right-3 top-full mt-1.5 z-50 bg-white rounded-lg shadow-xl ring-1 ring-black/5 py-1.5 overflow-hidden">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Icon size={14} className="text-gray-400" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Bottom-of-sidebar user card → upward popover (profile, sign out). Same
 * per-instance state pattern as CreateMenu since the sidebar renders twice
 * (desktop + mobile drawer).
 */
function UserMenu({
  userName,
  userEmail,
}: {
  userName?: string | null;
  userEmail?: string | null;
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
        className="w-full px-3 py-2.5 flex items-center gap-3 rounded-md hover:bg-black/[0.04] transition-colors text-left"
      >
        <Avatar name={userName} size={28} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-900 truncate">{userName}</p>
          <p className="text-[11px] text-stone-500 truncate">{userEmail}</p>
        </div>
        <ChevronsUpDown size={13} className="text-stone-400 shrink-0" />
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
  brandColor?: string | null;
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
  brandColor,
  needsTour = false,
  aiEnabled = false,
  assistantName,
  userId,
}: AppShellProps) {
  const userRole = role ?? "OWNER";
  const manager = isManagerRole(userRole);
  const accent = sidebarAccent(brandColor || DEFAULT_ACCENT);
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState({ requests: 0, pastDue: 0 });

  // Auth pages render standalone even when a session cookie exists
  const isAuthPage = pathname.startsWith("/app/login") || pathname.startsWith("/app/register");

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Nav badges (new requests, past-due invoices) — refreshed on every
  // navigation so the counts stay honest without polling.
  useEffect(() => {
    if (isAuthPage) return;
    let cancelled = false;
    fetch("/api/app/nav-counts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !cancelled) setCounts({ requests: d.requests ?? 0, pastDue: d.pastDue ?? 0 });
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
    // Live badges: new requests (neutral), past-due invoices (red — urgent)
    const badge =
      href === "/app/requests" ? counts.requests : href === "/app/invoices" ? counts.pastDue : 0;
    return (
      <Link
        key={href}
        href={href}
        data-tour={tourKeys[href]}
        className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors ${
          active
            ? "font-semibold text-gray-900"
            : "font-medium text-stone-600 hover:bg-black/[0.04] hover:text-gray-900"
        }`}
        style={active ? { backgroundColor: `${accent}1f` } : undefined}
      >
        {active && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
        )}
        <Icon size={16} style={active ? { color: accent } : undefined} />
        {label}
        {badge > 0 && (
          <span
            className={`ml-auto min-w-[18px] rounded-full px-1.5 py-px text-center text-[10px] font-bold tabular-nums ${
              href === "/app/invoices" ? "bg-red-500 text-white" : "bg-black/10 text-gray-600"
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
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                    {group.label}
                  </span>
                  <span className="h-px flex-1 bg-stone-300/70" aria-hidden />
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => navLink(href, label, Icon))}
              </div>
            </div>
          ))}
      </nav>

      {/* Settings + user */}
      <div className="px-3 py-3 border-t border-stone-300/70 space-y-0.5">
        {manager && navLink("/app/settings/booking", "Forms", Globe)}
        {manager && navLink("/app/settings/team", "Team", UserPlus)}
        {manager && navLink("/app/settings", "Settings", Settings)}
        <UserMenu userName={userName} userEmail={userEmail} />
        <p className="px-3 pt-1.5 pb-1 text-[10px] text-stone-400 flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/streamflaire-hub-mark.png" alt="" className="h-2.5 w-auto shrink-0 opacity-70" />
          Powered by Streamflaire Hub
        </p>
      </div>
    </>
  );

  // Sidebar header is the company's identity, not ours (their logo when
  // uploaded, otherwise a brand-colored initial tile).
  const logo = (
    <div className="flex items-center gap-2.5 px-5 py-[15px] border-b border-stone-300/70 min-w-0">
      {companyLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={companyLogoUrl}
          alt=""
          className="h-8 w-8 rounded-md object-contain bg-white p-0.5 shrink-0 ring-1 ring-stone-300/60"
        />
      ) : (
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 font-bold text-sm"
          style={{ backgroundColor: accent, color: textOn(accent) }}
        >
          {companyName?.charAt(0).toUpperCase() ?? "J"}
        </div>
      )}
      <span className="font-bold text-[14px] tracking-tight text-gray-900 truncate">
        {companyName ?? "Streamflaire Hub"}
      </span>
    </div>
  );

  return (
    <div className="app-ui flex h-screen bg-paper overflow-hidden">
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-[232px] bg-manila border-r border-stone-300/70 shrink-0">
        {logo}
        {sidebarInner}
      </aside>

      {/* ── Mobile drawer ─────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-manila flex flex-col transition-transform duration-200 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between pr-4 border-b border-stone-300/70">
          <div className="border-b-0">{logo}</div>
          <button
            onClick={() => setMobileOpen(false)}
            className="text-stone-500 hover:text-gray-900"
          >
            <X size={18} />
          </button>
        </div>
        {sidebarInner}
      </aside>

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-4 px-4 lg:px-6 h-[57px] border-b border-gray-200 bg-paper shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-gray-600 hover:text-gray-900"
          >
            <Menu size={20} />
          </button>
          {/* Company name lives in the sidebar on desktop; header shows it on mobile */}
          <span className="lg:hidden font-semibold text-[15px] text-gray-900 truncate">
            {companyName ?? "Streamflaire Hub"}
          </span>

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

          <Link
            href={manager ? "/app/settings" : "/app/settings/profile"}
            className={`hidden sm:flex p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors ${
              sellRoles(userRole) ? "" : "ml-auto"
            }`}
            title={manager ? "Settings" : "My Profile"}
          >
            <Settings size={17} />
          </Link>
          <Avatar name={userName} size={32} className="hidden sm:flex ring-gray-200" />
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">{children}</main>
      </div>

      <MobileTabBar accent={accent} role={userRole} isActive={isActive} pastDue={counts.pastDue} />

      {/* Assistant bubble — floats above the mobile tab bar, hides while open */}
      {aiEnabled && !assistantOpen && (
        <button
          type="button"
          onClick={() => setAssistantOpen(true)}
          aria-label="Open assistant"
          title={assistantName || "Atlas"}
          className="fixed bottom-20 right-4 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-green-500 p-3.5 text-white shadow-lg shadow-green-900/20 transition-all hover:scale-105 hover:bg-green-600 lg:bottom-6 lg:right-6"
        >
          <Sparkles size={22} />
        </button>
      )}
      {aiEnabled && (
        <AssistantDrawer
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          name={assistantName || "Atlas"}
          storageScope={userId ?? ""}
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
  accent,
  role,
  isActive,
  pastDue,
}: {
  accent: string;
  role: string;
  isActive: (href: string) => boolean;
  pastDue: number;
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
        style={active ? { color: accent } : undefined}
        className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
          active ? "" : "text-gray-400 hover:text-gray-600"
        }`}
      >
        <span className="relative">
          <Icon size={18} />
          {href === "/app/invoices" && pastDue > 0 && (
            <span className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
          )}
        </span>
        {label}
      </Link>
    );
  };

  // Techs can't create anything — plain 4-tab bar, no center button
  const mid = Math.ceil(tabs.length / 2);

  return (
    <>
      {/* Create sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSheetOpen(false)}
        />
      )}
      {creates.length > 0 && (
        <div
          className={`fixed inset-x-0 bottom-0 z-50 lg:hidden rounded-t-2xl bg-white shadow-[0_-8px_30px_rgba(28,25,23,0.18)] transition-transform duration-200 ${
            sheetOpen ? "translate-y-0" : "translate-y-full pointer-events-none"
          }`}
        >
          <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-gray-200" />
          <p className="px-5 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Create new
          </p>
          <div className="grid grid-cols-2 gap-1.5 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {creates.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setSheetOpen(false)}
                className="flex items-center gap-3 rounded-xl border border-gray-200 px-3.5 py-3 text-sm font-medium text-gray-800 active:bg-gray-50"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${accent}1A`, color: accent }}
                >
                  <Icon size={15} />
                </span>
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex items-stretch pb-[env(safe-area-inset-bottom)]">
        {tabs.slice(0, mid).map(tabLink)}
        {creates.length > 0 && (
          <div className="relative w-16 shrink-0">
            <button
              onClick={() => setSheetOpen((v) => !v)}
              aria-label="Create"
              data-tour="create"
              style={{ backgroundColor: accent, color: textOn(accent) }}
              className="absolute left-1/2 -translate-x-1/2 -top-4 flex h-12 w-12 items-center justify-center rounded-full shadow-lg shadow-black/20 active:scale-95 transition-transform"
            >
              <Plus size={22} strokeWidth={2.5} />
            </button>
          </div>
        )}
        {tabs.slice(mid).map(tabLink)}
      </nav>
    </>
  );
}
