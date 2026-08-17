"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Premium add-on (Workbench Plus, sold through Livery) — the two switches:
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
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-gray-700">Workbench Plus (Livery add-on)</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            addonEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
          }`}
        >
          {addonEnabled ? "Visible" : "Hidden"}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
          }`}
        >
          {active
            ? `Subscribed since ${new Date(addonActiveAt!).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}`
            : "Not subscribed"}
        </span>
        {addonLiverySubId && (
          <span className="rounded-full bg-purple-100 px-2.5 py-1 font-mono text-xs font-semibold text-purple-700">
            {addonLiverySubId.slice(0, 12)}…
          </span>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        Visibility controls whether the upsell page and settings link exist for this company —
        keep it on for Streamflaire only while previewing. The subscription itself is managed by
        Livery webhooks; grant/revoke below is the manual override for missed webhooks or comped
        accounts.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={busy}
          onClick={() => send(addonEnabled ? "addon-hide" : "addon-show")}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? "Saving…" : addonEnabled ? "Hide add-on" : "Show add-on"}
        </button>
        <button
          disabled={busy}
          onClick={() => send(active ? "addon-revoke" : "addon-grant")}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {active ? "Revoke entitlement" : "Grant entitlement (manual)"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
