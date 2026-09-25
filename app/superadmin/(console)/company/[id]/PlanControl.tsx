"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlanId } from "@/lib/plans";

/**
 * The plan whitelist (lib/plans.ts): grant a company any add-on plan for
 * free — the first users get everything, comped accounts, testing. Each
 * plan is a switch; "Grant everything" is Full Shop. A Dispatch grant also
 * stamps the Livery entitlement (addonActiveAt) so the business line works
 * today; a Shop grant also starts the Atlas paid plan (its tokens are part
 * of Shop). Revoking Dispatch/Shop only clears those when no Livery
 * subscription is behind them, so a paying customer is never switched off
 * from here.
 */
export function PlanControl({
  companyId,
  plans,
  grants,
  dispatchPaid,
}: {
  companyId: string;
  plans: { id: PlanId; name: string; tagline: string; price: string; comingSoon: boolean }[];
  grants: PlanId[];
  /** A Livery subscription backs Dispatch (so it is on even without a grant). */
  dispatchPaid: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const everything = plans.every((p) => grants.includes(p.id));

  async function send(action: "plan-grant" | "plan-revoke", plan: PlanId | "ALL") {
    setBusy(`${action}:${plan}`);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, plan }),
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
      setBusy(null);
    }
  }

  const btn =
    "rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50";
  const quiet = "rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-700">Plans (whitelist)</h2>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            everything
              ? "bg-green-100 text-green-700"
              : grants.length > 0
                ? "bg-indigo-100 text-indigo-700"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {everything ? "Full Shop (everything)" : grants.length > 0 ? `${grants.length} of ${plans.length} granted` : "Bench (free core)"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        Grants put this company on an add-on plan for free — no checkout, no billing. The first
        users get everything; use it for comped accounts and testing too. Dispatch also unlocks
        the business line below; Shop also starts the Atlas paid plan (150,000 tokens).
      </p>

      <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100">
        {plans.map((p) => {
          const granted = grants.includes(p.id);
          const paid = p.id === "DISPATCH" && dispatchPaid;
          const on = granted || paid;
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                  <span className="text-xs text-gray-400">{p.price}/mo</span>
                  {p.comingSoon && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      Coming soon
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      on ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {granted ? "Granted" : paid ? "Paid (Livery)" : "Off"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{p.tagline}</p>
              </div>
              <button
                disabled={busy !== null}
                onClick={() => send(granted ? "plan-revoke" : "plan-grant", p.id)}
                className={granted ? quiet : btn}
              >
                {busy === `${granted ? "plan-revoke" : "plan-grant"}:${p.id}`
                  ? "Saving…"
                  : granted
                    ? "Revoke"
                    : "Grant free"}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        {!everything ? (
          <button disabled={busy !== null} onClick={() => send("plan-grant", "ALL")} className={btn}>
            {busy === "plan-grant:ALL" ? "Saving…" : "Grant everything (Full Shop)"}
          </button>
        ) : (
          <button disabled={busy !== null} onClick={() => send("plan-revoke", "ALL")} className={quiet}>
            {busy === "plan-revoke:ALL" ? "Saving…" : "Revoke all grants"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
