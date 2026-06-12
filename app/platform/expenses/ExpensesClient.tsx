"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, Plus, Trash2, X } from "lucide-react";
import { money } from "@/lib/statuses";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/** Business expense log (owners/admins): record transactions by date and
 *  export any period as CSV for the bookkeeper. */

type Expense = {
  id: string;
  description: string;
  category: string | null;
  amount: number;
  incurredAt: string; // YYYY-MM-DD
};

const inputCls =
  "px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

export default function ExpensesClient({ expenses }: { expenses: Expense[] }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  const total30 = expenses
    .filter((e) => new Date(e.incurredAt) >= new Date(Date.now() - 30 * 86400000))
    .reduce((s, e) => s + e.amount, 0);

  async function add() {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson("/api/app/expenses", {
      description,
      category,
      amount: parseFloat(amount),
      incurredAt,
    });
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setDescription("");
    setCategory("");
    setAmount("");
    setShowAdd(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this expense?")) return;
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/expenses/${id}`, undefined, "DELETE");
    setBusy(false);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.refresh();
  }

  function exportCsv() {
    const params = new URLSearchParams({ format: "csv" });
    if (exportFrom) params.set("from", exportFrom);
    if (exportTo) params.set("to", exportTo);
    window.open(`/api/app/expenses?${params.toString()}`, "_blank");
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-3">
          <Link href="/app/insights" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
        >
          <Plus size={15} />
          Log Expense
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6 ml-8">
        {money(total30)} spent in the last 30 days · visible to owners and admins only
      </p>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {showAdd && (
        <div className="card-ledger p-5 mb-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description *</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Fuel, Home Depot supplies"
                className={`${inputCls} w-full`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Fuel, Materials, Equipment"
                className={`${inputCls} w-full`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Amount *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${inputCls} w-full`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Transaction date *</label>
              <input
                type="date"
                value={incurredAt}
                onChange={(e) => setIncurredAt(e.target.value)}
                className={`${inputCls} w-full`}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={add}
              disabled={busy || !description.trim() || !amount || !incurredAt}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded disabled:opacity-50"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              Save Expense
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Export */}
      <div className="card-ledger p-4 mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className={inputCls} />
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download size={14} />
          Export CSV
        </button>
        <p className="text-xs text-gray-400">Leave dates empty to export everything.</p>
      </div>

      <div className="card-ledger divide-y divide-gray-100">
        {expenses.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">
            No expenses logged yet — track fuel, materials, and equipment to see real profit on
            Insights.
          </p>
        ) : (
          expenses.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-24 shrink-0 text-sm text-gray-500">
                {new Date(`${e.incurredAt}T12:00:00`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{e.description}</p>
                {e.category && <p className="text-xs text-gray-500">{e.category}</p>}
              </div>
              <span className="text-sm font-semibold text-gray-900">{money(e.amount)}</span>
              <button
                onClick={() => remove(e.id)}
                disabled={busy}
                className="p-1.5 text-gray-300 hover:text-red-600 rounded"
                title="Delete expense"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
