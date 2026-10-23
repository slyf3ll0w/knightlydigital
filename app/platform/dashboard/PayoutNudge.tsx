import Link from "next/link";
import { ArrowUpRight, Landmark } from "lucide-react";
import { SQUARE_BANK_ACCOUNTS_URL } from "@/lib/square-links";

/**
 * Home: Square is connected but the account has no bank account to pay out
 * to (SquareConnection.payoutStatus = NONE — refreshSquarePayoutStatus in
 * lib/square-connection.ts). Managers only. No Hide: money would pile up in
 * a Square balance nobody can reach; the card leaves on its own once Square
 * reports a verified account (re-checked every few hours, or Settings →
 * Online Payments → "check again").
 */
export default function PayoutNudge({ className = "" }: { className?: string }) {
  return (
    <div className={`card-ledger flex flex-wrap items-center gap-3 p-4 ${className}`} role="status">
      <Landmark size={18} className="shrink-0 text-[color:var(--ds-warn)]" />
      <p className="min-w-52 flex-1 text-sm text-gray-700">
        <span className="font-semibold text-[color:var(--ds-ink)]">Add your bank account to Square.</span> Clients can
        pay you, but Square can&apos;t pay you out until a bank account is linked.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Link prefetch={false} href="/app/settings?s=payments" className="btn-secondary btn-sm">
          Details
        </Link>
        <a href={SQUARE_BANK_ACCOUNTS_URL} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm">
          Add it in Square <ArrowUpRight size={13} />
        </a>
      </div>
    </div>
  );
}
