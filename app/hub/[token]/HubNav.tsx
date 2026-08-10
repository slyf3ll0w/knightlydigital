"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Underline-style portal tabs. Client component only so the active tab can
 * track the pathname — the hub layout itself stays a server component.
 */
export default function HubNav({
  base,
  color,
  badgeTextColor = "#111827",
  unreadMessages = 0,
}: {
  base: string;
  color: string;
  /** Color of the number inside the badge — the header background, so the
   *  badge reads as an inverted chip on the brand gradient. */
  badgeTextColor?: string;
  /** Company replies the client hasn't seen — badge on the Messages tab. */
  unreadMessages?: number;
}) {
  const pathname = usePathname();
  const nav = [
    { href: base, label: "Home" },
    { href: `${base}/visits`, label: "Visits" },
    { href: `${base}/quotes`, label: "Quotes" },
    { href: `${base}/invoices`, label: "Invoices" },
    { href: `${base}/messages`, label: "Messages", badge: unreadMessages },
  ];

  return (
    <nav className="flex gap-5">
      {nav.map((n) => {
        const active = n.href === base ? pathname === base : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            style={{ color }}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-opacity ${
              active
                ? "border-current"
                : "border-transparent opacity-60 hover:opacity-90"
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
