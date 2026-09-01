"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Atlas assistant access control. Default policy (lib/assistant-access.ts):
 * Atlas is a paywalled premium add-on — companies get a limited free trial,
 * then the Coming-Soon full-plan upsell. The override forces it either way:
 * ON = full unmetered Atlas (the whitelist), OFF = hidden entirely.
 */
export function AssistantControl({
  companyId,
  assistantEnabled,
  atlasTrialStartedAt,
  atlasTrialUsed,
  atlasTrialTurns,
}: {
  companyId: string;
  assistantEnabled: boolean | null;
  atlasTrialStartedAt: string | null;
  atlasTrialUsed: number;
  atlasTrialTurns: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overridden = assistantEnabled !== null;
  const trialExhausted = !!atlasTrialStartedAt && atlasTrialUsed >= atlasTrialTurns;
  const defaultLabel = !atlasTrialStartedAt
    ? "paywall — trial not started"
    : trialExhausted
      ? "paywall — trial used up"
      : `trial — ${atlasTrialUsed}/${atlasTrialTurns} turns used`;
  const statusChip = overridden
    ? assistantEnabled
      ? { label: "Full (whitelisted)", cls: "bg-green-100 text-green-700" }
      : { label: "Off", cls: "bg-gray-100 text-gray-600" }
    : !atlasTrialStartedAt || trialExhausted
      ? { label: "Paywalled", cls: "bg-amber-100 text-amber-700" }
      : { label: "Free trial", cls: "bg-blue-100 text-blue-700" };

  async function send(action: "assistant-on" | "assistant-off" | "assistant-default") {
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
      <h2 className="text-sm font-bold text-gray-700">Atlas assistant</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusChip.cls}`}>
          {statusChip.label}
        </span>
        <span className="text-xs text-gray-500">
          {overridden ? `forced ${assistantEnabled ? "on" : "off"} (override)` : defaultLabel}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        Atlas is a premium add-on: by default companies get a {atlasTrialTurns}-turn free
        trial, then the Coming-Soon full-plan upsell. Turn it on to whitelist this company
        (full unmetered Atlas — test accounts); turn it off to hide Atlas completely.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={busy || assistantEnabled === true}
          onClick={() => send("assistant-on")}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Whitelist (full)
        </button>
        <button
          disabled={busy || assistantEnabled === false}
          onClick={() => send("assistant-off")}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Turn off
        </button>
        {overridden && (
          <button
            disabled={busy}
            onClick={() => send("assistant-default")}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          >
            Reset to default (paywall/trial)
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
