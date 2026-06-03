"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

type NavItem = { href: string; label: string; icon: React.ReactNode };

const adminNav: NavItem[] = [
  {
    href: "/admin/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    href: "/admin/clients",
    label: "Clients",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
  },
  {
    href: "/admin/orders",
    label: "Orders",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <path d="M9 12h6M9 16h4"/>
      </svg>
    ),
  },
];

type Props = {
  children: React.ReactNode;
  userName: string;
  unreadCount?: number;
};

export function AdminShell({ children, userName, unreadCount = 0 }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      <header className="bg-primary text-primary-foreground px-5 py-3 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-4">
          <button
            className="lg:hidden p-1 text-primary-foreground/70 hover:text-primary-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
          </button>
          <Link href="/">
            <div className="bg-white inline-block px-2 py-1">
              <Image src="/logo.png" alt="Streamflare" width={120} height={30} className="h-6 w-auto object-contain" />
            </div>
          </Link>
          <span className="text-xs text-accent font-black uppercase tracking-widest hidden sm:block">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-primary-foreground/70 hidden sm:block">{userName}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/portal/login" })}
            className="text-xs text-primary-foreground/60 hover:text-primary-foreground font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Sign Out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className={`${mobileOpen ? "block" : "hidden"} lg:block w-56 bg-white border-r border-border shrink-0 flex flex-col absolute lg:relative z-20 h-full lg:h-auto`}>
          <nav className="flex flex-col p-4 gap-1">
            {adminNav.map((item) => {
              const active = pathname === item.href || (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 text-sm font-bold transition-colors relative ${
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground/70 hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {item.icon}
                  {item.label}
                  {item.label === "Messages" && unreadCount > 0 && (
                    <span className="ml-auto bg-destructive text-white text-xs font-black px-1.5 py-0.5 min-w-[1.2rem] text-center">
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
