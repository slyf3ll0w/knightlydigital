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
}: {
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
  const pathname = usePathname();
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
    return (
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-chrome border-t border-gray-200 flex items-stretch pb-[env(safe-area-inset-bottom)]">
        {nav.map((n) => {
          const active = isActive(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => hapticImpact("LIGHT")}
              className={`flex-1 flex flex-col items-center gap-1 pt-2 pb-2.5 text-[10.5px] transition-colors ${
                active ? "tab-ink-on font-semibold" : "tab-ink font-medium"
              }`}
            >
              <span className="relative">
                <Icon size={23} strokeWidth={active ? 2.2 : 1.9} />
                {n.badge ? (
                  <span className="absolute -top-1 -right-1.5 flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[color:var(--fab-ring)]" />
                ) : null}
              </span>
              {n.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex gap-5">
      {nav.map((n) => {
        const active = isActive(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            style={{ color }}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-opacity ${
              active ? "border-current" : "border-transparent opacity-60 hover:opacity-90"
            }`}
          >
            {n.label}
            {n.badge ? (
              <span
                className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold align-middle"
                style={{ background: color, color: badgeTextColor }}
              >
                {n.badge > 99 ? "99+" : n.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
