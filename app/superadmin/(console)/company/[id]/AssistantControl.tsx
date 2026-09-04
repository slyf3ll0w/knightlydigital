"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Atlas assistant access control. Default policy (lib/assistant-access.ts):
 * every company gets a free monthly token allowance on the spend meter,
 * refilled on the 1st; the paid plan is a bigger allowance anchored on its
 * billing day. The override forces it either way: ON = full unmetered Atlas
 * (the whitelist), OFF = hidden entirely.
 *
 * The paid plan (lib/assistant-billing.ts) isn't sold yet, so this card is
 * also where it gets granted for testing. The 30-day ledger below shows real
 * burn for every access level.
 */
export function AssistantControl({
  companyId,
  assistantEnabled,
  free,
  plan,
  planTokens,
  planPrice,
  usage,
}: {
  companyId: string;
  assistantEnabled: boolean | null;
  free: { included: number; used: number; remaining: number; periodEnd: string };
  plan: {
    activeAt: string;
    included: number;
    used: number;
    remaining: number;
    periodEnd: string;
  } | null;
  planTokens: number;
  planPrice: string;
  usage: {
    days: number;
    turns: number;
    costCents: number;
    atlasTokens: number;
    toolCalls: number;
    lastAt: string | null;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overridden = assistantEnabled !== null;
  const freeSpent = free.remaining <= 0;
  const defaultLabel = plan
    ? plan.remaining > 0
      ? `plan — ${plan.used.toLocaleString()} of ${plan.included.toLocaleString()} tokens used`
      : "plan — period's tokens spent"
    : freeSpent
      ? "free tier — this month's tokens spent"
      : `free tier — ${free.used.toLocaleString()} of ${free.included.toLocaleString()} tokens used`;
  const statusChip = overridden
    ? assistantEnabled
      ? { label: "Full (whitelisted)", cls: "bg-green-100 text-green-700" }
      : { label: "Off", cls: "bg-gray-100 text-gray-600" }
    : plan
      ? plan.remaining > 0
        ? { label: "Paid plan (test)", cls: "bg-indigo-100 text-indigo-700" }
        : { label: "Plan spent", cls: "bg-amber-100 text-amber-700" }
      : freeSpent
        ? { label: "Free tier spent", cls: "bg-amber-100 text-amber-700" }
        : { label: "Free tier", cls: "bg-blue-100 text-blue-700" };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  async function send(
    action:
      | "assistant-on"
      | "assistant-off"
      | "assistant-default"
      | "atlas-plan-grant"
      | "atlas-plan-revoke"
      | "atlas-plan-reset"
      | "atlas-free-reset"
  ) {
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

  const btn =
    "rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50";
  const quiet = "rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50";

  const meterBar = (m: { used: number; included: number }, color: string) => (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.min(100, Math.round((m.used / Math.max(1, m.included)) * 100))}%` }}
      />
    </div>
  );

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
        By default every company gets {free.included.toLocaleString()} free tokens a month on the
        spend meter, refilled on the 1st, then the plan upsell. Turn it on to whitelist this company
        (full unmetered Atlas — test accounts); turn it off to hide Atlas completely.
      </p>
      {!plan && (
        <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <div className="flex items-center justify-between">
            <span>
              <span className="font-semibold text-gray-900">{free.remaining.toLocaleString()}</span> of{" "}
              {free.included.toLocaleString()} free tokens left
            </span>
            <span>refills {fmtDate(free.periodEnd)}</span>
          </div>
          {meterBar(free, "bg-blue-500")}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={busy || assistantEnabled === true} onClick={() => send("assistant-on")} className={btn}>
          Whitelist (full)
        </button>
        <button disabled={busy || assistantEnabled === false} onClick={() => send("assistant-off")} className={btn}>
          Turn off
        </button>
        {overridden && (
          <button disabled={busy} onClick={() => send("assistant-default")} className={quiet}>
            Reset to default (free tier)
          </button>
        )}
        {free.used > 0 && (
          <button
            disabled={busy}
            onClick={() => send("atlas-free-reset")}
            className={quiet}
            title="Zero this month's free-tier usage — re-run a burn-down on a test company"
          >
            Refill free tier
          </button>
        )}
      </div>

      {/* ── Paid plan (not sold yet — granted here for testing) ── */}
      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="text-xs font-bold text-gray-700">Paid plan · {planPrice}/month</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          {planTokens.toLocaleString()} tokens per billing month, refilled on the day the plan
          started; 1 token = 0.01¢ of our cost (Gemini usage × platform unit prices). Not sold yet —
          grant it to test the meter; the override above still wins.
        </p>
        {plan && (
          <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <div className="flex items-center justify-between">
              <span>
                <span className="font-semibold text-gray-900">{plan.remaining.toLocaleString()}</span> of{" "}
                {plan.included.toLocaleString()} tokens left
              </span>
              <span>refills {fmtDate(plan.periodEnd)}</span>
            </div>
            {meterBar(plan, "bg-indigo-500")}
            <p className="mt-1 text-[11px] text-gray-400">active since {fmtDate(plan.activeAt)}</p>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {!plan ? (
            <button disabled={busy} onClick={() => send("atlas-plan-grant")} className={btn}>
              Grant plan (test)
            </button>
          ) : (
            <>
              <button disabled={busy} onClick={() => send("atlas-plan-reset")} className={btn}>
                Refill period
              </button>
              <button disabled={busy} onClick={() => send("atlas-plan-revoke")} className={quiet}>
                Revoke plan
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Ledger ── */}
      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="text-xs font-bold text-gray-700">Last {usage.days} days</p>
        {usage.turns === 0 ? (
          <p className="mt-1 text-xs text-gray-400">No Atlas turns yet.</p>
        ) : (
          <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-gray-400">Turns</dt>
              <dd className="font-semibold text-gray-900">{usage.turns.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Our cost</dt>
              <dd className="font-semibold text-gray-900">{dollars(usage.costCents)}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Tokens metered</dt>
              <dd className="font-semibold text-gray-900">{usage.atlasTokens.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Tool calls</dt>
              <dd className="font-semibold text-gray-900">{usage.toolCalls.toLocaleString()}</dd>
            </div>
          </dl>
        )}
        {usage.lastAt && (
          <p className="mt-1 text-[11px] text-gray-400">
            last turn {fmtDate(usage.lastAt)} · avg {dollars(usage.costCents / Math.max(1, usage.turns))}/turn
          </p>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
