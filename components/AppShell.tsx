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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
function CreateMenu() {
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
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-md shadow-sm transition-colors"
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
}

export default function AppShell({ children, userName, userEmail, companyName }: AppShellProps) {
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
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-green-500" />
        )}
        <Icon size={16} className={active ? "text-green-400" : ""} />
        {label}
      </Link>
    );
  };

  const sidebarInner = (
    <>
      <CreateMenu />

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
        {navLink("/app/settings", "Settings", Settings)}
        <div className="px-3 py-2.5 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs font-bold shrink-0">
            {userName?.charAt(0).toUpperCase() ?? "?"}
          </div>
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
      </div>
    </>
  );

  const logo = (
    <div className="flex items-center gap-2.5 px-5 py-[17px] border-b border-white/[0.07]">
      <div className="w-7 h-7 bg-green-500 rounded-md flex items-center justify-center shrink-0">
        <Briefcase size={14} className="text-[#0C0F0C]" />
      </div>
      <div className="leading-none">
        <span className="font-bold text-[15px] tracking-tight text-white">JobFlow</span>
        <span className="block text-[10px] text-white/35 mt-0.5">by Streamflaire</span>
      </div>
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
          <span className="font-semibold text-[15px] text-gray-900 truncate">
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
          <div
            className="hidden sm:flex w-8 h-8 rounded-full bg-[#0C0F0C] items-center justify-center text-green-400 text-xs font-bold shrink-0"
            title={userName ?? undefined}
          >
            {userName?.charAt(0).toUpperCase() ?? "?"}
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">{children}</main>
      </div>

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex">
        {mobileNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              isActive(href) ? "text-green-600" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
