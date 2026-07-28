"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Atlas assistant access control. Default policy (lib/assistant-access.ts):
 * companies that bypassed real Finix underwriting — payments waived or the
 * sandbox test-approve shortcut — get the assistant OFF; everyone else ON.
 * The override forces it either way for this company.
 */
export function AssistantControl({
  companyId,
  assistantEnabled,
  paymentsWaived,
  finixSandboxApproved,
}: {
  companyId: string;
  assistantEnabled: boolean | null;
  paymentsWaived: boolean;
  finixSandboxApproved: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bypassed = paymentsWaived || finixSandboxApproved;
  const defaultOn = !bypassed;
  const effectiveOn = assistantEnabled ?? defaultOn;
  const overridden = assistantEnabled !== null;

  const whyDefault = bypassed
    ? `default off — underwriting bypassed (${[
        paymentsWaived ? "payments waived" : null,
        finixSandboxApproved ? "sandbox test-approval" : null,
      ]
        .filter(Boolean)
        .join(", ")})`
    : "default on — real underwriting";

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
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            effectiveOn ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
          }`}
        >
          {effectiveOn ? "On" : "Off"}
        </span>
        <span className="text-xs text-gray-500">
          {overridden ? `forced ${assistantEnabled ? "on" : "off"} (override)` : whyDefault}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        Every assistant turn is real AI spend, so companies that skipped Finix underwriting
        don&apos;t get Atlas unless you turn it on here. Turning it off hides the bubble and
        blocks the API for the whole company.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={busy || effectiveOn}
          onClick={() => send("assistant-on")}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Turn on
        </button>
        <button
          disabled={busy || !effectiveOn}
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
            Reset to default ({defaultOn ? "on" : "off"})
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
