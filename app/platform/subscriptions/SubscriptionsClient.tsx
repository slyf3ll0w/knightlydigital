"use client";

import { useState } from "react";
import Link from "next/link";
import { Repeat, Loader2, Play, Pause, X, RotateCw } from "lucide-react";
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
              {active.map((s) => (
                <div key={s.id} className="px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                      {s.name}
                      {s.status === "PAUSED" && (
                        <span className="stamp border-amber-600/30 bg-amber-600/[0.06] text-amber-700">Paused</span>
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
              ))}
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
