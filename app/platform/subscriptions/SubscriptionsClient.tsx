"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Repeat, Loader2, Pencil, Play, Pause, X, RotateCw } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { confirmSheet } from "@/components/ConfirmSheet";
import PageTitle from "@/components/PageTitle";

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

function money(n: number | string) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
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
}: {
  initialSubs: Sub[];
  /** Completed per-visit-series work nothing has invoiced yet. */
  readyJobs?: ReadyJob[];
  team: { id: string; name: string }[];
  canManage: boolean;
}) {
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
      setSubs((list) =>
        list.map((s) =>
          s.id === id
            ? {
                ...s,
                name: editForm.name.trim(),
                ...((s.interval || s.billPerVisit) && {
                  unitPrice: parseFloat(editForm.unitPrice) || 0,
                  quantity: parseFloat(editForm.quantity) || 1,
                  savedCardId: editForm.savedCardId || null,
                }),
                ...(s.interval && {
                  interval: editForm.interval,
                  nextRunDate: `${editForm.nextRunDate}T12:00:00`,
                }),
                visitFrequency: editForm.visitFrequency || null,
                nextVisitDate: editForm.visitFrequency
                  ? `${editForm.nextVisitDate}T12:00:00`
                  : null,
                visitStartMinutes: editForm.visitTime === "" ? null : Number(editForm.visitTime),
                visitDurationMinutes: Number(editForm.visitDuration) || 60,
                visitAssigneeIds: editForm.visitAssignees,
              }
            : s
        )
      );
      setEditId(null);
      const created = (data as { visitsCreated?: number }).visitsCreated ?? 0;
      if (created > 0) {
        setFlash(`${created} upcoming visit${created === 1 ? "" : "s"} added to the schedule.`);
        setTimeout(() => setFlash(""), 6000);
      }
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
    if (data) setSubs((list) => list.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  async function billNow(id: string) {
    const data = await patch(id, { action: "billNow" });
    if (data) {
      setFlash("Invoice generated. Refresh to see the updated next run date.");
      setTimeout(() => setFlash(""), 5000);
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
    setFlash(`Processed ${data?.processed ?? 0} due subscription(s). Refresh to see changes.`);
    setTimeout(() => setFlash(""), 6000);
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
      `${n} invoice${n === 1 ? "" : "s"} created${charged > 0 ? `, ${charged} charged to cards on file` : ""}. Refresh to see them.`
    );
    setTimeout(() => setFlash(""), 8000);
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

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1">
        <PageTitle>Recurring</PageTitle>
        {canManage && (
          <div className="flex items-center gap-2">
            {active.length > 0 && (
              <button
                onClick={runAll}
                disabled={runningAll}
                className="flex items-center gap-1.5 px-3 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-50"
                title="Generate invoices for any subscriptions that are due now"
              >
                {runningAll ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
                Run due now
              </button>
            )}
            <Link
              href="/app/subscriptions/new"
              className="flex items-center gap-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
            >
              <Repeat size={14} />
              New Series
            </Link>
          </div>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Monthly plans that auto-charge, and per-job series billed for completed work.
      </p>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {flash && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{flash}</div>
      )}

      {/* Ready to bill — completed per-job work nothing has invoiced yet.
          Billing it here is the whole per-job model: click daily for
          per-visit invoices, click on the 1st for one monthly invoice. */}
      {readyGroups.length > 0 && !readyBilled && (
        <div className="card-ledger mb-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-5 py-3.5 border-b border-gray-100 bg-green-50/50">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Ready to bill{" "}
                <span className="numeral-ledger">{money(readyTotal)}</span>
              </p>
              <p className="text-xs text-gray-500">
                {readyJobs.length} completed visit{readyJobs.length === 1 ? "" : "s"} across{" "}
                {readyGroups.length} client{readyGroups.length === 1 ? "" : "s"} — one invoice
                per series, charged to cards on file automatically.
              </p>
            </div>
            {canManage && (
              <button
                onClick={billReady}
                disabled={billingReady}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-50"
              >
                {billingReady && <Loader2 size={13} className="animate-spin" />}
                Bill Ready Work
              </button>
            )}
          </div>
          <div className="divide-y divide-gray-100">
            {readyGroups.map((g) => (
              <div key={g.contact.id} className="px-4 lg:px-5 py-2.5 flex items-center gap-3 text-sm">
                <Link
                  href={`/app/contacts/${g.contact.id}`}
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
        <div className="card-ledger py-16 text-center">
          <Repeat size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm mb-1">No recurring series yet.</p>
          <p className="text-gray-400 text-xs">
            Start one with <span className="font-medium text-gray-500">New Series</span> (a repeating
            job, billed or not), or mark a service recurring in{" "}
            <Link href="/app/settings/products" className="text-green-600 hover:underline">
              Products &amp; Services
            </Link>{" "}
            — selling it starts a subscription automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card-ledger overflow-hidden">
            <div className="divide-y divide-gray-100">
              {active.map((s) =>
                editId === s.id ? (
                  <div key={s.id} className="px-4 lg:px-5 py-4 bg-gray-50/70 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <div className="col-span-2 sm:col-span-2">
                        <label className="block text-xs text-gray-500 mb-0.5">Name</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
                              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
                              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
                                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
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
                                <input
                                  type="date"
                                  value={editForm.nextRunDate}
                                  onChange={(e) => setEditForm((f) => ({ ...f, nextRunDate: e.target.value }))}
                                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                              </div>
                            </>
                          )}
                          {s.contact.savedCards.length > 0 && (
                            <div className="col-span-2">
                              <label className="block text-xs text-gray-500 mb-0.5">Autopay card</label>
                              <select
                                value={editForm.savedCardId}
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, savedCardId: e.target.value }))
                                }
                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
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
                      <p className="text-[13px] font-semibold text-gray-500 mb-2">
                        Visit schedule
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
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
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
                              <input
                                type="date"
                                value={editForm.nextVisitDate}
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, nextVisitDate: e.target.value }))
                                }
                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">Time</label>
                              <select
                                value={editForm.visitTime}
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, visitTime: e.target.value }))
                                }
                                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
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
                                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
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
                                  className="accent-green-600"
                                />
                                {u.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {editForm.visitFrequency && (
                        <p className="text-xs text-gray-400 mt-2">
                          The next ~4 weeks of visits appear on the schedule as regular jobs — drag
                          one to reschedule it, or delete it to skip that visit. Billing stays on
                          its own cadence above.
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      Changes apply from the next billing run — invoices already generated keep their
                      amounts.
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => saveEdit(s.id)}
                        disabled={busyId === s.id}
                        className="flex items-center gap-1 px-4 py-2.5 lg:px-3 lg:py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-40"
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
                ) : (
                <div key={s.id} className="px-4 py-3 lg:px-5 lg:py-4">
                  {/* Phone row: name + amount, client/plan sub-line, dates,
                      then wrap-friendly 40px action buttons */}
                  <div className="lg:hidden">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-gray-900">
                        {s.name}
                      </p>
                      {(s.interval || s.billPerVisit) && (
                        <p className="numeral-ledger shrink-0 text-sm font-semibold text-gray-900">
                          {money(Number(s.unitPrice) * Number(s.quantity))}
                        </p>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-xs text-gray-500">
                        <Link href={`/app/contacts/${s.contact.id}`} className="hover:underline">
                          {s.contact.firstName} {s.contact.lastName}
                        </Link>
                        {" · "}
                        {s.interval
                          ? `${INTERVAL_LABEL[s.interval]} plan`
                          : s.billPerVisit
                            ? "Per-job billing"
                            : "Recurring job"}
                        {s.visitFrequency && (
                          <span className="text-green-700">
                            {" · "}visits {FREQ_LABEL[s.visitFrequency].toLowerCase()}
                          </span>
                        )}
                        {!s.visitFrequency && s.createsJob && " · creates a job"}
                        {(s.interval || s.billPerVisit) && s.invoiceMode === "DRAFT" && " · drafts only"}
                      </p>
                      {s.status === "PAUSED" && (
                        <span className="stamp shrink-0 text-amber-700">Paused</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {(s.interval || (s.billPerVisit && s.consolidateMonthly)) && s.nextRunDate && (
                        <>
                          Bills <span className="font-medium text-gray-700">{fmtDate(s.nextRunDate)}</span>
                        </>
                      )}
                      {s.visitFrequency && s.nextVisitDate && (
                        <>
                          {(s.interval || (s.billPerVisit && s.consolidateMonthly)) && s.nextRunDate
                            ? " · "
                            : ""}
                          Next visit{" "}
                          <span className="font-medium text-gray-700">{fmtDate(s.nextVisitDate)}</span>
                        </>
                      )}
                    </p>
                    {canManage && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => openEdit(s)}
                          disabled={busyId === s.id}
                          className="flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 active:bg-gray-100 transition-colors disabled:opacity-40"
                          title="Edit subscription"
                        >
                          <Pencil size={13} />
                          Edit
                        </button>
                        {(s.interval || (s.billPerVisit && s.consolidateMonthly)) && (
                          <button
                            onClick={() => billNow(s.id)}
                            disabled={busyId === s.id || s.status !== "ACTIVE"}
                            className="flex h-10 items-center rounded-[10px] bg-green-50 px-3 text-xs font-medium text-green-700 active:bg-green-100 transition-colors disabled:opacity-40"
                            title={
                              s.interval
                                ? "Generate this subscription's next invoice now"
                                : "Invoice the completed visits accumulated so far now"
                            }
                          >
                            {busyId === s.id ? <Loader2 size={13} className="animate-spin" /> : "Bill now"}
                          </button>
                        )}
                        {s.status === "ACTIVE" ? (
                          <button
                            onClick={() => setStatus(s.id, "PAUSED")}
                            disabled={busyId === s.id}
                            className="flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 active:bg-amber-50 active:text-amber-700 transition-colors disabled:opacity-40"
                            title="Pause"
                          >
                            <Pause size={13} />
                            Pause
                          </button>
                        ) : (
                          <button
                            onClick={() => setStatus(s.id, "ACTIVE")}
                            disabled={busyId === s.id}
                            className="flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 active:bg-green-50 active:text-green-700 transition-colors disabled:opacity-40"
                            title="Resume"
                          >
                            <Play size={13} />
                            Resume
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (
                              await confirmSheet({
                                title: "Cancel this subscription?",
                                message: "It will stop billing.",
                                confirmLabel: "Cancel Subscription",
                                cancelLabel: "Keep It",
                                destructive: true,
                              })
                            )
                              setStatus(s.id, "CANCELLED");
                          }}
                          disabled={busyId === s.id}
                          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 active:bg-red-50 active:text-red-500 transition-colors disabled:opacity-40"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Desktop row (unchanged) */}
                  <div className="hidden lg:flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                        {s.name}
                        {s.status === "PAUSED" && (
                          <span className="stamp text-amber-700">Paused</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        <Link href={`/app/contacts/${s.contact.id}`} className="hover:underline">
                          {s.contact.firstName} {s.contact.lastName}
                        </Link>
                        {" · "}
                        {s.interval
                          ? `${INTERVAL_LABEL[s.interval]} plan · ${money(Number(s.unitPrice) * Number(s.quantity))}`
                          : s.billPerVisit
                            ? `${money(Number(s.unitPrice) * Number(s.quantity))} per visit${
                                s.consolidateMonthly
                                  ? s.nextRunDate
                                    ? " · billed monthly"
                                    : " · bills from the ready queue"
                                  : " · bills on completion"
                              }`
                            : "Recurring job — no billing"}
                        {s.visitFrequency && (
                          <span className="text-green-700">
                            {" · "}visits {FREQ_LABEL[s.visitFrequency].toLowerCase()}
                          </span>
                        )}
                        {!s.visitFrequency && s.createsJob && " · creates a job"}
                        {(s.interval || s.billPerVisit) && s.invoiceMode === "DRAFT" && " · drafts only"}
                      </p>
                    </div>
                    <div className="text-xs text-gray-500 whitespace-nowrap text-right">
                      {(s.interval || (s.billPerVisit && s.consolidateMonthly)) && s.nextRunDate && (
                        <div>
                          Bills: <span className="font-medium text-gray-700">{fmtDate(s.nextRunDate)}</span>
                        </div>
                      )}
                      {s.visitFrequency && s.nextVisitDate && (
                        <div>
                          Next visit:{" "}
                          <span className="font-medium text-gray-700">{fmtDate(s.nextVisitDate)}</span>
                        </div>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          disabled={busyId === s.id}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                          title="Edit subscription"
                        >
                          <Pencil size={14} />
                        </button>
                        {(s.interval || (s.billPerVisit && s.consolidateMonthly)) && (
                          <button
                            onClick={() => billNow(s.id)}
                            disabled={busyId === s.id || s.status !== "ACTIVE"}
                            className="px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-40"
                            title={
                              s.interval
                                ? "Generate this subscription's next invoice now"
                                : "Invoice the completed visits accumulated so far now"
                            }
                          >
                            {busyId === s.id ? <Loader2 size={13} className="animate-spin" /> : "Bill now"}
                          </button>
                        )}
                        {s.status === "ACTIVE" ? (
                          <button
                            onClick={() => setStatus(s.id, "PAUSED")}
                            disabled={busyId === s.id}
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-full transition-colors"
                            title="Pause"
                          >
                            <Pause size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => setStatus(s.id, "ACTIVE")}
                            disabled={busyId === s.id}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors"
                            title="Resume"
                          >
                            <Play size={14} />
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (
                              await confirmSheet({
                                title: "Cancel this subscription?",
                                message: "It will stop billing.",
                                confirmLabel: "Cancel Subscription",
                                cancelLabel: "Keep It",
                                destructive: true,
                              })
                            )
                              setStatus(s.id, "CANCELLED");
                          }}
                          disabled={busyId === s.id}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                )
              )}
            </div>
          </div>

          {cancelled.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Cancelled</p>
              <div className="card-ledger overflow-hidden opacity-70">
                <div className="divide-y divide-gray-100">
                  {cancelled.map((s) => (
                    <div key={s.id} className="px-5 py-3 text-sm text-gray-500">
                      {s.name} — {s.contact.firstName} {s.contact.lastName} (
                      {s.interval
                        ? INTERVAL_LABEL[s.interval]
                        : s.billPerVisit
                          ? s.consolidateMonthly
                            ? "per visit, billed monthly"
                            : "billed per visit"
                          : "recurring job"})
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
