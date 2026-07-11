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
  MessagesSquare,
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
        className="chamfer w-full flex items-center justify-center gap-1.5 px-3 py-2.5 hover:brightness-110 text-sm font-semibold rounded-md transition-[filter]"
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
        className="w-full px-3 py-2.5 flex items-center gap-3 rounded-md hover:bg-white/[0.06] transition-colors text-left"
      >
        <Avatar name={userName} size={28} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate">{userName}</p>
          <p className="text-[11px] text-white/45 truncate">{userEmail}</p>
        </div>
        <ChevronsUpDown size={13} className="text-white/40 shrink-0" />
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
  // Secondary brand color is the accent; primary fills in when it's unset
  const accent = sidebarAccent(brandColorSecondary || brandColor || DEFAULT_ACCENT);
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState({ requests: 0, pastDue: 0, chat: 0 });
  // Wide wordmark logos render large and alone; squarish marks get a tile
  // next to the company name (detected from the image's natural size).
  const [logoIsWide, setLogoIsWide] = useState(false);

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
        if (d && !cancelled)
          setCounts({ requests: d.requests ?? 0, pastDue: d.pastDue ?? 0, chat: d.chat ?? 0 });
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
      href === "/app/requests"
        ? counts.requests
        : href === "/app/invoices"
          ? counts.pastDue
          : href === "/app/chat"
            ? counts.chat
            : 0;
    return (
      <Link
        key={href}
        href={href}
        data-tour={tourKeys[href]}
        className={`font-display relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors ${
          active
            ? "font-semibold text-white"
            : "font-medium text-gray-400 hover:bg-white/[0.06] hover:text-white"
        }`}
        style={active ? { backgroundColor: `${accent}26` } : undefined}
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
              href === "/app/invoices" ? "bg-red-500 text-white" : "bg-white/10 text-gray-300"
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
                  <span className="font-display text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                    {group.label}
                  </span>
                  <span className="h-px flex-1 bg-white/10" aria-hidden />
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => navLink(href, label, Icon))}
              </div>
            </div>
          ))}

        {/* Team chat: only when there's a teammate to talk to */}
        {teamCount > 1 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 px-3 pb-1.5">
              <span className="font-display text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                Team
              </span>
              <span className="h-px flex-1 bg-white/10" aria-hidden />
            </div>
            <div className="space-y-0.5">{navLink("/app/chat", "Chat", MessagesSquare)}</div>
          </div>
        )}
      </nav>

      {/* Settings + user */}
      <div className="px-3 py-3 border-t border-white/10 space-y-0.5">
        {manager && navLink("/app/settings/booking", "Forms", Globe)}
        {manager && navLink("/app/settings/team", "Team", UserPlus)}
        {manager && navLink("/app/settings", "Settings", Settings)}
        <UserMenu userName={userName} userEmail={userEmail} />
        <p className="px-3 pt-1.5 pb-1 text-[10px] text-white/35 flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/streamflaire-hub-mark.png"
            alt=""
            className="h-2.5 w-auto shrink-0 opacity-60 brightness-0 invert"
          />
          Powered by Streamflaire Hub
        </p>
      </div>
    </>
  );

  // Sidebar header is the company's identity, not ours (their logo when
  // uploaded, otherwise a brand-colored initial tile). Wide wordmark logos
  // already carry the name — show them big and alone; squarish marks sit
  // next to the company name.
  const logo = (
    <div className="flex items-center gap-2.5 px-5 py-2.5 min-h-[57px] border-b border-white/10 min-w-0">
      {companyLogoUrl ? (
        logoIsWide ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={companyLogoUrl}
            alt={companyName ?? ""}
            className="theme-fixed h-10 w-auto max-w-[176px] rounded-md object-contain bg-white px-1.5 py-1 ring-1 ring-white/20"
          />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={companyLogoUrl}
              alt=""
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > img.naturalHeight * 1.5) setLogoIsWide(true);
              }}
              className="theme-fixed h-10 w-10 rounded-md object-contain bg-white p-0.5 shrink-0 ring-1 ring-white/20"
            />
            <span className="font-display font-bold text-[14px] tracking-tight text-white truncate">
              {companyName ?? "Streamflaire Hub"}
            </span>
          </>
        )
      ) : (
        <>
          <div
            className="chamfer w-9 h-9 rounded-md flex items-center justify-center shrink-0 font-display font-bold text-sm"
            style={{ backgroundColor: accent, color: textOn(accent) }}
          >
            {companyName?.charAt(0).toUpperCase() ?? "J"}
          </div>
          <span className="font-display font-bold text-[14px] tracking-tight text-white truncate">
            {companyName ?? "Streamflaire Hub"}
          </span>
        </>
      )}
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
    <div className="app-ui flex h-screen bg-paper overflow-hidden" style={mobileAccentVars}>
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-[232px] bg-rail shrink-0">
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
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-rail flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-transform duration-200 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between pr-4 border-b border-white/10">
          <div className="border-b-0">{logo}</div>
          <button
            onClick={() => setMobileOpen(false)}
            className="text-white/60 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        {sidebarInner}
      </aside>

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-4 px-4 lg:px-6 min-h-[57px] pt-[env(safe-area-inset-top)] border-b border-gray-200 bg-white shrink-0">
          {/* Company name lives in the sidebar on desktop; header shows it on
              mobile. The hamburger is retired — the More tab opens the drawer. */}
          <span className="lg:hidden font-display font-bold text-[15px] text-gray-900 truncate">
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
        <main className="app-main flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
      </div>

      <MobileTabBar
        role={userRole}
        isActive={isActive}
        pastDue={counts.pastDue}
        aiEnabled={aiEnabled}
        assistantName={assistantName || "Atlas"}
        assistantOpen={assistantOpen}
        openAssistant={() => setAssistantOpen(true)}
        openMore={() => setMobileOpen(true)}
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
          className="chamfer fixed z-40 hidden lg:flex h-[52px] w-[52px] items-center justify-center rounded-lg bg-[#0C0F0C] text-green-400 transition-all hover:scale-105 hover:bg-[#181D18] hover:text-green-300 lg:bottom-6 lg:right-6"
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
          <p className="font-display px-5 pt-3.5 pb-2.5 text-[16px] font-bold text-gray-900">
            Create
          </p>
          <div className="grid grid-cols-3 gap-2.5 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {creates.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setSheetOpen(false)}
                className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200 px-1 py-4 active:bg-gray-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--mobile-accent-soft)] text-[color:var(--mobile-accent)]">
                  <Icon size={18} />
                </span>
                <span className="font-display text-[11px] font-semibold text-gray-800">
                  {label}
                </span>
              </Link>
            ))}
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
              className="chamfer absolute left-1/2 -translate-x-1/2 -top-4 flex h-12 w-12 items-center justify-center bg-[color:var(--mobile-accent)] text-[color:var(--mobile-on-accent)] active:scale-95 transition-transform"
            >
              <Plus size={22} strokeWidth={2.5} />
            </button>
          </div>
        )}
        {aiEnabled
          ? tabButton(assistantName, AtlasIcon, openAssistant, assistantOpen)
          : tabLink(jobsTab)}
        {tabButton("More", Menu, openMore, false, pastDue > 0)}
      </nav>
    </>
  );
}
