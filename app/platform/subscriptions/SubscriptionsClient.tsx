"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Repeat, Loader2, Pencil, Play, Pause, X, RotateCw } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { money } from "@/lib/statuses";
import EmptyState from "@/components/EmptyState";
import { confirmSheet } from "@/components/ConfirmSheet";
import PageTitle from "@/components/PageTitle";
import { Chip, InfoTip } from "@/components/ds";
import Modal from "@/components/Modal";
import CountUp from "@/components/CountUp";
import { Picture } from "@/components/ListBands";
import Monogram from "@/components/Monogram";
import { DateField } from "@/components/DateField";
import { SERVICE_FEE_CARD } from "@/lib/service-fee";

type Frequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY";

type Sub = {
  id: string;
  name: string;
  unitPrice: number | string;
  quantity: number | string;
  // null = standalone recurring-job series (visits only, never bills)
  interval: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL" | null;
  // bill each completed visit instead of on a schedule (interval stays null)
  billPerVisit: boolean;
  // per-visit pricing but ONE invoice a month (nextRunDate = the 1st)
  consolidateMonthly: boolean;
  createsJob: boolean;
  invoiceMode: "SEND" | "DRAFT";
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  nextRunDate: string | null;
  visitFrequency: Frequency | null;
  nextVisitDate: string | null;
  visitStartMinutes: number | null;
  visitDurationMinutes: number | null;
  visitAssigneeIds: string[];
  // Autopay card pinned to this series (null = the client's default card)
  savedCardId: string | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    savedCards: { id: string; label: string; isDefault: boolean }[];
  };
};

type BillingInterval = NonNullable<Sub["interval"]>;

const INTERVAL_PER: Record<BillingInterval, string> = {
  MONTHLY: "a month",
  QUARTERLY: "every 3 months",
  SEMIANNUAL: "every 6 months",
  ANNUAL: "a year",
};

const INTERVAL_LABEL: Record<BillingInterval, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMIANNUAL: "Every 6 months",
  ANNUAL: "Annually",
};

const FREQ_LABEL: Record<Frequency, string> = {
  WEEKLY: "Every week",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Every month",
  QUARTERLY: "Every 3 months",
  ANNUALLY: "Every year",
};

// 30-minute time-of-day options for the visit window ("" = Anytime)
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const mins = i * 30;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const label = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return { value: String(mins), label };
});

const DURATION_OPTIONS = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
  { value: "240", label: "4 hours" },
  { value: "480", label: "8 hours" },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type ReadyJob = {
  id: string;
  title: string;
  completedAt: string | null;
  scheduledAt: string | null;
  contact: { id: string; firstName: string; lastName: string };
  subscription: {
    id: string;
    name: string;
    unitPrice: number | string;
    quantity: number | string;
  } | null;
};

export default function SubscriptionsClient({
  initialSubs,
  readyJobs = [],
  team,
  canManage,
  serviceFeeOn = false,
  today,
}: {
  initialSubs: Sub[];
  /** Completed per-visit-series work nothing has invoiced yet. */
  readyJobs?: ReadyJob[];
  team: { id: string; name: string }[];
  canManage: boolean;
  /** The company's Service fee switch — autopay charges carry the card service fee (lib/service-fee.ts). */
  serviceFeeOn?: boolean;
  /** YYYY-MM-DD in the company's zone (server-computed, so the strip hydrates). */
  today?: string;
}) {
  const router = useRouter();
  const [subs, setSubs] = useState<Sub[]>(initialSubs);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    unitPrice: "",
    quantity: "",
    interval: "MONTHLY" as BillingInterval,
    nextRunDate: "",
    visitFrequency: "" as "" | Frequency,
    nextVisitDate: "",
    visitTime: "", // "" = Anytime, else minutes from midnight
    visitDuration: "60",
    visitAssignees: [] as string[],
    savedCardId: "", // "" = default card
  });

  function openEdit(s: Sub) {
    setEditForm({
      name: s.name,
      unitPrice: String(Number(s.unitPrice)),
      quantity: String(Number(s.quantity)),
      interval: s.interval ?? "MONTHLY",
      nextRunDate: s.nextRunDate ? s.nextRunDate.slice(0, 10) : "",
      visitFrequency: s.visitFrequency ?? "",
      nextVisitDate: s.nextVisitDate ? s.nextVisitDate.slice(0, 10) : "",
      visitTime: s.visitStartMinutes != null ? String(s.visitStartMinutes) : "",
      visitDuration: String(s.visitDurationMinutes ?? 60),
      visitAssignees: s.visitAssigneeIds ?? [],
      savedCardId: s.savedCardId ?? "",
    });
    setError("");
    setEditId(s.id);
  }

  async function saveEdit(id: string) {
    if (!editForm.name.trim()) {
      setError("The subscription needs a name.");
      return;
    }
    if (editForm.visitFrequency && !editForm.nextVisitDate) {
      setError("Pick the first visit date for the visit schedule.");
      return;
    }
    // Standalone recurring-job series have no billing — leave those fields
    // out entirely so the PATCH can't accidentally start billing one.
    // Per-visit series are priced but have no schedule fields to send.
    const sub = subs.find((s) => s.id === id);
    const bills = Boolean(sub?.interval);
    const perVisit = Boolean(sub?.billPerVisit);
    const data = await patch(id, {
      name: editForm.name,
      ...((bills || perVisit) && {
        unitPrice: parseFloat(editForm.unitPrice) || 0,
        quantity: parseFloat(editForm.quantity) || 1,
        savedCardId: editForm.savedCardId || null,
      }),
      ...(bills && {
        interval: editForm.interval,
        nextRunDate: editForm.nextRunDate,
      }),
      visitFrequency: editForm.visitFrequency || null,
      nextVisitDate: editForm.visitFrequency ? editForm.nextVisitDate : null,
      visitStartMinutes: editForm.visitTime === "" ? null : Number(editForm.visitTime),
      visitDurationMinutes: Number(editForm.visitDuration) || 60,
      visitAssigneeIds: editForm.visitAssignees,
    });
    if (data) {
      // Merge what the server actually stored (it normalizes dates, may
      // reject a card, rolls the visit cursor) — the form is only a draft.
      // The contact relation isn't on the PATCH response, so keep ours.
      setSubs((list) =>
        list.map((s) =>
          s.id === id ? { ...s, ...data, contact: data.contact ?? s.contact } : s
        )
      );
      setEditId(null);
      const created = (data as { visitsCreated?: number }).visitsCreated ?? 0;
      if (created > 0) {
        setFlash(`${created} upcoming visit${created === 1 ? "" : "s"} added to the schedule.`);
        setTimeout(() => setFlash(""), 6000);
      }
      router.refresh();
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError("");
    const { ok, data } = await postJson<Sub>(`/api/app/subscriptions/${id}`, body, "PATCH");
    setBusyId(null);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return null;
    }
    return data;
  }

  async function setStatus(id: string, status: Sub["status"]) {
    const data = await patch(id, { status });
    if (data) {
      setSubs((list) => list.map((s) => (s.id === id ? { ...s, status } : s)));
      router.refresh();
    }
  }

  async function billNow(id: string) {
    const data = await patch(id, { action: "billNow" });
    if (data) {
      setFlash("Invoice generated.");
      setTimeout(() => setFlash(""), 5000);
      router.refresh();
    }
  }

  async function runAll() {
    setRunningAll(true);
    setError("");
    const { ok, data } = await postJson<{ processed: number }>("/api/app/subscriptions/run", {}, "POST");
    setRunningAll(false);
    if (!ok) {
      setError((data as { error?: string })?.error ?? GENERIC_ERROR);
      return;
    }
    setFlash(`Processed ${data?.processed ?? 0} due subscription(s).`);
    setTimeout(() => setFlash(""), 6000);
    router.refresh();
  }

  const [billingReady, setBillingReady] = useState(false);
  const [readyBilled, setReadyBilled] = useState(false);

  async function billReady() {
    setBillingReady(true);
    setError("");
    const { ok, data } = await postJson<{ invoices?: number; charged?: number }>(
      "/api/app/subscriptions/bill-ready",
      {},
      "POST"
    );
    setBillingReady(false);
    if (!ok) {
      setError((data as { error?: string })?.error ?? GENERIC_ERROR);
      return;
    }
    setReadyBilled(true);
    const n = data?.invoices ?? 0;
    const charged = data?.charged ?? 0;
    setFlash(
      `${n} invoice${n === 1 ? "" : "s"} created${charged > 0 ? `, ${charged} charged to cards on file` : ""}.`
    );
    setTimeout(() => setFlash(""), 8000);
    router.refresh();
  }

  // Ready-to-bill queue, grouped per client
  const readyGroups = (() => {
    const byContact = new Map<string, { contact: ReadyJob["contact"]; jobs: ReadyJob[]; total: number }>();
    for (const j of readyJobs) {
      if (!j.subscription) continue;
      const g = byContact.get(j.contact.id) ?? { contact: j.contact, jobs: [], total: 0 };
      g.jobs.push(j);
      g.total += Number(j.subscription.unitPrice) * Number(j.subscription.quantity);
      byContact.set(j.contact.id, g);
    }
    return Array.from(byContact.values());
  })();
  const readyTotal = readyGroups.reduce((s, g) => s + g.total, 0);

  const active = subs.filter((s) => s.status !== "CANCELLED");
  const cancelled = subs.filter((s) => s.status === "CANCELLED");

  const monthly = (sub: Sub) => {
    const amt = Number(sub.unitPrice) * Number(sub.quantity);
    if (!sub.interval) return 0;
    return sub.interval === "MONTHLY" ? amt : sub.interval === "QUARTERLY" ? amt / 3 : sub.interval === "SEMIANNUAL" ? amt / 6 : amt / 12;
  };
  const live = active.filter((x) => x.status === "ACTIVE");
  const mrr = live.reduce((t, x) => t + monthly(x), 0);
  const paused = active.filter((x) => x.status === "PAUSED").length;
  const editing = subs.find((x) => x.id === editId) ?? null;
  const cadence = (x: Sub) =>
    x.interval
      ? { amount: money(Number(x.unitPrice) * Number(x.quantity)), per: INTERVAL_PER[x.interval] }
      : x.billPerVisit
        ? { amount: money(Number(x.unitPrice) * Number(x.quantity)), per: "per visit" }
        : { amount: null, per: "Recurring job — no billing" };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-5 lg:mb-6">
        <PageTitle heavy info="Auto-charged plans, plus work billed per completed visit.">Recurring</PageTitle>
        {canManage && (
          <div className="flex items-center gap-2">
            {active.length > 0 && (
              <button
                onClick={runAll}
                disabled={runningAll}
                className="ds-btn ds-btn-outline shrink-0 disabled:opacity-50"
                title="Generate invoices for any subscriptions that are due now"
                aria-label="Run due now"
              >
                {runningAll ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
                <span className="hidden sm:inline">Run due now</span>
                <span className="sm:hidden">Run</span>
              </button>
            )}
            <Link
              href="/app/subscriptions/new"
              className="btn-primary shrink-0"
            >
              <Repeat size={14} />
              <span className="hidden sm:inline">New plan</span>
              <span className="sm:hidden">New</span>
            </Link>
          </div>
        )}
      </div>
      {error && (
        <div role="alert" className="form-error mb-4">{error}</div>
      )}
      {flash && (
        <div className="mb-4 rounded-lg bg-[color:var(--ds-good-soft)] px-4 py-3 text-sm text-[color:var(--ds-good)]">{flash}</div>
      )}

      {/* The band — what the plans bring in each month */}
      {subs.length > 0 && (
        <RecurringStrip subs={live} mrr={mrr} paused={paused} today={today} monthly={monthly} />
      )}

      {/* Ready to bill — completed per-job work nothing has invoiced yet.
          Billing it here is the whole per-job model: click daily for
          per-visit invoices, click on the 1st for one monthly invoice. */}
      {readyGroups.length > 0 && !readyBilled && (
        <div className="ds-card ds-card-raised mb-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-5 py-4 border-b border-[color:var(--ds-line)]">
            <div>
              <p className="flex items-center gap-1.5 text-[16px] font-bold text-[color:var(--ds-ink)]">
                <span>
                  Ready to bill{" "}
                  <span className="numeral-ledger">{money(readyTotal)}</span>
                </span>
                <InfoTip>
                  One invoice per series, charged to the card on file.
                  {serviceFeeOn ? ` The ${SERVICE_FEE_CARD} card service fee is added to each charge, like on the pay page.` : ""}
                </InfoTip>
              </p>
              <p className="text-[13px] text-[color:var(--ds-muted)]">
                {readyJobs.length} completed visit{readyJobs.length === 1 ? "" : "s"} ·{" "}
                {readyGroups.length} client{readyGroups.length === 1 ? "" : "s"}
              </p>
            </div>
            {canManage && (
              <button
                onClick={billReady}
                disabled={billingReady}
                className="btn-primary"
              >
                {billingReady && <Loader2 size={13} className="animate-spin" />}
                Bill ready work
              </button>
            )}
          </div>
          <div className="divide-y divide-gray-100">
            {readyGroups.map((g) => (
              <div key={g.contact.id} className="px-4 lg:px-5 py-2.5 flex items-center gap-3 text-sm">
                <Link
                  prefetch={false} href={`/app/contacts/${g.contact.id}`}
                  className="min-w-0 flex-1 truncate text-gray-800 hover:underline"
                >
                  {g.contact.firstName} {g.contact.lastName}
                </Link>
                <span className="text-xs text-gray-500">
                  {g.jobs.length} visit{g.jobs.length === 1 ? "" : "s"}
                </span>
                <span className="numeral-ledger text-sm font-semibold text-gray-900">
                  {money(g.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {subs.length === 0 ? (
        <div className="ds-card">
          <EmptyState
            icon={Repeat}
            hue="var(--ds-primary)"
            title="No recurring plans yet"
            body={
              <>
                Start one with <span className="font-medium text-gray-700">New plan</span>, or mark
                a service as recurring in{" "}
                <Link href="/app/settings/products" className="ds-link">
                  Services
                </Link>{" "}
                so selling it starts a plan.
              </>
            }
          />
        </div>
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {active.map((s, i) => {
                const c = cadence(s);
                const bills = (s.interval || (s.billPerVisit && s.consolidateMonthly)) && s.nextRunDate;
                return (
                  <div key={s.id} className="ds-rise" style={{ "--ds-i": i + 2 } as React.CSSProperties}>
                    <div className={`ds-card ds-card-raised ds-plan-card ${s.status === "PAUSED" ? "is-paused" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-[16.5px] font-bold leading-snug tracking-[-0.012em] text-[color:var(--ds-ink)]">{s.name}</p>
                          <Link prefetch={false} href={`/app/contacts/${s.contact.id}`} className="ds-link text-[13.5px] font-semibold">
                            {s.contact.firstName} {s.contact.lastName}
                          </Link>
                        </div>
                        {s.status === "PAUSED" ? <Chip tone="warn" icon={Pause}>Paused</Chip> : <Chip tone="good" icon={Repeat}>Active</Chip>}
                      </div>
                      <p className="mt-4 flex items-baseline gap-1.5">
                        {c.amount && <span className="text-[28px] font-extrabold leading-none tracking-[-0.03em] text-[color:var(--ds-ink)]">{c.amount}</span>}
                        <span className="text-[13.5px] font-semibold text-[color:var(--ds-muted)]">{c.per}</span>
                      </p>
                      <dl className="ds-plan-facts">
                        {bills && (
                          <div>
                            <dt>Bills</dt>
                            <dd>{fmtDate(s.nextRunDate!)}</dd>
                          </div>
                        )}
                        {s.visitFrequency && (
                          <div>
                            <dt>Visits</dt>
                            <dd>
                              {FREQ_LABEL[s.visitFrequency]}
                              {s.nextVisitDate ? ` · next ${fmtDate(s.nextVisitDate)}` : ""}
                            </dd>
                          </div>
                        )}
                        {!s.visitFrequency && s.createsJob && (
                          <div>
                            <dt>Visits</dt>
                            <dd>Creates a job each time</dd>
                          </div>
                        )}
                        {(s.interval || s.billPerVisit) && s.invoiceMode === "DRAFT" && (
                          <div>
                            <dt>Invoices</dt>
                            <dd>Drafts only</dd>
                          </div>
                        )}
                        {s.billPerVisit && (
                          <div>
                            <dt>Billing</dt>
                            <dd>{s.consolidateMonthly ? (s.nextRunDate ? "Monthly, from visits" : "From the ready queue") : "On each completed visit"}</dd>
                          </div>
                        )}
                      </dl>
                      {canManage && (
                        <div className="ds-plan-actions">
                          {(s.interval || (s.billPerVisit && s.consolidateMonthly)) && (
                            <button
                              onClick={() => billNow(s.id)}
                              disabled={busyId === s.id || s.status !== "ACTIVE"}
                              className="ds-btn ds-btn-primary ds-btn-sm disabled:opacity-40"
                              title={
                                s.interval
                                  ? "Generate this subscription's next invoice now"
                                  : "Invoice the completed visits accumulated so far now"
                              }
                            >
                              {busyId === s.id ? <Loader2 size={13} className="animate-spin" /> : "Bill now"}
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(s)}
                            disabled={busyId === s.id}
                            className="ds-btn ds-btn-outline ds-btn-sm disabled:opacity-40"
                          >
                            <Pencil size={13} />
                            Edit
                          </button>
                          {s.status === "ACTIVE" ? (
                            <button
                              onClick={() => setStatus(s.id, "PAUSED")}
                              disabled={busyId === s.id}
                              className="ds-plan-icon ml-auto"
                              title="Pause"
                              aria-label="Pause"
                            >
                              <Pause size={15} />
                            </button>
                          ) : (
                            <button
                              onClick={() => setStatus(s.id, "ACTIVE")}
                              disabled={busyId === s.id}
                              className="ds-plan-icon ml-auto"
                              title="Resume"
                              aria-label="Resume"
                            >
                              <Play size={15} />
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (
                                await confirmSheet({
                                  title: "Cancel this subscription?",
                                  message: "It will stop billing.",
                                  confirmLabel: "Cancel subscription",
                                  cancelLabel: "Keep it",
                                  destructive: true,
                                })
                              )
                                setStatus(s.id, "CANCELLED");
                            }}
                            disabled={busyId === s.id}
                            className="ds-plan-icon is-danger"
                            title="Cancel"
                            aria-label="Cancel plan"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {cancelled.length > 0 && (
            <div>
              <h2 className="ds-heavy-h2 mb-3 !text-[15px] !text-[color:var(--ds-muted)]">Cancelled</h2>
              <div className="ds-card overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {cancelled.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm text-gray-500">
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold text-gray-700">{s.name}</span> · {s.contact.firstName} {s.contact.lastName}
                      </span>
                      <span className="shrink-0 text-xs">
                        {s.interval
                          ? INTERVAL_LABEL[s.interval]
                          : s.billPerVisit
                            ? s.consolidateMonthly
                              ? "Per visit, billed monthly"
                              : "Billed per visit"
                            : "Recurring job"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit opens in a panel, not inside the list */}
      <Modal open={Boolean(editing)} onClose={() => setEditId(null)} size="2xl">
        {editing &&
          ((s: Sub) => (
            <div>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[19px] font-bold tracking-[-0.015em] text-[color:var(--ds-ink)]">Edit plan</h2>
                  <p className="text-[13.5px] text-[color:var(--ds-muted)]">
                    {s.contact.firstName} {s.contact.lastName}
                  </p>
                </div>
                <button type="button" onClick={() => setEditId(null)} aria-label="Close" className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  <X size={16} />
                </button>
              </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <div className="col-span-2 sm:col-span-2">
                        <label className="block text-xs text-gray-500 mb-0.5">Name</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                        />
                      </div>
                      {(s.interval || s.billPerVisit) && (
                        <>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">
                              {s.billPerVisit ? "Price per visit" : "Unit price"}
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editForm.unitPrice}
                              onChange={(e) => setEditForm((f) => ({ ...f, unitPrice: e.target.value }))}
                              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Qty</label>
                            <input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={editForm.quantity}
                              onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                            />
                          </div>
                          {s.interval && (
                            <>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Interval</label>
                                <select
                                  value={editForm.interval}
                                  onChange={(e) =>
                                    setEditForm((f) => ({ ...f, interval: e.target.value as BillingInterval }))
                                  }
                                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                                >
                                  {(Object.keys(INTERVAL_LABEL) as BillingInterval[]).map((iv) => (
                                    <option key={iv} value={iv}>
                                      {INTERVAL_LABEL[iv]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Next billing</label>
                                <DateField
                                  value={editForm.nextRunDate}
                                  onChange={(e) => setEditForm((f) => ({ ...f, nextRunDate: e.target.value }))}
                                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                                />
                              </div>
                            </>
                          )}
                          {s.contact.savedCards.length > 0 && (
                            <div className="col-span-2">
                              <label className="block text-xs text-gray-500 mb-0.5">
                                Autopay card
                                {serviceFeeOn ? ` · charged with the ${SERVICE_FEE_CARD} service fee` : ""}
                              </label>
                              <select
                                value={editForm.savedCardId}
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, savedCardId: e.target.value }))
                                }
                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                              >
                                <option value="">
                                  Default card
                                  {(() => {
                                    const d =
                                      s.contact.savedCards.find((c) => c.isDefault) ??
                                      s.contact.savedCards[0];
                                    return d ? ` (${d.label})` : "";
                                  })()}
                                </option>
                                {s.contact.savedCards.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {/* Visit schedule — visit cadence decoupled from billing */}
                    <div className="pt-3 border-t border-gray-200">
                      <p className="text-[13px] font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                        Visit schedule
                        {editForm.visitFrequency && (
                          <InfoTip>
                            The next ~4 weeks of visits appear on the schedule as regular jobs — drag
                            one to reschedule it, or delete it to skip that visit. Billing stays on
                            its own cadence above.
                          </InfoTip>
                        )}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="col-span-2 sm:col-span-1">
                          <label className="block text-xs text-gray-500 mb-0.5">Repeats</label>
                          <select
                            value={editForm.visitFrequency}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                visitFrequency: e.target.value as "" | Frequency,
                              }))
                            }
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                          >
                            <option value="">No repeating visits</option>
                            {(Object.keys(FREQ_LABEL) as Frequency[]).map((fq) => (
                              <option key={fq} value={fq}>
                                {FREQ_LABEL[fq]}
                              </option>
                            ))}
                          </select>
                        </div>
                        {editForm.visitFrequency && (
                          <>
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">Next visit</label>
                              <DateField
                                value={editForm.nextVisitDate}
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, nextVisitDate: e.target.value }))
                                }
                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">Time</label>
                              <select
                                value={editForm.visitTime}
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, visitTime: e.target.value }))
                                }
                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                              >
                                <option value="">Anytime</option>
                                {TIME_OPTIONS.map((t) => (
                                  <option key={t.value} value={t.value}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {editForm.visitTime !== "" && (
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Length</label>
                                <select
                                  value={editForm.visitDuration}
                                  onChange={(e) =>
                                    setEditForm((f) => ({ ...f, visitDuration: e.target.value }))
                                  }
                                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                                >
                                  {DURATION_OPTIONS.map((d) => (
                                    <option key={d.value} value={d.value}>
                                      {d.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      {editForm.visitFrequency && team.length > 0 && (
                        <div className="mt-2">
                          <label className="block text-xs text-gray-500 mb-1">Assign visits to</label>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {team.map((u) => (
                              <label key={u.id} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editForm.visitAssignees.includes(u.id)}
                                  onChange={(e) =>
                                    setEditForm((f) => ({
                                      ...f,
                                      visitAssignees: e.target.checked
                                        ? [...f.visitAssignees, u.id]
                                        : f.visitAssignees.filter((id) => id !== u.id),
                                    }))
                                  }
                                  className="accent-[color:var(--ds-primary)]"
                                />
                                {u.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Changes apply from the next billing run — invoices already generated keep their
                      amounts.
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => saveEdit(s.id)}
                        disabled={busyId === s.id}
                        className="ds-btn ds-btn-primary ds-btn-sm disabled:opacity-40"
                      >
                        {busyId === s.id ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Check size={11} />
                        )}
                        Save
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        disabled={busyId === s.id}
                        className="flex items-center gap-1 px-4 py-2.5 lg:px-3 lg:py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 active:bg-gray-100 rounded-full"
                      >
                        <X size={11} />
                        Cancel
                      </button>
                    </div>
                  </div>
            </div>
          ))(editing)}
      </Modal>
    </div>
  );
}

/**
 * Recurring's page picture (2026-11-21): the next 30 days as a strip, a
 * client circle on each day a plan bills. Replaced the number cards (David:
 * generic tiles read AI-made); the title carries the monthly figure.
 */
function RecurringStrip({
  subs,
  mrr,
  paused,
  today,
  monthly,
}: {
  subs: Sub[];
  mrr: number;
  paused: number;
  today?: string;
  monthly: (s: Sub) => number;
}) {
  const DAYS = 30;
  const start = Date.parse(`${today ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const bills = subs
    .filter((s) => s.nextRunDate && (s.interval || (s.billPerVisit && s.consolidateMonthly)))
    .map((s) => ({ s, day: Math.round((Date.parse(`${s.nextRunDate!.slice(0, 10)}T00:00:00Z`) - start) / 86400000) }))
    .filter((b) => b.day >= 0 && b.day < DAYS);
  const byDay = new Map<number, Sub[]>();
  for (const b of bills) byDay.set(b.day, [...(byDay.get(b.day) ?? []), b.s]);
  const dayLabel = (d: number) =>
    new Date(start + d * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const total30 = bills.reduce((t, b) => t + Number(b.s.unitPrice) * Number(b.s.quantity), 0);
  return (
    <Picture
      title={
        <>
          <b>
            <CountUp value={money(mrr)} />
          </b>{" "}
          a month from {subs.length} {subs.length === 1 ? "plan" : "plans"}
          {paused > 0 && <span className="ds-pic-quiet"> · {paused} paused</span>}
        </>
      }
      aside={
        <span className="ds-pic-quiet text-[13px] font-semibold">
          {bills.length === 0 ? "Nothing bills in the next 30 days" : `${money(total30)} bills in the next 30 days`}
        </span>
      }
    >
      <div className="ds-days" role="img" aria-label={`${bills.length} plans bill in the next 30 days`}>
        <div className="ds-days-track">
          {Array.from({ length: DAYS }, (_, d) => {
            const here = byDay.get(d) ?? [];
            return (
              <span key={d} className={`ds-days-day ${d === 0 ? "is-today" : ""} ${here.length ? "has-bill" : ""}`}>
                <span className="ds-days-stack">
                  {here.slice(0, 3).map((s) => (
                    <span
                      key={s.id}
                      className="ds-days-bill"
                      title={`${dayLabel(d)} · ${s.name} · ${s.contact.firstName} ${s.contact.lastName} · ${money(Number(s.unitPrice) * Number(s.quantity))}${monthly(s) ? "" : " per visit"}`}
                    >
                      <Monogram name={`${s.contact.firstName} ${s.contact.lastName}`} size={24} />
                    </span>
                  ))}
                  {here.length > 3 && <span className="ds-days-more">+{here.length - 3}</span>}
                </span>
                <span className="ds-days-tick" />
              </span>
            );
          })}
        </div>
        <div className="ds-days-axis">
          {[0, 7, 14, 21, 29].map((d) => (
            <span key={d} style={{ left: `${((d + 0.5) / DAYS) * 100}%` }}>
              {d === 0 ? "Today" : dayLabel(d)}
            </span>
          ))}
        </div>
      </div>
    </Picture>
  );
}
