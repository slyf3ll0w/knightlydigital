"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const navLinks = [
  {
    href: "/admin/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    href: "/admin/clients",
    label: "Clients",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
  },
  {
    href: "/admin/messages",
    label: "Messages",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
  },
  {
    href: "/admin/orders",
    label: "Orders",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <path d="M9 12h6M9 16h4"/>
      </svg>
    ),
  },
];

const teamLink = {
  href: "/admin/staff",
  label: "Team",
  icon: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
};

type Props = {
  children: React.ReactNode;
  userName: string;
  unreadCount?: number;
  userRole?: string;
};

export function AdminShell({ children, userName, unreadCount = 0, userRole }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = userRole === "ADMIN";
  const allLinks = isAdmin ? [...navLinks, teamLink] : navLinks;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F7F5' }}>

      {/* Header */}
      <header
        className="shrink-0 z-30 flex items-center justify-between px-5 py-0"
        style={{ backgroundColor: '#0C0F0C', borderBottom: '1px solid rgba(255,255,255,0.08)', height: '56px' }}
      >
        <div className="flex items-center gap-4">
          <button
            className="lg:hidden p-1"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
          </button>
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.png"
              alt="Streamflare"
              width={130}
              height={26}
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </Link>
          <span
            className="text-xs font-bold uppercase tracking-widest hidden sm:block px-2 py-0.5"
            style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)' }}
          >
            {userRole === "STAFF" ? "Staff" : "Admin"}
          </span>
        </div>

        <div className="flex items-center gap-5">
          <span className="text-sm hidden sm:block" style={{ color: 'rgba(255,255,255,0.55)' }}>{userName}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/portal/login" })}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors px-3 py-1.5"
            style={{ color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Sign Out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside
          className={`${mobileOpen ? "block" : "hidden"} lg:block w-52 shrink-0 flex flex-col absolute lg:relative z-20 h-full lg:h-auto`}
          style={{ backgroundColor: '#ffffff', borderRight: '1px solid #E5E7EB' }}
        >
          <nav className="flex flex-col p-3 gap-0.5 pt-4">
            {allLinks.map((item) => {
              const active = pathname === item.href || (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors relative"
                  style={{
                    backgroundColor: active ? '#22C55E' : 'transparent',
                    color: active ? '#ffffff' : '#6B7280',
                    fontFamily: 'Oxanium, system-ui, sans-serif',
                  }}
                >
                  {item.icon}
                  {item.label}
                  {item.label === "Messages" && unreadCount > 0 && (
                    <span
                      className="ml-auto text-xs font-black px-1.5 py-0.5 min-w-[1.2rem] text-center"
                      style={{ backgroundColor: '#EF4444', color: '#ffffff' }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 overflow-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
