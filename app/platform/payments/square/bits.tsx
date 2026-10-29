import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ChevronRight, RefreshCw } from "lucide-react";
import { InfoTip } from "@/components/ds";
import FilterBar, { listHref } from "@/components/FilterBar";
import { squareDashboardUrl, type SquareDashboardScreen } from "@/lib/square-links";
import type { SellerReadFailure } from "@/lib/square-seller-reports";

/**
 * Small server-rendered pieces shared by the Square tabs on /app/payments:
 * the tab bar, the "Reconnect Square" card, the "Square didn't answer" line,
 * the back link a detail screen shows on a phone, and the deep-link rows for
 * what stays in the Square dashboard.
 */

export type SquareTab = "payments" | "payouts" | "disputes" | "reports";
export const SQUARE_TABS: readonly SquareTab[] = ["payments", "payouts", "disputes", "reports"];

export function parseSquareTab(v: string | undefined): SquareTab {
  return (SQUARE_TABS as readonly string[]).includes(v ?? "") ? (v as SquareTab) : "payments";
}

const TAB_OPTIONS = [
  { value: "", label: "Payments" },
  { value: "payouts", label: "Payouts" },
  { value: "disputes", label: "Disputes" },
  { value: "reports", label: "Reports" },
];

/** Payments · Payouts · Disputes · Reports — a segmented control on phones, chips on a desk. */
export function SquareTabs({ tab, openDisputes }: { tab: SquareTab; openDisputes: number }) {
  const options = TAB_OPTIONS.map((o) =>
    o.value === "disputes" && openDisputes > 0 ? { ...o, label: `Disputes · ${openDisputes}`, mobile: `Disputes ${openDisputes}` } : o
  );
  return (
    <FilterBar
      options={options}
      value={tab === "payments" ? "" : tab}
      href={(v) => listHref("/app/payments", {}, { tab: v || undefined })}
    />
  );
}

/** Section heading — bold sentence case, the iOS card-list pattern (same as the page). */
export function RuledLabel({ children, info, action }: { children: React.ReactNode; info?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <p className="ds-h2 flex items-center gap-1.5">
        {children}
        {info && <InfoTip>{info}</InfoTip>}
      </p>
      {action}
    </div>
  );
}

/** The grant predates a scope this tab reads with — one reconnect fixes every tab. */
export function ReconnectCard({ what, canReconnect }: { what: string; canReconnect: boolean }) {
  return (
    <div className="ds-card mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[color:var(--ds-primary)]">Square</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[color:var(--ds-ink)]">
            Reconnect Square to see {what}.
            <InfoTip>
              WorkBench now reads payouts and disputes from your Square account. Your Square connection was made before
              that, so Square needs you to approve it once more — the same sign-in as the first time. Nothing else
              changes; payments keep working meanwhile.
            </InfoTip>
          </p>
        </div>
        {canReconnect ? (
          <a href="/api/app/square/connect" className="btn-primary">
            <RefreshCw size={14} /> Reconnect Square
          </a>
        ) : (
          <span className="text-xs text-[color:var(--ds-muted)]">Ask the owner to reconnect Square in Settings.</span>
        )}
      </div>
    </div>
  );
}

/** Square was unreachable: the tab renders what it can and says so in one line. */
export function SquareUnavailable({ failure, what }: { failure: SellerReadFailure; what: string }) {
  return (
    <p className="mb-4 text-xs text-[color:var(--ds-muted)]">
      {failure.transient ? `Square didn't answer just now — ${what} will show once it does.` : failure.message}
    </p>
  );
}

/** Detail screens: the arrow on a desk, a worded link on a phone. */
export function TabBack({ tab, label }: { tab: SquareTab; label: string }) {
  const href = listHref("/app/payments", {}, { tab: tab === "payments" ? undefined : tab });
  return (
    <Link prefetch={false} href={href} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--ds-primary)]">
      <ArrowLeft size={15} />
      {label}
    </Link>
  );
}

export function squareLink(screen: SquareDashboardScreen, sandbox: boolean): string {
  return squareDashboardUrl(screen, sandbox ? "sandbox" : "production");
}

/** Rows that open the Square dashboard — the things that stay Square-only. */
export function SquareLinkRows({
  rows,
  sandbox,
}: {
  rows: { screen: SquareDashboardScreen; title: string; sub?: string }[];
  sandbox: boolean;
}) {
  return (
    <div className="ds-card overflow-hidden">
      <div className="divide-y divide-gray-100">
        {rows.map((r) => (
          <a
            key={r.screen}
            href={squareLink(r.screen, sandbox)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">{r.title}</span>
              {r.sub && <span className="block truncate text-xs text-gray-500">{r.sub}</span>}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              Square <ArrowUpRight size={13} />
            </span>
            <ChevronRight size={14} className="hidden text-gray-400 lg:block" />
          </a>
        ))}
      </div>
    </div>
  );
}
