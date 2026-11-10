import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ChevronRight, Gift, RefreshCw } from "lucide-react";
import { InfoTip } from "@/components/ds";
import ConnectSquareButton from "@/components/ConnectSquareButton";
import { listHref } from "@/components/FilterBar";
import { squareDashboardUrl, type SquareDashboardScreen } from "@/lib/square-links";
import type { SellerReadFailure } from "@/lib/square-seller-reports";

/**
 * Small server-rendered pieces shared by the Square tabs on /app/payments:
 * the tab bar, the "Reconnect Square" card, the "Square didn't answer" line,
 * the back link a detail screen shows on a phone, and the deep-link rows for
 * what stays in the Square dashboard.
 */

export type SquareTab = "payments" | "payouts" | "disputes" | "reports" | "giftcards";
export const SQUARE_TABS: readonly SquareTab[] = ["payments", "payouts", "disputes", "reports", "giftcards"];

export function parseSquareTab(v: string | undefined): SquareTab {
  return (SQUARE_TABS as readonly string[]).includes(v ?? "") ? (v as SquareTab) : "payments";
}

const TAB_OPTIONS = [
  { value: "", label: "Payments" },
  { value: "payouts", label: "Payouts" },
  { value: "disputes", label: "Disputes" },
  { value: "reports", label: "Reports" },
  // Gift cards keep their ?tab= URL but left the bar on 2026-10-30 (rarely
  // visited): GiftCardsRow below and Settings → Payments & accounting reach them.
];

/**
 * Payments · Payouts · Disputes · Reports as an underline tab bar (Stripe's
 * shape, 2026-11-10 redesign), scrolling sideways on a phone; Square's own
 * dashboard and gift cards sit at its right end.
 */
export function SquareTabs({
  tab,
  openDisputes,
  sandbox,
  giftCards,
  keep = {},
}: {
  tab: SquareTab;
  openDisputes: number;
  sandbox: boolean;
  giftCards: boolean;
  /** Query params that survive a tab change (the volume range). */
  keep?: Record<string, string | undefined>;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-b border-[color:var(--ds-line)]">
      <nav aria-label="Payments sections" className="-mb-px flex min-w-0 gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TAB_OPTIONS.map((o) => {
          const active = (tab === "payments" ? "" : tab) === o.value;
          return (
            <Link
              key={o.value || "payments"}
              prefetch={false}
              scroll={false}
              href={listHref("/app/payments", {}, { ...keep, tab: o.value || undefined })}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors ${
                active
                  ? "border-[color:var(--ds-primary)] text-[color:var(--ds-ink)]"
                  : "border-transparent text-[color:var(--ds-muted)] hover:text-[color:var(--ds-ink)]"
              }`}
            >
              {o.label}
              {o.value === "disputes" && openDisputes > 0 && (
                <span className="rounded-full bg-[color:var(--ds-bad-soft)] px-1.5 text-[11px] font-semibold text-[color:var(--ds-bad)]">{openDisputes}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="hidden shrink-0 items-center gap-4 pb-2.5 text-xs font-medium text-[color:var(--ds-muted)] sm:flex">
        {giftCards && (
          <Link prefetch={false} href="/app/payments?tab=giftcards" className="inline-flex items-center gap-1 hover:text-[color:var(--ds-ink)]">
            <Gift size={13} /> Gift cards
          </Link>
        )}
        <a href={squareLink("transactions", sandbox)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[color:var(--ds-ink)]">
          Square dashboard <ArrowUpRight size={13} />
        </a>
      </div>
    </div>
  );
}

/** Phones: the two links the tab bar carries at its right end on a desk. */
export function SquarePhoneLinks({ sandbox, giftCards }: { sandbox: boolean; giftCards: boolean }) {
  return (
    <div className="mb-8 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-[color:var(--ds-muted)] sm:hidden">
      {giftCards && (
        <Link prefetch={false} href="/app/payments?tab=giftcards" className="inline-flex items-center gap-1.5">
          <Gift size={14} /> Gift cards
        </Link>
      )}
      <a href={squareLink("transactions", sandbox)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
        Square dashboard <ArrowUpRight size={14} />
      </a>
    </div>
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
export function ReconnectCard({ what, canReconnect, lost = false }: { what: string; canReconnect: boolean; lost?: boolean }) {
  return (
    <div className="ds-card mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[color:var(--ds-primary)]">Square</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[color:var(--ds-ink)]">
            {lost ? "WorkBench lost its Square sign-in — reconnect Square to see payments, payouts and disputes." : `Reconnect Square to see ${what}.`}
            {!lost && (
            <InfoTip>
              WorkBench now reads more from your Square account — payouts, disputes, the items behind a sale and gift
              cards. Your Square connection was made before that, so Square needs you to approve it
              once more — the same sign-in as the first time. Nothing else changes; payments keep working meanwhile.
            </InfoTip>
            )}
          </p>
        </div>
        {canReconnect ? (
          <ConnectSquareButton className="btn-primary">
            <RefreshCw size={14} /> Reconnect Square
          </ConnectSquareButton>
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

/** Gift cards: run from WorkBench on the seller's Square account, reached from this row rather than the tab bar (2026-10-30). */
export function GiftCardsRow() {
  return (
    <div className="ds-card overflow-hidden">
      <Link
        prefetch={false}
        href="/app/payments?tab=giftcards"
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100"
      >
        <Gift size={16} className="shrink-0 text-gray-400" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">Gift cards</span>
          <span className="block truncate text-xs text-gray-500">Sell a card, check a balance, every card on your Square account</span>
        </span>
        <ChevronRight size={14} className="text-gray-400" />
      </Link>
    </div>
  );
}
