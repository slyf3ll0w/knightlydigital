"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Payment-verification status + waiver toggle. Waiving exempts the company
 * from the /app/activate underwriting gate — for test accounts and comped
 * users, since every normal company must be Finix-approved to use the app.
 */
export function PaymentsControl({
  companyId,
  onboardingState,
  paymentsWaived,
}: {
  companyId: string;
  onboardingState: string | null;
  paymentsWaived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stateLabel =
    onboardingState === "APPROVED"
      ? "Approved — payments live"
      : onboardingState === "PROVISIONING"
        ? "Under review (form submitted)"
        : onboardingState === "UPDATE_REQUESTED"
          ? "Underwriter needs more info"
          : onboardingState === "REJECTED"
            ? "Rejected by underwriting"
            : "Not started — held at the activation gate";
  const stateTone =
    onboardingState === "APPROVED"
      ? "bg-green-100 text-green-700"
      : onboardingState === "REJECTED"
        ? "bg-red-100 text-red-700"
        : onboardingState
          ? "bg-amber-100 text-amber-700"
          : "bg-gray-100 text-gray-600";

  async function setWaived(waived: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: waived ? "waive-payments" : "require-payments" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Request failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-gray-700">Payment verification</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stateTone}`}>
          {stateLabel}
        </span>
        {paymentsWaived && (
          <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">
            Gate waived
          </span>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        {paymentsWaived
          ? "This company skips the underwriting gate — they can use the app without Finix approval (card payments still require approval to actually charge)."
          : "Companies without Finix approval are held at the activation gate until underwriting approves them."}
      </p>
      <button
        disabled={busy}
        onClick={() => setWaived(!paymentsWaived)}
        className="mt-3 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? "Saving…" : paymentsWaived ? "Require verification" : "Waive verification…"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
