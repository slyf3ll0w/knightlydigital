"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, FileText, Receipt, MessageCircle } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";

/**
 * Portal navigation, two chromes like the operator app:
 * - variant="top"    — underline tabs on the branded hero (desktop only).
 * - variant="bottom" — the app's fixed bottom tab bar (phones only):
 *   bg-chrome material, tab-ink/tab-ink-on brand inks, safe-area inset,
 *   red count badge on Messages. Client component so the active tab can
 *   track the pathname — the hub layout itself stays a server component.
 */
export default function HubNav({
  base,
  variant = "top",
  color,
  badgeTextColor = "#111827",
  unreadMessages = 0,
  currentPath,
}: {
  /** Review frames (/client-preview) aren't served under `base`: this stands in for the pathname. */
  currentPath?: string;
  base: string;
  variant?: "top" | "bottom";
  /** Hero text color (top variant only). */
  color: string;
  /** Color of the number inside the top-variant badge — the header
   *  background, so the badge reads as an inverted chip on the gradient. */
  badgeTextColor?: string;
  /** Company replies the client hasn't seen — badge on the Messages tab. */
  unreadMessages?: number;
}) {
  const routerPath = usePathname();
  const pathname = currentPath ?? routerPath;
  const nav = [
    { href: base, label: "Home", icon: Home },
    { href: `${base}/visits`, label: "Visits", icon: CalendarDays },
    { href: `${base}/quotes`, label: "Quotes", icon: FileText },
    { href: `${base}/invoices`, label: "Invoices", icon: Receipt },
    { href: `${base}/messages`, label: "Messages", icon: MessageCircle, badge: unreadMessages },
  ];
  const isActive = (href: string) =>
    href === base ? pathname === base : pathname.startsWith(href);

  if (variant === "bottom") {
    // iOS tab bar: a blurred bar on a hairline, the company color (made
    // readable, --hh-tint) on the current tab, a red dot on Messages.
    return (
      <nav className="hk-tabbar lg:hidden">
        {nav.map((n) => {
          const active = isActive(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => hapticImpact("LIGHT")}
              aria-current={active ? "page" : undefined}
              className={active ? "hk-tab is-on" : "hk-tab"}
            >
              <span className="relative">
                <Icon size={24} strokeWidth={active ? 2.3 : 1.9} />
                {n.badge ? <span className="hk-tab-dot" aria-label="New" /> : null}
              </span>
              {n.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  // Top tabs sit on the band (hub-heavy.css .hh-tab): white ink, a 3 px
  // underline in the accent on the current tab, the count as an inverted badge.
  return (
    <nav className="flex gap-7">
      {nav.map((n) => {
        const active = isActive(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            style={{ color }}
            className="hh-tab"
          >
            {n.label}
            {n.badge ? (
              <span className="hh-tab-count" style={{ background: color, color: badgeTextColor }}>
                {n.badge > 99 ? "99+" : n.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
