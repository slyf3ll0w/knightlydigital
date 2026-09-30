"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Chip, InfoTip } from "@/components/ds";

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
      ? { label: "Full (whitelisted)", tone: "primary" as const }
      : { label: "Off", tone: "neutral" as const }
    : plan
      ? plan.remaining > 0
        ? { label: "Paid plan (test)", tone: "primary" as const }
        : { label: "Plan spent", tone: "warn" as const }
      : freeSpent
        ? { label: "Free tier spent", tone: "warn" as const }
        : { label: "Free tier", tone: "neutral" as const };

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

  const meterBar = (m: { used: number; included: number }) => (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-line)]">
      <div
        className="h-full rounded-full bg-[color:var(--ds-primary)]"
        style={{ width: `${Math.min(100, Math.round((m.used / Math.max(1, m.included)) * 100))}%` }}
      />
    </div>
  );

  return (
    <Card className="p-5">
      <div className="flex items-center gap-1.5">
        <h2 className="ds-h2">Atlas assistant</h2>
        <InfoTip>
          By default every company gets {free.included.toLocaleString()} free tokens a month on the spend meter,
          refilled on the 1st, then the plan upsell. Whitelist gives full unmetered Atlas (test accounts); Turn off
          hides Atlas completely. The paid plan ({planPrice}/month, {planTokens.toLocaleString()} tokens per billing
          month, refilled on the day it started; 1 token = 0.01¢ of our cost) is not sold yet — grant it here to test
          the meter; the override still wins.
        </InfoTip>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Chip tone={statusChip.tone}>{statusChip.label}</Chip>
        <span className="ds-small">{overridden ? `forced ${assistantEnabled ? "on" : "off"} (override)` : defaultLabel}</span>
      </div>
      {!plan && (
        <div className="mt-3 rounded-xl bg-[color:var(--ds-surface-2)] px-3.5 py-2.5 text-xs text-[color:var(--ds-ink-2)]">
          <div className="flex items-center justify-between">
            <span>
              <span className="font-semibold text-[color:var(--ds-ink)]">{free.remaining.toLocaleString()}</span> of{" "}
              {free.included.toLocaleString()} free tokens left
            </span>
            <span>refills {fmtDate(free.periodEnd)}</span>
          </div>
          {meterBar(free)}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy || assistantEnabled === true} onClick={() => send("assistant-on")}>
          Whitelist (full)
        </Button>
        <Button variant="outline" size="sm" disabled={busy || assistantEnabled === false} onClick={() => send("assistant-off")}>
          Turn off
        </Button>
        {overridden && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => send("assistant-default")}>
            Reset to default
          </Button>
        )}
        {free.used > 0 && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => send("atlas-free-reset")} title="Zero this month's free-tier usage — re-run a burn-down on a test company">
            Refill free tier
          </Button>
        )}
      </div>

      {/* ── Paid plan (not sold yet — granted here for testing) ── */}
      <div className="mt-5 border-t border-[color:var(--ds-line)] pt-4">
        <p className="text-[13px] font-semibold text-[color:var(--ds-ink)]">Paid plan · {planPrice}/month</p>
        {plan && (
          <div className="mt-2 rounded-xl bg-[color:var(--ds-surface-2)] px-3.5 py-2.5 text-xs text-[color:var(--ds-ink-2)]">
            <div className="flex items-center justify-between">
              <span>
                <span className="font-semibold text-[color:var(--ds-ink)]">{plan.remaining.toLocaleString()}</span> of{" "}
                {plan.included.toLocaleString()} tokens left
              </span>
              <span>refills {fmtDate(plan.periodEnd)}</span>
            </div>
            {meterBar(plan)}
            <p className="ds-small mt-1 text-[11.5px]">active since {fmtDate(plan.activeAt)}</p>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {!plan ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => send("atlas-plan-grant")}>
              Grant plan (test)
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => send("atlas-plan-reset")}>
                Refill period
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => send("atlas-plan-revoke")}>
                Revoke plan
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Ledger ── */}
      <div className="mt-5 border-t border-[color:var(--ds-line)] pt-4">
        <p className="text-[13px] font-semibold text-[color:var(--ds-ink)]">Last {usage.days} days</p>
        {usage.turns === 0 ? (
          <p className="ds-small mt-1">No Atlas turns yet.</p>
        ) : (
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            {[
              ["Turns", usage.turns.toLocaleString()],
              ["Our cost", dollars(usage.costCents)],
              ["Tokens metered", usage.atlasTokens.toLocaleString()],
              ["Tool calls", usage.toolCalls.toLocaleString()],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="ds-small">{k}</dt>
                <dd className="ds-num font-semibold text-[color:var(--ds-ink)]">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {usage.lastAt && (
          <p className="ds-small mt-1.5 text-[11.5px]">
            last turn {fmtDate(usage.lastAt)} · avg {dollars(usage.costCents / Math.max(1, usage.turns))}/turn
          </p>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-[color:var(--ds-bad)]">{error}</p>}
    </Card>
  );
}
