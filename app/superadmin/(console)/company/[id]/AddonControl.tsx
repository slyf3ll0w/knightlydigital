"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Chip, InfoTip } from "@/components/ds";

/**
 * Voice, the business-line plan (sold through Livery, lib/addon.ts) — the two switches:
 * visibility (does this company see the upsell page at all — the preview
 * lever while the add-on is Streamflaire-only) and a manual entitlement
 * override on top of what the Livery webhook manages.
 */
export function AddonControl({
  companyId,
  addonEnabled,
  addonActiveAt,
  addonLiverySubId,
}: {
  companyId: string;
  addonEnabled: boolean;
  addonActiveAt: string | null;
  addonLiverySubId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = Boolean(addonActiveAt);

  async function send(action: "addon-show" | "addon-hide" | "addon-grant" | "addon-revoke") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
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
        <h2 className="ds-h2">Voice subscription</h2>
        <InfoTip>
          Visibility controls whether the upsell page and settings link exist for this company — keep it on for
          Streamflaire only while previewing. The subscription itself is managed by Livery webhooks; grant/revoke is
          the manual override for missed webhooks or comped accounts.
        </InfoTip>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Chip tone={addonEnabled ? "good" : "neutral"}>{addonEnabled ? "Visible" : "Hidden"}</Chip>
        <Chip tone={active ? "good" : "neutral"}>
          {active
            ? `Subscribed since ${new Date(addonActiveAt!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
            : "Not subscribed"}
        </Chip>
        {addonLiverySubId && <span className="ds-num ds-small">{addonLiverySubId.slice(0, 12)}…</span>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => send(addonEnabled ? "addon-hide" : "addon-show")}>
          {busy ? "Saving…" : addonEnabled ? "Hide add-on" : "Show add-on"}
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => send(active ? "addon-revoke" : "addon-grant")}>
          {active ? "Revoke entitlement" : "Grant entitlement (manual)"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-[color:var(--ds-bad)]">{error}</p>}
    </Card>
  );
}
