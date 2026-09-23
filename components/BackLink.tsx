import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * The back arrow at the top of a detail / new / edit page.
 *
 * The rule: it renders on desktop only. On phones the AppShell header owns
 * back navigation (lib/mobile-nav.ts `mobileBackFor` names the page you came
 * from), so a second arrow in the page body would be a duplicate. The target
 * is the page's parent — the same "up" that `parentFor` in lib/mobile-nav.ts
 * resolves for the route (a record's section list, or the hub a page hangs
 * off), so desktop and phone agree on where back lands. Pages reached from
 * two parents (an invoice started from a job, a contract from a client) may
 * pass the origin instead.
 *
 * Sits first in the header row: `[BackLink] [StatusChip]`, then the
 * PageTitle row underneath.
 */
export default function BackLink({
  href,
  label = "Back",
  className,
}: {
  href: string;
  /** Screen-reader name only — the control is just the arrow. */
  label?: string;
  className?: string;
}) {
  return (
    <Link
      prefetch={false}
      href={href}
      aria-label={label}
      className={`hidden lg:block text-gray-400 hover:text-gray-600 ${className ?? ""}`}
    >
      <ArrowLeft size={18} />
    </Link>
  );
}
