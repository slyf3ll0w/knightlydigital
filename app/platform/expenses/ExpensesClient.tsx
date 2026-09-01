"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Download, Loader2, Pause, Pencil, Play, Plus, Repeat, Trash2, X } from "lucide-react";
import { money } from "@/lib/statuses";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { confirmSheet } from "@/components/ConfirmSheet";
import PageTitle from "@/components/PageTitle";

/** Business expense log (owners/admins): record transactions by date and
 *  export any period as CSV for the bookkeeper. */

type Expense = {
  id: string;
  description: string;
  category: string | null;
  amount: number;
  incurredAt: string; // YYYY-MM-DD
};

type RecurringExpense = {
  id: string;
  description: string;
  category: string | null;
  amount: number;
  dayOfMonth: number;
  nextRunDate: string; // YYYY-MM-DD
  active: boolean;
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const inputCls =
  "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

export default function ExpensesClient({
  expenses,
  recurring,
}: {
  expenses: Expense[];
  recurring: RecurringExpense[];
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState("");
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editRecId, setEditRecId] = useState<string | null>(null);
  const [recForm, setRecForm] = useState({
    description: "",
    category: "",
    amount: "",
    dayOfMonth: "",
  });
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
      repeatMonthly,
    });
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setDescription("");
    setCategory("");
    setAmount("");
    setRepeatMonthly(false);
    setShowAdd(false);
    router.refresh();
  }

  function openRecEdit(r: RecurringExpense) {
    setRecForm({
      description: r.description,
      category: r.category ?? "",
      amount: String(r.amount),
      dayOfMonth: String(r.dayOfMonth),
    });
    setError("");
    setEditRecId(r.id);
  }

  async function saveRecEdit(id: string) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/expenses/recurring/${id}`,
      {
        description: recForm.description,
        category: recForm.category,
        amount: parseFloat(recForm.amount),
        dayOfMonth: parseInt(recForm.dayOfMonth, 10),
      },
      "PATCH"
    );
    setBusy(false);
    if (!ok) {
      setError((data as { error?: string })?.error ?? GENERIC_ERROR);
      return;
    }
    setEditRecId(null);
    router.refresh();
  }

  async function toggleRec(r: RecurringExpense) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/expenses/recurring/${r.id}`,
      { active: !r.active },
      "PATCH"
    );
    setBusy(false);
    if (!ok) setError((data as { error?: string })?.error ?? GENERIC_ERROR);
    else router.refresh();
  }

  async function removeRec(id: string) {
    if (
      !(await confirmSheet({
        message: "Stop this monthly expense? Entries already logged stay in the list.",
        confirmLabel: "Stop Repeating",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/expenses/recurring/${id}`, undefined, "DELETE");
    setBusy(false);
    if (!ok) setError((data as { error?: string })?.error ?? GENERIC_ERROR);
    else router.refresh();
  }

  async function remove(id: string) {
    if (
      !(await confirmSheet({
        message: "Delete this expense?",
        confirmLabel: "Delete Expense",
        destructive: true,
      }))
    )
      return;
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
          <PageTitle>Expenses</PageTitle>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
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
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={repeatMonthly}
              onChange={(e) => setRepeatMonthly(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <Repeat size={13} className="text-gray-400" />
            Repeat this every month
            {repeatMonthly && incurredAt && (
              <span className="text-xs text-gray-400">
                — logs automatically on the {ordinal(parseInt(incurredAt.slice(8), 10))}
              </span>
            )}
          </label>
          <div className="flex gap-2">
            <button
              onClick={add}
              disabled={busy || !description.trim() || !amount || !incurredAt}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-[10px] btn-tool disabled:opacity-50"
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

      {/* Monthly recurring templates */}
      {recurring.length > 0 && (
        <div className="card-ledger mb-5">
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <Repeat size={14} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Repeats monthly</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {recurring.map((r) =>
              editRecId === r.id ? (
                <div key={r.id} className="px-4 py-3 bg-gray-50/70 space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Description</label>
                      <input
                        value={recForm.description}
                        onChange={(ev) => setRecForm((f) => ({ ...f, description: ev.target.value }))}
                        className={`${inputCls} w-full`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Category</label>
                      <input
                        value={recForm.category}
                        onChange={(ev) => setRecForm((f) => ({ ...f, category: ev.target.value }))}
                        className={`${inputCls} w-full`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Amount</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={recForm.amount}
                        onChange={(ev) => setRecForm((f) => ({ ...f, amount: ev.target.value }))}
                        className={`${inputCls} w-full`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Day of month</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        step="1"
                        value={recForm.dayOfMonth}
                        onChange={(ev) => setRecForm((f) => ({ ...f, dayOfMonth: ev.target.value }))}
                        className={`${inputCls} w-full`}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => saveRecEdit(r.id)}
                      disabled={busy || !recForm.description.trim() || !recForm.amount || !recForm.dayOfMonth}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-[10px] btn-tool disabled:opacity-40"
                    >
                      {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      Save
                    </button>
                    <button
                      onClick={() => setEditRecId(null)}
                      disabled={busy}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-full"
                    >
                      <X size={11} />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div key={r.id} className="px-4 py-3 lg:py-2.5 flex items-center gap-3 group">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${r.active ? "text-gray-900" : "text-gray-400"}`}>
                      {r.description}
                    </p>
                    <p className="text-xs text-gray-500">
                      {r.active
                        ? `Logs on the ${ordinal(r.dayOfMonth)} · next ${new Date(`${r.nextRunDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                        : "Paused"}
                      {r.category ? ` · ${r.category}` : ""}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 ${r.active ? "text-gray-900" : "text-gray-400"}`}>
                    {money(r.amount)}/mo
                  </span>
                  <span className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => openRecEdit(r)}
                      disabled={busy}
                      className="p-1.5 text-gray-300 hover:text-gray-600 rounded-full lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => toggleRec(r)}
                      disabled={busy}
                      className="p-1.5 text-gray-300 hover:text-gray-600 rounded-full"
                      title={r.active ? "Pause" : "Resume"}
                    >
                      {r.active ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button
                      onClick={() => removeRec(r.id)}
                      disabled={busy}
                      className="p-1.5 text-gray-300 hover:text-red-600 rounded-full"
                      title="Stop repeating"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              )
            )}
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
          className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white rounded-[10px] text-sm font-medium text-gray-700 hover:bg-gray-50"
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
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-[10px] btn-tool disabled:opacity-40"
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
            <div key={e.id} className="px-4 py-3 lg:py-2.5 group">
              {/* Phone row: title + date/category sub-line, amount with
                  always-visible edit/delete on the right */}
              <div className="lg:hidden flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15.5px] font-semibold text-gray-900 truncate">
                    {e.description}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 truncate">
                    {new Date(`${e.incurredAt}T12:00:00`).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {e.category ? ` · ${e.category}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="numeral-ledger text-sm font-semibold text-gray-900">
                    {money(e.amount)}
                  </span>
                  <div className="mt-1 flex items-center gap-1">
                    <button
                      onClick={() => openEdit(e)}
                      disabled={busy}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 active:bg-gray-100 transition-colors"
                      title="Edit expense"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => remove(e.id)}
                      disabled={busy}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 active:bg-red-50 active:text-red-600 transition-colors"
                      title="Delete expense"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
              {/* Desktop row (unchanged) */}
              <div className="hidden lg:flex items-center gap-3">
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
            </div>
            )
          )
        )}
      </div>
    </div>
  );
}
