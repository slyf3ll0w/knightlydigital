"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Home,
  Briefcase,
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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { textOn } from "@/lib/branding";

const DEFAULT_ACCENT = "#22C55E"; // green-500

/** Brand accent, guarded: too-dark colors are invisible on the dark sidebar. */
function sidebarAccent(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return DEFAULT_ACCENT;
  const n = parseInt(m[1], 16);
  const luminance =
    0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return luminance < 60 ? "#ffffff" : hex;
}

// Per-role visibility, mirroring lib/permissions.ts (server still enforces):
// sell = managers/USER/SALES, money = managers/USER/SALES-with-toggle (the
// toggle isn't known client-side, so SALES keeps the nav item and the page
// decides), manage = OWNER/ADMIN.
type NavItem = { href: string; label: string; icon: typeof Home; show?: (role: string) => boolean };

const isManagerRole = (r: string) => r === "OWNER" || r === "ADMIN";
const sellRoles = (r: string) => isManagerRole(r) || r === "USER" || r === "SALES";
const moneyRoles = (r: string) => isManagerRole(r) || r === "USER" || r === "SALES";

// Jobber-style grouping: Home + Schedule, then the work lifecycle in order.
const navGroups: NavItem[][] = [
  [
    { href: "/app/dashboard", label: "Home", icon: Home },
    { href: "/app/schedule", label: "Schedule", icon: CalendarDays },
  ],
  [
    { href: "/app/contacts", label: "Clients", icon: Users, show: sellRoles },
    { href: "/app/requests", label: "Requests", icon: Inbox, show: sellRoles },
    { href: "/app/quotes", label: "Quotes", icon: FileText, show: sellRoles },
    { href: "/app/jobs", label: "Jobs", icon: Briefcase },
    { href: "/app/invoices", label: "Invoices", icon: Receipt, show: moneyRoles },
  ],
  [{ href: "/app/insights", label: "Insights", icon: BarChart3, show: isManagerRole }],
];

const createItems: NavItem[] = [
  { href: "/app/contacts/new", label: "Client", icon: Users, show: sellRoles },
  { href: "/app/requests/new", label: "Request", icon: Inbox, show: sellRoles },
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

interface AppShellProps {
  children: React.ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  role?: string | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  brandColor?: string | null;
}

export default function AppShell({
  children,
  userName,
  userEmail,
  role,
  companyName,
  companyLogoUrl,
  brandColor,
}: AppShellProps) {
  const userRole = role ?? "OWNER";
  const manager = isManagerRole(userRole);
  const accent = sidebarAccent(brandColor || DEFAULT_ACCENT);
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Auth pages render standalone even when a session cookie exists
  const isAuthPage = pathname.startsWith("/app/login") || pathname.startsWith("/app/register");

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    if (href === "/app/dashboard") return pathname === href;
    // Booking Form / Team / My Profile live under /app/settings/ but have
    // their own nav items
    if (href === "/app/settings") {
      return (
        pathname.startsWith(href) &&
        !pathname.startsWith("/app/settings/booking") &&
        !pathname.startsWith("/app/settings/team") &&
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
    return (
      <Link
        key={href}
        href={href}
        className={`relative flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
          active ? "bg-white/[0.07] text-white" : "text-white/55 hover:text-white hover:bg-white/[0.04]"
        }`}
      >
        {active && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
            style={{ backgroundColor: accent }}
          />
        )}
        <Icon size={16} style={active ? { color: accent } : undefined} />
        {label}
      </Link>
    );
  };

  const sidebarInner = (
    <>
      <CreateMenu accent={accent} role={userRole} />

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {navGroups
          .map((group) => forRole(group, userRole))
          .filter((group) => group.length > 0)
          .map((group, i) => (
            <div key={i}>
              {i > 0 && <div className="my-3 border-t border-white/[0.07]" />}
              <div className="space-y-0.5">
                {group.map(({ href, label, icon: Icon }) => navLink(href, label, Icon))}
              </div>
            </div>
          ))}
      </nav>

      {/* Settings + user */}
      <div className="px-3 py-3 border-t border-white/[0.07] space-y-0.5">
        {manager && navLink("/app/settings/booking", "Booking Form", Globe)}
        {manager && navLink("/app/settings/team", "Team", UserPlus)}
        {manager && navLink("/app/settings", "Settings", Settings)}
        {!manager && navLink("/app/settings/profile", "My Profile", Settings)}
        <div className="px-3 py-2.5 flex items-center gap-3">
          <Avatar name={userName} size={28} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{userName}</p>
            <p className="text-[11px] text-white/40 truncate">{userEmail}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/app/login" })}
            className="text-white/40 hover:text-white/80 transition-colors"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
        <p className="px-3 pt-1.5 pb-1 text-[10px] text-white/30 flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/streamflaire-hub-mark.png" alt="" className="h-2.5 w-auto shrink-0 opacity-60" />
          Powered by Streamflaire Hub
        </p>
      </div>
    </>
  );

  // Sidebar header is the company's identity, not ours (their logo when
  // uploaded, otherwise a brand-colored initial tile).
  const logo = (
    <div className="flex items-center gap-2.5 px-5 py-[15px] border-b border-white/[0.07] min-w-0">
      {companyLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={companyLogoUrl}
          alt=""
          className="h-8 w-8 rounded-md object-contain bg-white p-0.5 shrink-0"
        />
      ) : (
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 font-bold text-sm"
          style={{ backgroundColor: accent, color: textOn(accent) }}
        >
          {companyName?.charAt(0).toUpperCase() ?? "J"}
        </div>
      )}
      <span className="font-bold text-[14px] tracking-tight text-white truncate">
        {companyName ?? "Streamflaire Hub"}
      </span>
    </div>
  );

  return (
    <div className="app-ui flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-[232px] bg-[#0C0F0C] shrink-0">
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
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-[#0C0F0C] flex flex-col transition-transform duration-200 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between pr-4 border-b border-white/[0.07]">
          <div className="border-b-0">{logo}</div>
          <button onClick={() => setMobileOpen(false)} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>
        {sidebarInner}
      </aside>

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-4 px-4 lg:px-6 h-[57px] border-b border-gray-200 bg-white shrink-0">
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
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">{children}</main>
      </div>

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex">
        {forRole(mobileNav, userRole).map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              style={active ? { color: accent } : undefined}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
