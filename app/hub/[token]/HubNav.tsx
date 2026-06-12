"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Underline-style portal tabs. Client component only so the active tab can
 * track the pathname — the hub layout itself stays a server component.
 */
export default function HubNav({ base, color }: { base: string; color: string }) {
  const pathname = usePathname();
  const nav = [
    { href: base, label: "Home" },
    { href: `${base}/quotes`, label: "Quotes" },
    { href: `${base}/invoices`, label: "Invoices" },
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
          </Link>
        );
      })}
    </nav>
  );
}
