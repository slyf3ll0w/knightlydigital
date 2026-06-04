"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

type NavItem = { href: string; label: string; icon: React.ReactNode };

const clientNav: NavItem[] = [
  {
    href: "/portal/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    href: "/portal/messages",
    label: "Messages",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
  },
  {
    href: "/portal/orders",
    label: "My Orders",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <path d="M9 12h6M9 16h4"/>
      </svg>
    ),
  },
  {
    href: "/portal/onboarding",
    label: "Onboarding",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
];

type Props = {
  children: React.ReactNode;
  userName: string;
  unreadCount?: number;
};

export function PortalShell({ children, userName, unreadCount = 0 }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      {/* Top bar */}
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
          <span className="text-xs text-primary-foreground/50 font-bold uppercase tracking-widest hidden sm:block">
            Client Portal
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-primary-foreground/70 hidden sm:block">
            {userName}
          </span>
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
        {/* Sidebar */}
        <aside className={`${mobileOpen ? "block" : "hidden"} lg:block w-56 bg-white border-r border-border shrink-0 flex flex-col absolute lg:relative z-20 h-full lg:h-auto`}>
          <nav className="flex flex-col p-4 gap-1">
            {clientNav.map((item) => {
              const active = pathname === item.href;
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

          <div className="mt-auto p-4 border-t border-border">
            <Link
              href="/contact"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-accent transition-colors font-bold uppercase tracking-wide"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
              Need Help?
            </Link>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
