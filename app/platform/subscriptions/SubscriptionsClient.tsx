"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Repeat, Loader2, Pencil, Play, Pause, X, RotateCw } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

type Sub = {
  id: string;
  name: string;
  unitPrice: number | string;
  quantity: number | string;
  interval: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL";
  createsJob: boolean;
  invoiceMode: "SEND" | "DRAFT";
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  nextRunDate: string;
  contact: { id: string; firstName: string; lastName: string };
};

const INTERVAL_LABEL: Record<Sub["interval"], string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMIANNUAL: "Every 6 months",
  ANNUAL: "Annually",
};

function money(n: number | string) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function SubscriptionsClient({
  initialSubs,
  canManage,
}: {
  initialSubs: Sub[];
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
    interval: "MONTHLY" as Sub["interval"],
    nextRunDate: "",
  });

  function openEdit(s: Sub) {
    setEditForm({
      name: s.name,
      unitPrice: String(Number(s.unitPrice)),
      quantity: String(Number(s.quantity)),
      interval: s.interval,
      nextRunDate: s.nextRunDate.slice(0, 10),
    });
    setError("");
    setEditId(s.id);
  }

  async function saveEdit(id: string) {
    if (!editForm.name.trim()) {
      setError("The subscription needs a name.");
      return;
    }
    const data = await patch(id, {
      name: editForm.name,
      unitPrice: parseFloat(editForm.unitPrice) || 0,
      quantity: parseFloat(editForm.quantity) || 1,
      interval: editForm.interval,
      nextRunDate: editForm.nextRunDate,
    });
    if (data) {
      setSubs((list) =>
        list.map((s) =>
          s.id === id
            ? {
                ...s,
                name: editForm.name.trim(),
                unitPrice: parseFloat(editForm.unitPrice) || 0,
                quantity: parseFloat(editForm.quantity) || 1,
                interval: editForm.interval,
                nextRunDate: `${editForm.nextRunDate}T12:00:00`,
              }
            : s
        )
      );
      setEditId(null);
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

  const active = subs.filter((s) => s.status !== "CANCELLED");
  const cancelled = subs.filter((s) => s.status === "CANCELLED");

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Subscriptions</h1>
        {canManage && active.length > 0 && (
          <button
            onClick={runAll}
            disabled={runningAll}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Generate invoices for any subscriptions that are due now"
          >
            {runningAll ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
            Run due now
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Recurring services sold to your clients. Each cycle auto-generates the next invoice.
      </p>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}
      {flash && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">{flash}</div>
      )}

      {subs.length === 0 ? (
        <div className="card-ledger py-16 text-center">
          <Repeat size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm mb-1">No subscriptions yet.</p>
          <p className="text-gray-400 text-xs">
            Mark a service recurring in{" "}
            <Link href="/app/settings/products" className="text-green-600 hover:underline">
              Products &amp; Services
            </Link>
            ; selling it starts a subscription automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card-ledger overflow-hidden">
            <div className="divide-y divide-gray-100">
              {active.map((s) =>
                editId === s.id ? (
                  <div key={s.id} className="px-5 py-4 bg-gray-50/70 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <div className="col-span-2 sm:col-span-2">
                        <label className="block text-xs text-gray-500 mb-0.5">Name</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Unit price</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editForm.unitPrice}
                          onChange={(e) => setEditForm((f) => ({ ...f, unitPrice: e.target.value }))}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Interval</label>
                        <select
                          value={editForm.interval}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, interval: e.target.value as Sub["interval"] }))
                          }
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                          {(Object.keys(INTERVAL_LABEL) as Sub["interval"][]).map((iv) => (
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
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      Changes apply from the next billing run — invoices already generated keep their
                      amounts.
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => saveEdit(s.id)}
                        disabled={busyId === s.id}
                        className="flex items-center gap-1 px-3 py-1.5 chamfer bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded transition-colors disabled:opacity-40"
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
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded"
                      >
                        <X size={11} />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                <div key={s.id} className="px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2">
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
                      {INTERVAL_LABEL[s.interval]} · {money(Number(s.unitPrice) * Number(s.quantity))}
                      {s.createsJob && " · creates a job"}
                      {s.invoiceMode === "DRAFT" && " · drafts only"}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">
                    Next: <span className="font-medium text-gray-700">{fmtDate(s.nextRunDate)}</span>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(s)}
                        disabled={busyId === s.id}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        title="Edit subscription"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => billNow(s.id)}
                        disabled={busyId === s.id || s.status !== "ACTIVE"}
                        className="px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded transition-colors disabled:opacity-40"
                        title="Generate this subscription's next invoice now"
                      >
                        {busyId === s.id ? <Loader2 size={13} className="animate-spin" /> : "Bill now"}
                      </button>
                      {s.status === "ACTIVE" ? (
                        <button
                          onClick={() => setStatus(s.id, "PAUSED")}
                          disabled={busyId === s.id}
                          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                          title="Pause"
                        >
                          <Pause size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => setStatus(s.id, "ACTIVE")}
                          disabled={busyId === s.id}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                          title="Resume"
                        >
                          <Play size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm("Cancel this subscription? It will stop billing.")) setStatus(s.id, "CANCELLED");
                        }}
                        disabled={busyId === s.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
                )
              )}
            </div>
          </div>

          {cancelled.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Cancelled</p>
              <div className="card-ledger overflow-hidden opacity-70">
                <div className="divide-y divide-gray-100">
                  {cancelled.map((s) => (
                    <div key={s.id} className="px-5 py-3 text-sm text-gray-500">
                      {s.name} — {s.contact.firstName} {s.contact.lastName} ({INTERVAL_LABEL[s.interval]})
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
