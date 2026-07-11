"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Download, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
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
  "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

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
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    description: "",
    category: "",
    amount: "",
    incurredAt: "",
  });

  function openEdit(e: Expense) {
    setEditForm({
      description: e.description,
      category: e.category ?? "",
      amount: String(e.amount),
      incurredAt: e.incurredAt,
    });
    setError("");
    setEditId(e.id);
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/expenses/${id}`,
      {
        description: editForm.description,
        category: editForm.category,
        amount: parseFloat(editForm.amount),
        incurredAt: editForm.incurredAt,
      },
      "PATCH"
    );
    setBusy(false);
    if (!ok) {
      setError((data as { error?: string })?.error ?? GENERIC_ERROR);
      return;
    }
    setEditId(null);
    router.refresh();
  }

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
          <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Expenses</h1>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-full transition-colors"
        >
          <Plus size={15} />
          Log Expense
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6 ml-8">
        {money(total30)} spent in the last 30 days · visible to owners and admins only
      </p>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
              className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-full disabled:opacity-50"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              Save Expense
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
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
          className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-full text-sm font-medium text-gray-700 hover:bg-gray-50"
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
          expenses.map((e) =>
            editId === e.id ? (
              <div key={e.id} className="px-4 py-3 bg-gray-50/70 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Description</label>
                    <input
                      value={editForm.description}
                      onChange={(ev) => setEditForm((f) => ({ ...f, description: ev.target.value }))}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Category</label>
                    <input
                      value={editForm.category}
                      onChange={(ev) => setEditForm((f) => ({ ...f, category: ev.target.value }))}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Amount</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={editForm.amount}
                      onChange={(ev) => setEditForm((f) => ({ ...f, amount: ev.target.value }))}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Date</label>
                    <input
                      type="date"
                      value={editForm.incurredAt}
                      onChange={(ev) => setEditForm((f) => ({ ...f, incurredAt: ev.target.value }))}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => saveEdit(e.id)}
                    disabled={busy || !editForm.description.trim() || !editForm.amount || !editForm.incurredAt}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-full disabled:opacity-40"
                  >
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    Save
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    disabled={busy}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-full"
                  >
                    <X size={11} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 group">
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
              <span className="flex items-center gap-0.5">
                <button
                  onClick={() => openEdit(e)}
                  disabled={busy}
                  className="p-1.5 text-gray-300 hover:text-gray-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit expense"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => remove(e.id)}
                  disabled={busy}
                  className="p-1.5 text-gray-300 hover:text-red-600 rounded-full"
                  title="Delete expense"
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
            )
          )
        )}
      </div>
    </div>
  );
}
