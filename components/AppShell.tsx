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

// Jobber-style grouping: Home + Schedule, then the work lifecycle in order.
const navGroups = [
  [
    { href: "/app/dashboard", label: "Home", icon: Home },
    { href: "/app/schedule", label: "Schedule", icon: CalendarDays },
  ],
  [
    { href: "/app/contacts", label: "Clients", icon: Users },
    { href: "/app/requests", label: "Requests", icon: Inbox },
    { href: "/app/quotes", label: "Quotes", icon: FileText },
    { href: "/app/jobs", label: "Jobs", icon: Briefcase },
    { href: "/app/invoices", label: "Invoices", icon: Receipt },
  ],
  [{ href: "/app/insights", label: "Insights", icon: BarChart3 }],
];

const createItems = [
  { href: "/app/contacts/new", label: "Client", icon: Users },
  { href: "/app/requests/new", label: "Request", icon: Inbox },
  { href: "/app/quotes/new", label: "Quote", icon: FileText },
  { href: "/app/jobs/new", label: "Job", icon: Briefcase },
  { href: "/app/invoices/new", label: "Invoice", icon: Receipt },
  { href: "/app/payments/new", label: "Payment", icon: DollarSign },
];

const mobileNav = [
  { href: "/app/dashboard", label: "Home", icon: Home },
  { href: "/app/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase },
  { href: "/app/invoices", label: "Invoices", icon: Receipt },
];

/**
 * Global create menu. Self-contained state + ref so each sidebar instance
 * (desktop + mobile drawer) gets its own — a shared ref made the click-outside
 * handler swallow item clicks.
 */
function CreateMenu({ accent }: { accent: string }) {
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
          {createItems.map(({ href, label, icon: Icon }) => (
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
  companyName?: string | null;
  companyLogoUrl?: string | null;
  brandColor?: string | null;
}

export default function AppShell({
  children,
  userName,
  userEmail,
  companyName,
  companyLogoUrl,
  brandColor,
}: AppShellProps) {
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
    // Booking Form lives under /app/settings/ but has its own nav item
    if (href === "/app/settings") {
      return pathname.startsWith(href) && !pathname.startsWith("/app/settings/booking");
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
      <CreateMenu accent={accent} />

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {navGroups.map((group, i) => (
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
        {navLink("/app/settings/booking", "Booking Form", Globe)}
        {navLink("/app/settings", "Settings", Settings)}
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
        <p className="px-3 pt-1.5 pb-1 text-[10px] text-white/30 flex items-center gap-1">
          <Briefcase size={9} className="shrink-0" />
          Powered by JobFlow
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
        {companyName ?? "JobFlow"}
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
            {companyName ?? "JobFlow"}
          </span>

          <form onSubmit={onSearch} className="ml-auto hidden sm:block w-full max-w-xs">
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
            href="/app/settings"
            className="hidden sm:flex p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            title="Settings"
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
        {mobileNav.map(({ href, label, icon: Icon }) => {
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
