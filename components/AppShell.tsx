"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Briefcase,
  CalendarDays,
  Users,
  FileText,
  Receipt,
  Settings,
  LogOut,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

const nav = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase },
  { href: "/app/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/app/contacts", label: "Contacts", icon: Users },
  { href: "/app/quotes", label: "Quotes", icon: FileText },
  { href: "/app/invoices", label: "Invoices", icon: Receipt },
];

const mobileNav = [
  { href: "/app/jobs", label: "Jobs", icon: Briefcase },
  { href: "/app/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/app/contacts", label: "Contacts", icon: Users },
  { href: "/app/invoices", label: "Invoices", icon: Receipt },
  { href: "/app/dashboard", label: "More", icon: Menu },
];

interface AppShellProps {
  children: React.ReactNode;
  userName?: string | null;
  userEmail?: string | null;
}

export default function AppShell({ children, userName, userEmail }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/app/dashboard") return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 bg-[#0C0F0C] text-white shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
          <div className="w-7 h-7 bg-green-500 rounded flex items-center justify-center shrink-0">
            <Briefcase size={14} className="text-black" />
          </div>
          <span className="font-bold text-sm tracking-wide uppercase">JobFlow</span>
          <span className="text-xs text-white/40 ml-auto">by Streamflare</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                isActive(href)
                  ? "bg-green-500/15 text-green-400"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon size={16} />
              {label}
              {isActive(href) && <ChevronRight size={12} className="ml-auto opacity-60" />}
            </Link>
          ))}
        </nav>

        {/* Settings + sign out */}
        <div className="px-3 py-4 border-t border-white/10 space-y-0.5">
          <Link
            href="/app/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
              pathname.startsWith("/app/settings")
                ? "bg-green-500/15 text-green-400"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            <Settings size={16} />
            Settings
          </Link>
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
      </aside>

      {/* ── Mobile drawer overlay ─────────────────────────────────────────── */}
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
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {[...nav, { href: "/app/settings", label: "Settings", icon: Settings }].map(
            ({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                  isActive(href)
                    ? "bg-green-500/15 text-green-400"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          )}
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <button
            onClick={() => signOut({ callbackUrl: "/app/login" })}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 bg-green-500 rounded flex items-center justify-center">
              <Briefcase size={10} className="text-black" />
            </div>
            <span className="font-bold text-sm tracking-wide uppercase text-gray-900">JobFlow</span>
          </div>
          <div className="w-6" />
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">{children}</main>
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
