"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Inbox,
  Library,
  Loader2,
  LogOut,
  Mail,
  MessageSquare,
  SquareKanban,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import ConsoleSearch from "./ConsoleSearch";

/**
 * The platform console's shell — the tenant app's look (rail-gray sidebar,
 * the sliding indicator, Lexend, the .ds tokens in both themes) without the
 * tenant app's machinery (softphone, tour, Atlas, brand hooks). WorkBench
 * blue / orange are the fixed brand here since there is no tenant.
 *
 * Desktop: rail on the left, a top bar with search, the page. Phones: a
 * top bar with search and sign-out, a row of section chips, the page in one
 * column (design rule 8 — simpler, not smaller).
 */

export type ConsoleCounts = { pending: number; feedback: number; contact: number; leads: number };

type Item = { href: string; label: string; icon: LucideIcon; badge?: keyof ConsoleCounts };
const GROUPS: { key: string; label: string; items: Item[] }[] = [
  {
    key: "accounts",
    label: "Accounts",
    items: [
      { href: "/superadmin", label: "Accounts", icon: Building2 },
      { href: "/superadmin/leads", label: "Leads", icon: SquareKanban, badge: "leads" },
      { href: "/superadmin/signups", label: "Sign-ups", icon: Inbox, badge: "pending" },
      { href: "/superadmin/contact", label: "Contact form", icon: Mail, badge: "contact" },
    ],
  },
  { key: "money", label: "Money", items: [{ href: "/superadmin/profitability", label: "Profitability", icon: TrendingUp }] },
  {
    key: "product",
    label: "Product",
    items: [
      { href: "/superadmin/feedback", label: "Feedback", icon: MessageSquare, badge: "feedback" },
      { href: "/superadmin/library", label: "Library", icon: Library },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/superadmin") return pathname === "/superadmin" || pathname.startsWith("/superadmin/company/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function useSignOut() {
  const [loading, setLoading] = useState(false);
  return {
    loading,
    async signOut() {
      setLoading(true);
      try {
        await fetch("/api/superadmin/session", { method: "DELETE" });
      } catch {
        // Cookie may already be gone; the login redirect below sorts it out.
      }
      window.location.href = "/superadmin/login";
    },
  };
}

export default function ConsoleShell({
  user,
  counts,
  children,
}: {
  user: { name: string; email: string };
  counts: ConsoleCounts;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/superadmin";
  const navRef = useRef<HTMLElement>(null);
  const indRef = useRef<HTMLSpanElement>(null);
  const { loading, signOut } = useSignOut();

  // The one accent on the rail: the bar slides to the active row (same
  // hardware as AppShell — .rail-indicator in globals.css).
  useLayoutEffect(() => {
    const nav = navRef.current;
    const ind = indRef.current;
    if (!nav || !ind) return;
    const active = nav.querySelector<HTMLAnchorElement>('a[data-rail-active="true"]');
    if (!active) {
      ind.classList.remove("rail-indicator-on");
      return;
    }
    ind.style.transform = `translateY(${active.offsetTop}px)`;
    ind.style.height = `${active.offsetHeight}px`;
    ind.classList.add("rail-indicator-on");
  }, [pathname]);

  // Floating surfaces (info bubbles, quick menus) portal to <body>, outside
  // this tree — the glass material and the .ds tokens only reach them when
  // body carries the classes, exactly as AppShell does for the tenant app.
  useEffect(() => {
    const body = document.body;
    body.classList.add("app-ui", "ds");
    return () => body.classList.remove("app-ui", "ds");
  }, []);

  // The console is a working screen, not a marketing page: title it.
  useEffect(() => {
    const hit = GROUPS.flatMap((g) => g.items).find((i) => isActive(pathname, i.href));
    document.title = `${hit?.label ?? "Console"} · WorkBench console`;
  }, [pathname]);

  const badge = (item: Item) => (item.badge ? counts[item.badge] : 0);

  const railLink = (item: Item) => {
    const active = isActive(pathname, item.href);
    const n = badge(item);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        prefetch={false}
        href={item.href}
        data-rail-active={active ? "true" : undefined}
        className={`group font-display flex items-center gap-2.5 py-2 pl-4 pr-4 text-[13px] transition-colors ${
          active
            ? "font-semibold"
            : "font-medium text-[color:var(--rail-muted)] hover:bg-[var(--rail-hover)] hover:text-[color:var(--rail-ink)]"
        }`}
      >
        <Icon
          size={16}
          strokeWidth={1.8}
          className={
            active
              ? "text-[color:var(--rail-accent)]"
              : "text-[color:var(--rail-faint)] transition-colors group-hover:text-[color:var(--rail-muted)]"
          }
        />
        <span className="truncate">{item.label}</span>
        {n > 0 && (
          <span key={n} className="rail-count ml-auto text-[color:var(--rail-news,var(--rail-num))]">
            {n > 99 ? "99+" : n}
          </span>
        )}
      </Link>
    );
  };

  const wordmark = (
    <Link href="/superadmin" prefetch={false} aria-label="Console home" className="flex items-center gap-2.5">
      <span className="theme-fixed flex h-8 items-center rounded-lg bg-white px-2 shadow-sm ring-1 ring-[color:var(--ds-line)]">
        <Image src="/workbench-logo.png" alt="WorkBench" width={1714} height={285} priority className="h-4 w-auto" />
      </span>
      <span className="ds-eyebrow ds-eyebrow-plain text-[11px] font-semibold uppercase tracking-[0.14em]">Console</span>
    </Link>
  );

  return (
    <div
      className="app-ui ds flex min-h-screen flex-col bg-[color:var(--ds-canvas)] lg:flex-row"
      style={{ "--rail-accent-l": "#0B57D8", "--rail-accent-d": "#8DB4FF", "--rail-news": "var(--ds-secondary-strong)" } as React.CSSProperties}
    >
      {/* ── Desktop rail ─────────────────────────────────────────────── */}
      <aside className="rail-gray hidden w-[232px] shrink-0 flex-col border-r border-[color:var(--rail-line)] lg:flex">
        <div className="flex min-h-[57px] items-center border-b border-[color:var(--rail-line)] px-3.5">{wordmark}</div>
        <nav ref={navRef} className="relative flex-1 overflow-y-auto py-3">
          <span ref={indRef} aria-hidden className="rail-indicator" />
          {GROUPS.map((g, gi) => (
            <div key={g.key} className={gi > 0 ? "mt-3" : ""}>
              <div className="font-display flex items-center gap-2.5 py-2 pl-4 pr-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--rail-muted)]">
                <span className="shrink-0">{g.label}</span>
                <span aria-hidden className="rail-head-rule" />
              </div>
              {g.items.map(railLink)}
            </div>
          ))}
        </nav>
        <div className="border-t border-[color:var(--rail-line)] px-4 py-3">
          <p className="truncate text-xs font-semibold text-[color:var(--rail-ink)]">{user.name}</p>
          <p className="truncate text-[11px] text-[color:var(--rail-faint)]">{user.email}</p>
          <button
            type="button"
            onClick={signOut}
            disabled={loading}
            className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-[color:var(--rail-muted)] transition-colors hover:text-[color:var(--rail-ink)] disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Top bar ────────────────────────────────────────────────── */}
        <header className="app-header bg-chrome sticky top-0 z-40 flex min-h-[57px] shrink-0 items-center gap-3 border-b border-[color:var(--ds-line)] px-4 pt-[env(safe-area-inset-top)] lg:px-6">
          <span className="lg:hidden">{wordmark}</span>
          <div className="min-w-0 flex-1 lg:max-w-md">
            <ConsoleSearch />
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={loading}
            aria-label="Sign out of the console"
            className="ds-disc lg:hidden"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
          </button>
        </header>

        {/* ── Phone section chips ────────────────────────────────────── */}
        <nav className="flex gap-1.5 overflow-x-auto border-b border-[color:var(--ds-line)] bg-[color:var(--ds-surface)] px-4 py-2 lg:hidden [scrollbar-width:none]">
          {GROUPS.flatMap((g) => g.items).map((item) => {
            const active = isActive(pathname, item.href);
            const n = badge(item);
            return (
              <Link
                key={item.href}
                prefetch={false}
                href={item.href}
                className={`ds-btn ds-btn-sm shrink-0 ${active ? "ds-btn-soft" : "ds-btn-ghost"}`}
              >
                {item.label}
                {n > 0 && <span className="ds-count-news rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none">{n}</span>}
              </Link>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
