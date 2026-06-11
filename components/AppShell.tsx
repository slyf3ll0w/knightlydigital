"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

interface AppShellProps {
  children: React.ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  companyName?: string | null;
}

export default function AppShell({ children, userName, userEmail, companyName }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);

  // Auth pages render standalone even when a session cookie exists
  const isAuthPage = pathname.startsWith("/app/login") || pathname.startsWith("/app/register");

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (createRef.current && !createRef.current.contains(e.target as Node)) {
        setCreateOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    setCreateOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    if (href === "/app/dashboard") return pathname === href;
    return pathname.startsWith(href);
  }

  if (isAuthPage) return <>{children}</>;

  const navLink = (href: string, label: string, Icon: typeof Home, onClick?: () => void) => (
    <Link
      key={href}
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${
        isActive(href)
          ? "bg-green-500/15 text-green-400"
          : "text-white/60 hover:text-white hover:bg-white/5"
      }`}
    >
      <Icon size={16} />
      {label}
    </Link>
  );

  const sidebarInner = (
    <>
      {/* Global create */}
      <div className="px-3 pt-4 relative" ref={createRef}>
        <button
          onClick={() => setCreateOpen((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-500 hover:bg-green-600 text-black text-sm font-bold rounded transition-colors"
        >
          <Plus size={15} />
          Create
        </button>
        {createOpen && (
          <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5 overflow-hidden">
            {createItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Icon size={14} className="text-gray-400" />
                {label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {navGroups.map((group, i) => (
          <div key={i}>
            {i > 0 && <div className="my-3 border-t border-white/10" />}
            <div className="space-y-0.5">
              {group.map(({ href, label, icon: Icon }) => navLink(href, label, Icon))}
            </div>
          </div>
        ))}
      </nav>

      {/* Settings + user */}
      <div className="px-3 py-4 border-t border-white/10 space-y-0.5">
        {navLink("/app/settings", "Settings", Settings)}
        <div className="px-3 py-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs font-bold">
            {userName?.charAt(0).toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-white/40 truncate">{userEmail}</p>
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

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 bg-[#0C0F0C] text-white shrink-0">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
          <div className="w-7 h-7 bg-green-500 rounded flex items-center justify-center shrink-0">
            <Briefcase size={14} className="text-black" />
          </div>
          <span className="font-bold text-sm tracking-wide uppercase">JobFlow</span>
          <span className="text-xs text-white/40 ml-auto">by Streamflaire</span>
        </div>
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
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0C0F0C] text-white flex flex-col transition-transform duration-200 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-green-500 rounded flex items-center justify-center">
              <Briefcase size={14} className="text-black" />
            </div>
            <span className="font-bold text-sm tracking-wide uppercase">JobFlow</span>
          </div>
          <button onClick={() => setMobileOpen(false)} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>
        {sidebarInner}
      </aside>

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar: company name (Jobber-style) */}
        <header className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden text-gray-600 hover:text-gray-900"
            >
              <Menu size={20} />
            </button>
            <span className="font-semibold text-sm text-gray-900">
              {companyName ?? "JobFlow"}
            </span>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0 bg-gray-50/50">{children}</main>
      </div>

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-100 flex">
        {mobileNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
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
