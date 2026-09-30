"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Chip, InfoTip } from "@/components/ds";

/**
 * Payment-verification status + waiver toggle. Waiving exempts the company
 * from the /app/activate underwriting gate — for test accounts and comped
 * users, since every normal company must be Finix-approved to use the app.
 */
export function PaymentsControl({
  companyId,
  onboardingState,
  paymentsWaived,
  onboardingOpen,
}: {
  companyId: string;
  onboardingState: string | null;
  paymentsWaived: boolean;
  /** PAYMENTS_ONBOARDING_OPEN — closed = no gate, Coming soon for every unapproved company. */
  onboardingOpen: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
