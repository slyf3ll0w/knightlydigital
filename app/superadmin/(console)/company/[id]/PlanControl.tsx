"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FREE_PLAN_NAME, type PlanId } from "@/lib/plans";
import { Button, Card, Chip, InfoTip } from "@/components/ds";

/**
 * The plan whitelist (lib/plans.ts): grant a company any add-on plan for
 * free — the first users get everything, comped accounts, testing. Each
 * plan is a switch; "Grant everything" is Max. A Voice grant also
 * stamps the Livery entitlement (addonActiveAt) so the business line works
 * today; a Pro grant also starts the Atlas paid plan (its tokens are part
 * of Pro). Revoking Voice/Pro only clears those when no Livery
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
  /** A Livery subscription backs Voice (so it is on even without a grant). */
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

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="ds-h2">Plans</h2>
          <InfoTip>
            Grants put this company on an add-on plan for free — no checkout, no billing. The first users get
            everything; use it for comped accounts and testing too. Voice also unlocks the business line; Pro also
            starts the Atlas paid plan (150,000 tokens). Revoking Voice or Pro never switches off a paying Livery
            subscription.
          </InfoTip>
        </div>
        <Chip tone={everything ? "primary" : grants.length > 0 ? "primary" : "neutral"}>
          {everything ? "Max (everything)" : grants.length > 0 ? `${grants.length} of ${plans.length} granted` : `${FREE_PLAN_NAME} (free core)`}
        </Chip>
      </div>

      <ul className="ds-divide mt-4 overflow-hidden rounded-xl bg-[color:var(--ds-surface-2)]">
        {plans.map((p) => {
          const granted = grants.includes(p.id);
          const paid = p.id === "DISPATCH" && dispatchPaid;
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[14px] font-semibold text-[color:var(--ds-ink)]">{p.name}</span>
                  <span className="ds-small">{p.price}/mo</span>
                  {p.comingSoon && <Chip tone="warn">Coming soon</Chip>}
                  <Chip tone={granted || paid ? "good" : "neutral"}>{granted ? "Granted" : paid ? "Paid (Livery)" : "Off"}</Chip>
                </div>
                <p className="ds-small mt-0.5">{p.tagline}</p>
              </div>
              <Button
                variant={granted ? "ghost" : "outline"}
                size="sm"
                disabled={busy !== null}
                onClick={() => send(granted ? "plan-revoke" : "plan-grant", p.id)}
              >
                {busy === `${granted ? "plan-revoke" : "plan-grant"}:${p.id}` ? "Saving…" : granted ? "Revoke" : "Grant free"}
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        {!everything ? (
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => send("plan-grant", "ALL")}>
            {busy === "plan-grant:ALL" ? "Saving…" : "Grant everything (Max)"}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => send("plan-revoke", "ALL")}>
            {busy === "plan-revoke:ALL" ? "Saving…" : "Revoke all grants"}
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-[color:var(--ds-bad)]">{error}</p>}
    </Card>
  );
}
