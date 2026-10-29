"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CreditCard, Loader2, Minus, Plus, Sparkles, Users } from "lucide-react";
import Modal from "@/components/Modal";
import SquareCardFields, { type SquareCardFieldsHandle } from "@/components/SquareCardFields";
import { Button, Card, Chip, Hint, InfoTip } from "@/components/ds";
import { toast } from "@/lib/toast";
import { FREE_PLAN_NAME, formatCents, type BillingCadence, type BillingProduct } from "@/lib/plans";
import type { PlanBillingState, PlanCardState } from "@/lib/plan-billing";

/**
 * The Plans page body (server page: ./page.tsx). One read model
 * (PlanBillingState from GET /api/app/billing) drives every card; every
 * action POSTs to the same route and swaps in the fresh state it answers.
 *
 * Card entry is Square's Web Payments SDK mounted for WORKBENCH's account
 * (state.pay) — the same hosted iframe clients use on the pay page, so card
 * numbers never touch our servers. The first plan asks for the card; later
 * ones charge the card on file after a confirm step.
 *
 * Phone and desktop share one tree: cards stack on a phone, two across on a
 * desk; the sheet is a Modal either way.
 */

type Sheet =
  | { kind: "subscribe"; plan: PlanCardState; cadence: BillingCadence }
  | { kind: "seat" }
  | { kind: "card" }
  | null;

const monthLabel = (cents: number) => `${formatCents(cents)}/mo`;

function perTerm(plan: PlanCardState, cadence: BillingCadence): string {
  return cadence === "ANNUAL" ? `${formatCents(plan.annualCents)}/yr` : monthLabel(plan.monthlyCents);
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PlansClient({ initial, isOwner }: { initial: PlanBillingState; isOwner: boolean }) {
  const [s, setS] = useState(initial);
  const [cadence, setCadence] = useState<BillingCadence>("MONTHLY");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: string, body: Record<string, unknown>, label: string): Promise<boolean> {
    setBusy(action + (body.id ?? body.product ?? ""));
    setError(null);
    try {
      const res = await fetch("/api/app/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return false;
      }
      setS(data as PlanBillingState);
      toast(label);
      return true;
    } catch {
      setError("Something went wrong. Nothing was charged — try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const onPlans = s.plans.filter((p) => p.on && p.product !== "FULL_SHOP");
  const maxOn = s.plans.find((p) => p.product === "FULL_SHOP")?.on;
  const canAct = isOwner && s.configured;

  return (
    <div className="space-y-4">
      {s.attention && (
        <div className="flex items-start gap-3 rounded-2xl border border-[color:var(--ds-bad)]/30 bg-[color:var(--ds-bad)]/5 px-4 py-3 text-sm text-[color:var(--ds-ink)]">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[color:var(--ds-bad)]" aria-hidden />
          <div className="min-w-0 flex-1">
            {s.attention}
            {canAct && (
              <button type="button" className="ml-2 font-semibold text-[color:var(--ds-primary)]" onClick={() => setSheet({ kind: "card" })}>
                Replace card
              </button>
            )}
          </div>
        </div>
      )}

      {/* What you're on */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h2 className="ds-h2">You&apos;re on</h2>
            <InfoTip>
              {FREE_PLAN_NAME} is the free core — clients, booking, scheduling, quotes, invoices, payments, chat.
              Add-ons are billed through Square. &ldquo;Included&rdquo; means we switched a plan on for your account at no charge.
              {s.isTest && " This is a test account, so every feature is open regardless."}
            </InfoTip>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="neutral">{FREE_PLAN_NAME}</Chip>
            {maxOn ? (
              <Chip tone="primary" icon={Sparkles}>
                Max
              </Chip>
            ) : (
              onPlans.map((p) => (
                <Chip key={p.product} tone="good" icon={Check}>
                  {p.name}
                  {p.source === "grant" ? " · included" : p.source === "livery" ? " · previous billing" : ""}
                </Chip>
              ))
            )}
          </div>
        </div>
        {!s.configured && (
          <Hint className="mt-3" title="Online checkout isn't switched on yet. Message us from the Help Center and we'll set your plan up by hand." />
        )}
        {s.configured && !isOwner && <Hint className="mt-3" title="Only the owner can add or change plans." />}
      </Card>

      {/* Term */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="ds-h2">Add a plan</h2>
        <div role="tablist" aria-label="Billing term" className="inline-flex rounded-full bg-[color:var(--ds-surface-2)] p-1 text-[13px] font-semibold">
          {(["MONTHLY", "ANNUAL"] as BillingCadence[]).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={cadence === c}
              onClick={() => setCadence(c)}
              className={`rounded-full px-3 py-1.5 ${cadence === c ? "bg-[color:var(--ds-surface)] text-[color:var(--ds-ink)] shadow-sm" : "text-[color:var(--ds-ink-soft)]"}`}
            >
              {c === "MONTHLY" ? "Monthly" : "Annual · 2 months free"}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {s.plans.map((plan) => (
          <PlanCardView
            key={plan.product}
            plan={plan}
            cadence={cadence}
            state={s}
            canAct={canAct}
            busy={busy}
            onAdd={() => setSheet({ kind: "subscribe", plan, cadence })}
            onCancel={() => plan.subscription && act("cancel", { id: plan.subscription.id }, `${plan.name} ends ${shortDate(null) || "at the end of the period"}`.replace(/ends $/, "ends at the end of the period"))}
            onResume={() => plan.subscription && act("resume", { id: plan.subscription.id }, `${plan.name} stays on`)}
          />
        ))}
      </div>

      {/* People */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Users size={16} className="text-[color:var(--ds-muted)]" aria-hidden />
              <h2 className="ds-h2">People</h2>
              <InfoTip>
                {FREE_PLAN_NAME} includes {s.seats.included} people. Each extra person is {monthLabel(s.seats.priceCents)}, billed
                monthly; Pro and Max have no per-person charge. Removing a seat ends it at the close of its month.
              </InfoTip>
            </div>
            <p className="ds-body mt-1">
              {s.seats.unlimited
                ? `${s.seats.activePeople} ${s.seats.activePeople === 1 ? "person" : "people"} · unlimited on your plan`
                : s.seats.limit === null
                  ? `${s.seats.activePeople} ${s.seats.activePeople === 1 ? "person" : "people"}`
                  : `${s.seats.activePeople} of ${s.seats.limit} people` +
                    (s.seats.paid > 0 ? ` (${s.seats.included} included + ${s.seats.paid} paid)` : "")}
            </p>
          </div>
          {!s.seats.unlimited && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={Minus}
                disabled={!canAct || s.seats.paid === 0 || busy !== null}
                loading={busy === "seat-remove"}
                onClick={() => act("seat-remove", {}, "One seat ends at the close of its month")}
              >
                Remove
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                disabled={!canAct || !s.seats.available || busy !== null}
                onClick={() => (s.card ? act("seat-add", {}, "Added a person") : setSheet({ kind: "seat" }))}
                loading={busy === "seat-add"}
              >
                Add a person · {monthLabel(s.seats.priceCents)}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Card on file */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-[color:var(--ds-muted)]" aria-hidden />
            <h2 className="ds-h2">Card on file</h2>
            <span className="ds-body">
              {s.card ? `${s.card.brand ?? "Card"} •••• ${s.card.last4 ?? "····"}` : "None yet"}
            </span>
          </div>
          {canAct && (
            <Button variant="outline" size="sm" onClick={() => setSheet({ kind: "card" })}>
              {s.card ? "Replace" : "Add a card"}
            </Button>
          )}
        </div>
        <p className="ds-small mt-2">
          Charged by Square (Block, Inc.) for WorkBench. Receipts come from Square by email.{" "}
          <Link href="/pricing" className="ds-link" target="_blank" rel="noreferrer">
            Full pricing
          </Link>
        </p>
      </Card>

      {error && !sheet && (
        <p role="alert" className="text-sm text-[color:var(--ds-bad)]">
          {error}
        </p>
      )}

      <ActionSheet
        sheet={sheet}
        state={s}
        onClose={() => {
          setSheet(null);
          setError(null);
        }}
        error={error}
        setError={setError}
        act={act}
        busy={busy}
      />
    </div>
  );
}

// ── One plan card ──

function PlanCardView({
  plan,
  cadence,
  state,
  canAct,
  busy,
  onAdd,
  onCancel,
  onResume,
}: {
  plan: PlanCardState;
  cadence: BillingCadence;
  state: PlanBillingState;
  canAct: boolean;
  busy: string | null;
  onAdd: () => void;
  onCancel: () => void;
  onResume: () => void;
}) {
  const [more, setMore] = useState(false);
  const sub = plan.subscription;
  const ending = Boolean(sub?.entitled && sub.canceledAt);
  const failing = Boolean(sub?.lastFailureAt && Date.now() - new Date(sub.lastFailureAt).getTime() < 14 * 86_400_000);
  const isMax = plan.product === "FULL_SHOP";
  const maxOn = state.plans.find((p) => p.product === "FULL_SHOP")?.on;
  const shown = more ? plan.includes : plan.includes.slice(0, 4);
  const setupDue = state.setupFee.due && (plan.product === "DISPATCH" || isMax);
  const partOfMax = !isMax && maxOn && plan.on;

  let status: { tone: "good" | "neutral" | "warn" | "bad" | "primary"; text: string } | null = null;
  if (!plan.sellable) status = { tone: "warn", text: "Coming soon" };
  else if (failing) status = { tone: "bad", text: "Card failing" };
  else if (ending) status = { tone: "warn", text: `Ends ${shortDate(sub!.canceledAt)}` };
  else if (plan.on && plan.source === "grant") status = { tone: "good", text: "Included" };
  else if (plan.on && plan.source === "livery") status = { tone: "good", text: "On · previous billing" };
  else if (plan.on) status = { tone: "good", text: "On" };

  let action: React.ReactNode = null;
  if (!plan.sellable) action = null;
  else if (partOfMax) action = <span className="ds-small">Part of Max</span>;
  else if (plan.on && plan.source === "grant") action = <span className="ds-small">Included with your account</span>;
  else if (plan.on && plan.source === "livery") action = <span className="ds-small">Billed through our previous system</span>;
  else if (sub?.entitled && ending)
    action = (
      <Button variant="outline" size="sm" disabled={!canAct || busy !== null} loading={busy === `resume${sub.id}`} onClick={onResume}>
        Keep it
      </Button>
    );
  else if (sub?.entitled)
    action = (
      <div className="flex flex-wrap items-center gap-2">
        {sub.cadence !== cadence && plan.available[cadence] && (
          <Button variant="outline" size="sm" disabled={!canAct || busy !== null} onClick={onAdd}>
            Switch to {cadence === "ANNUAL" ? "annual" : "monthly"}
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={!canAct || busy !== null} loading={busy === `cancel${sub.id}`} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    );
  else
    action = (
      <Button
        variant={isMax ? "primary" : "soft"}
        size="sm"
        icon={isMax ? Sparkles : Plus}
        disabled={!canAct || !plan.available[cadence] || busy !== null}
        onClick={onAdd}
      >
        {isMax && state.plans.some((p) => p.on && p.product !== "FULL_SHOP") ? "Switch to Max" : `Add ${plan.name}`}
      </Button>
    );

  return (
    <Card className={`flex flex-col p-5 ${isMax ? "ring-1 ring-[color:var(--ds-primary)]/40" : ""}`} data-plan-card={plan.product}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-bold text-[color:var(--ds-ink)]">{plan.name}</h3>
            {status && <Chip tone={status.tone}>{status.text}</Chip>}
          </div>
          <p className="ds-small mt-0.5">{plan.tagline}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[17px] font-bold text-[color:var(--ds-ink)]">{perTerm(plan, cadence)}</div>
          {cadence === "ANNUAL" && <div className="ds-small">{monthLabel(Math.round(plan.annualCents / 12))} effective</div>}
          {setupDue && <div className="ds-small">+ {formatCents(state.setupFee.cents)} one-time setup</div>}
        </div>
      </div>
      <ul className="mt-3 space-y-1.5 text-[13px] text-[color:var(--ds-ink-2)]">
        {shown.map((line) => (
          <li key={line} className="flex gap-2">
            <Check size={14} className="mt-0.5 shrink-0 text-[color:var(--ds-primary)]" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {plan.includes.length > 4 && (
        <button type="button" className="mt-1.5 self-start text-[13px] font-semibold text-[color:var(--ds-primary)]" onClick={() => setMore((m) => !m)}>
          {more ? "Less" : `${plan.includes.length - 4} more`}
        </button>
      )}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[color:var(--ds-line)] pt-3">
        <span className="ds-small">
          {sub?.entitled && !ending && sub.chargedThrough ? `Renews ${shortDate(sub.chargedThrough)} · ${sub.cadence === "ANNUAL" ? "annual" : "monthly"}` : ""}
        </span>
        {action}
      </div>
    </Card>
  );
}

// ── The sheet: confirm + (when needed) card entry ──

function ActionSheet({
  sheet,
  state,
  onClose,
  error,
  setError,
  act,
  busy,
}: {
  sheet: Sheet;
  state: PlanBillingState;
  onClose: () => void;
  error: string | null;
  setError: (e: string | null) => void;
  act: (action: string, body: Record<string, unknown>, label: string) => Promise<boolean>;
  busy: string | null;
}) {
  const cardRef = useRef<SquareCardFieldsHandle>(null);
  const [cardReady, setCardReady] = useState(false);
  const needsCard = sheet?.kind === "card" || !state.card;
  const open = sheet !== null;

  let title = "";
  let summary = "";
  let cta = "";
  let action = "";
  let body: Record<string, unknown> = {};
  let done = "";
  if (sheet?.kind === "subscribe") {
    const { plan, cadence } = sheet;
    const swap = plan.subscription?.entitled;
    title = swap ? `Switch ${plan.name} to ${cadence === "ANNUAL" ? "annual" : "monthly"}` : `Add ${plan.name}`;
    const setup = state.setupFee.due && (plan.product === "DISPATCH" || plan.product === "FULL_SHOP");
    summary = `${perTerm(plan, cadence)}${setup ? ` plus a one-time ${formatCents(state.setupFee.cents)} setup for your phone number` : ""}. ${
      swap ? "Square prorates the change." : "Starts today; cancel any time and it runs to the end of what you paid for."
    }`;
    cta = swap ? "Switch" : `Start ${plan.name}`;
    action = "subscribe";
    body = { product: plan.product as BillingProduct, cadence };
    done = swap ? `${plan.name} switched` : `${plan.name} is on`;
  } else if (sheet?.kind === "seat") {
    title = "Add a person";
    summary = `${monthLabel(state.seats.priceCents)} per extra person, billed monthly. You can remove it any time.`;
    cta = "Add a person";
    action = "seat-add";
    done = "Added a person";
  } else if (sheet?.kind === "card") {
    title = state.card ? "Replace your card" : "Add a card";
    summary = state.card
      ? `Every plan moves to the new card; ${state.card.brand ?? "the old card"} •••• ${state.card.last4 ?? ""} is removed.`
      : "The card every plan is charged to.";
    cta = "Save card";
    action = "card";
    done = "Card saved";
  }

  async function go() {
    let sourceId: string | null = null;
    if (needsCard) {
      if (!state.pay) return;
      const token = await cardRef.current?.tokenize();
      if (!token) {
        setError(cardRef.current?.lastError() || "Please check your card details.");
        return;
      }
      sourceId = token;
    }
    const ok = await act(action, { ...body, ...(sourceId ? { sourceId } : {}) }, done);
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      {sheet && (
        <div className="ds p-5">
          <h2 className="ds-h2">{title}</h2>
          <p className="ds-body mt-1">{summary}</p>
          {needsCard && state.pay && (
            <div className="mt-4">
              <SquareCardFields config={state.pay} onReady={setCardReady} ref={cardRef} />
            </div>
          )}
          {!needsCard && state.card && (
            <p className="mt-4 flex items-center gap-2 text-sm text-[color:var(--ds-ink-2)]">
              <CreditCard size={15} aria-hidden /> Charged to {state.card.brand ?? "your card"} •••• {state.card.last4}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-[color:var(--ds-bad)]">
              {error}
            </p>
          )}
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
              Not now
            </Button>
            <Button variant="primary" onClick={go} disabled={busy !== null || (needsCard && !cardReady)} loading={busy !== null}>
              {busy !== null ? (
                <>
                  <Loader2 size={15} className="ds-spin" aria-hidden /> {cta}
                </>
              ) : (
                cta
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
