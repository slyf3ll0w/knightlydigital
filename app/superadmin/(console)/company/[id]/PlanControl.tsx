"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FREE_PLAN_NAME, formatCents, type PlanId } from "@/lib/plans";
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
  paidPlans = [],
  paidSeats = 0,
  card = null,
  subscriptions = [],
  planOffers = [],
  catalog = [],
}: {
  companyId: string;
  plans: { id: PlanId; name: string; tagline: string; price: string; comingSoon: boolean }[];
  grants: PlanId[];
  /** A Livery subscription backs Voice (so it is on even without a grant). */
  dispatchPaid: boolean;
  /** Plans paid through WorkBench's Square account (lib/plan-billing.ts). */
  paidPlans?: PlanId[];
  paidSeats?: number;
  card?: string | null;
  subscriptions?: {
    id: string;
    product: string;
    cadence: string;
    status: string;
    entitled: boolean;
    chargedThrough: string | null;
    canceledAt: string | null;
    failing: boolean;
  }[];
  /** Square plan-variation ids offered to this company (Company.planOffers). */
  planOffers?: string[];
  /** Every price in WorkBench's Square catalog (lib/plan-catalog.ts). */
  catalog?: { id: string; product: string; cadence: string; priceCents: number | null; name: string; planName: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<string[]>(planOffers);
  const offersDirty = JSON.stringify([...offers].sort()) !== JSON.stringify([...planOffers].sort());
  const productLabel = (product: string) =>
    product === "FULL_SHOP" ? "Max" : product === "SEAT" ? "Extra person" : (plans.find((p) => p.id === product)?.name ?? product);

  async function post(action: string, body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
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

  const everything = plans.every((p) => grants.includes(p.id));

  async function send(action: "plan-grant" | "plan-revoke" | "plan-refresh", plan: PlanId | "ALL") {
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
          const paidSquare = paidPlans.includes(p.id);
          const paid = paidSquare || (p.id === "DISPATCH" && dispatchPaid);
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[14px] font-semibold text-[color:var(--ds-ink)]">{p.name}</span>
                  <span className="ds-small">{p.price}/mo</span>
                  {p.comingSoon && <Chip tone="warn">Coming soon</Chip>}
                  <Chip tone={granted || paid ? "good" : "neutral"}>
                    {granted ? "Granted" : paidSquare ? "Paid (Square)" : paid ? "Paid (Livery)" : "Off"}
                  </Chip>
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => send("plan-refresh", "ALL")}>
          {busy === "plan-refresh:ALL" ? "Checking…" : "Check Square now"}
        </Button>
        <InfoTip>
          Reads this company&apos;s subscriptions from WorkBench&apos;s Square account and applies them — a subscription
          made in the Square Dashboard (customer email = the owner&apos;s sign-in, or reference id = this company id)
          is picked up here, on the owner&apos;s Plans page, or by the hourly sweep.
        </InfoTip>
      </div>

      {catalog.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[14px] font-semibold text-[color:var(--ds-ink)]">Prices for this company</h3>
            <InfoTip>
              Every price in WorkBench&apos;s Square catalog (add one on Console → Billing). Tick a price and the owner&apos;s
              Settings → Plans sells it instead of the list price for that plan and term — one per plan and term.
              &quot;Send by invoice&quot; starts the subscription on that price right now, no card needed: Square emails the
              owner the invoice and the plan switches on; unpaid past the grace period, it switches off again.
            </InfoTip>
          </div>
          <ul className="ds-divide mt-2 overflow-hidden rounded-xl bg-[color:var(--ds-surface-2)]">
            {catalog.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2">
                <label className="flex min-w-0 items-center gap-2 text-[13px] text-[color:var(--ds-ink)]">
                  <input
                    type="checkbox"
                    checked={offers.includes(v.id)}
                    onChange={() => setOffers((o) => (o.includes(v.id) ? o.filter((x) => x !== v.id) : [...o, v.id]))}
                  />
                  <span className="font-semibold">{productLabel(v.product)}</span>
                  <span className="ds-small truncate">
                    {v.name}
                    {v.planName && v.planName !== v.name ? ` · ${v.planName}` : ""} · {v.cadence === "ANNUAL" ? "annual" : "monthly"} ·{" "}
                    {v.priceCents == null ? "—" : formatCents(v.priceCents)}
                  </span>
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => {
                    if (confirm(`Start ${productLabel(v.product)} (${v.name}) for this company now? Square emails the owner the invoice.`)) {
                      post("plan-invoice", { variationId: v.id }, `plan-invoice:${v.id}`);
                    }
                  }}
                >
                  {busy === `plan-invoice:${v.id}` ? "Sending…" : "Send by invoice"}
                </Button>
              </li>
            ))}
          </ul>
          {offersDirty && (
            <div className="mt-2 flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => post("plan-offer", { variationIds: offers }, "plan-offer")}>
                {busy === "plan-offer" ? "Saving…" : "Save prices"}
              </Button>
              <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setOffers(planOffers)}>
                Undo
              </Button>
            </div>
          )}
        </div>
      )}

      {(subscriptions.length > 0 || card) && (
        <div className="mt-5">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[14px] font-semibold text-[color:var(--ds-ink)]">Billing (Square)</h3>
            <InfoTip>
              What the company pays WorkBench through our Square account — one row per Square subscription. Read-only
              here: the owner changes these on Settings → Plans, and the Square dashboard shows the invoices. Paid
              seats: {paidSeats}.
            </InfoTip>
            {card && <span className="ds-small">{card}</span>}
          </div>
          <ul className="ds-divide mt-2 overflow-hidden rounded-xl bg-[color:var(--ds-surface-2)]">
            {subscriptions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[13px] font-semibold text-[color:var(--ds-ink)]">
                    {s.product === "FULL_SHOP" ? "Max" : s.product === "SEAT" ? "Extra person" : (plans.find((p) => p.id === s.product)?.name ?? s.product)}
                  </span>
                  <span className="ds-small">{s.cadence === "ANNUAL" ? "annual" : "monthly"}</span>
                  <Chip tone={s.failing ? "bad" : s.entitled ? "good" : "neutral"}>{s.failing ? "Card failing" : s.status}</Chip>
                </div>
                <span className="ds-small">
                  {s.canceledAt ? `ends ${s.canceledAt}` : s.chargedThrough ? `paid through ${s.chargedThrough}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
