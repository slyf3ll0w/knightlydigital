"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Chip, InfoTip } from "@/components/ds";

/**
 * Online-payments status for this company on the live processor.
 *
 * Square (the platform processor since 2026-10-22): the owner connects their
 * own Square account from Settings, nothing to approve here. A self-serve
 * sign-up is held at the payment-setup step until it does (2026-11-03,
 * `paymentsRequiredAt`); the waiver toggle lets one in without connecting.
 * Finix (PAYMENT_PROCESSOR=finix): verification status + the same waiver,
 * exempting the company from the /app/activate underwriting gate.
 */
export function PaymentsControl({
  companyId,
  processor,
  square,
  onboardingState,
  paymentsWaived,
  paymentsRequiredAt,
  onboardingOpen,
}: {
  companyId: string;
  /** getProcessor().name — "square" | "finix" | "manual". */
  processor: string;
  square: { connected: boolean; merchantId: string | null; connectedAt: string | null };
  onboardingState: string | null;
  paymentsWaived: boolean;
  /** Stamped at a self-serve sign-up on Square: held at /app/setup/payments until connected or waived. */
  paymentsRequiredAt?: string | null;
  /** PAYMENTS_ONBOARDING_OPEN — closed = no gate, Coming soon for every unapproved company. */
  onboardingOpen: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (processor !== "finix") {
    const held = processor === "square" && Boolean(paymentsRequiredAt) && !square.connected && !paymentsWaived;
    return (
      <Card className="p-5">
        <div className="flex items-center gap-1.5">
          <h2 className="ds-h2">Online payments</h2>
          <InfoTip>
            {processor === "square"
              ? "Payments run through the company's own Square account, which the owner connects from Settings → Payments & accounting — or, for a self-serve sign-up, on the payment-setup step the app holds them at until it's connected. Nothing to approve on our side: connected means their pay links take cards and bank payments; not connected means pay pages are view-only and invoice emails say View. Waive payment setup to let a held company in without connecting (testers, comps); Require puts the step back."
              : "The platform processor is manual: nothing moves money anywhere. Set PAYMENT_PROCESSOR=square on Railway to turn online payments back on."}
          </InfoTip>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {processor !== "square" ? (
            <Chip tone="neutral">Manual only</Chip>
          ) : square.connected ? (
            <Chip tone="good">Square connected{square.connectedAt ? ` · since ${square.connectedAt}` : ""}</Chip>
          ) : held ? (
            <Chip tone="warn">Held at payment setup{paymentsRequiredAt ? ` · since ${paymentsRequiredAt}` : ""}</Chip>
          ) : (
            <Chip tone="neutral">Square not connected</Chip>
          )}
          {processor === "square" && paymentsWaived && <Chip tone="neutral">Setup waived</Chip>}
          {square.merchantId && <span className="text-xs text-gray-500">Merchant {square.merchantId}</span>}
        </div>
        {processor === "square" && (held || paymentsWaived) && (
          <div className="mt-4">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setWaived(!paymentsWaived)}>
              {busy ? "Saving…" : paymentsWaived ? "Require payment setup" : "Waive payment setup"}
            </Button>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-[color:var(--ds-bad)]">{error}</p>}
      </Card>
    );
  }

  const state =
    onboardingState === "APPROVED"
      ? { label: "Approved — payments live", tone: "good" as const }
      : onboardingState === "PROVISIONING"
        ? { label: "Under review (form submitted)", tone: "warn" as const }
        : onboardingState === "UPDATE_REQUESTED"
          ? { label: "Underwriter needs more info", tone: "warn" as const }
          : onboardingState === "REJECTED"
            ? { label: "Rejected by underwriting", tone: "bad" as const }
            : { label: "Not started", tone: "neutral" as const };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-1.5">
        <h2 className="ds-h2">Payment verification</h2>
        <InfoTip>
          {!onboardingOpen && onboardingState !== "APPROVED"
            ? "Payments onboarding is closed platform-wide (PAYMENTS_ONBOARDING_OPEN is off): no underwriting gate, Online payments show as Coming soon in Settings, pay pages are view-only and invoice emails say View instead of Pay. The waiver only matters once onboarding reopens."
            : paymentsWaived
              ? "This company skips the underwriting gate (invite or universal code, or waived here). Online payments show as Coming soon in their Settings, their pay pages are view-only and invoice emails say View instead of Pay. Require verification to send the owner through the Finix form — once approved, payments switch on."
              : "Companies without Finix approval are held at the activation gate until underwriting approves them."}
        </InfoTip>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Chip tone={state.tone}>{state.label}</Chip>
        {paymentsWaived && <Chip tone="neutral">Gate waived</Chip>}
      </div>
      <div className="mt-4">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setWaived(!paymentsWaived)}>
          {busy ? "Saving…" : paymentsWaived ? "Require verification" : "Waive verification"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-[color:var(--ds-bad)]">{error}</p>}
    </Card>
  );
}
