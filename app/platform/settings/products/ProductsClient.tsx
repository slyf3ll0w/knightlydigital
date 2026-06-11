"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, Package } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

type WorkItem = {
  id: string;
  name: string;
  description: string | null;
  type: "SERVICE" | "PRODUCT";
  unitPrice: number | string;
  unitCost: number | string | null;
};

type FormState = {
  name: string;
  description: string;
  type: "SERVICE" | "PRODUCT";
  unitPrice: string;
  unitCost: string;
};

const emptyForm: FormState = {
  name: "",
  description: "",
  type: "SERVICE",
  unitPrice: "",
  unitCost: "",
};

function money(n: number | string | null) {
  return `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ProductsClient({ initialItems }: { initialItems: WorkItem[] }) {
  const [items, setItems] = useState<WorkItem[]>(initialItems);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function startNew() {
    setForm(emptyForm);
    setEditingId("new");
    setError("");
  }

  function startEdit(item: WorkItem) {
    setForm({
      name: item.name,
      description: item.description ?? "",
      type: item.type,
      unitPrice: String(Number(item.unitPrice)),
      unitCost: item.unitCost !== null ? String(Number(item.unitCost)) : "",
    });
    setEditingId(item.id);
    setError("");
  }

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setError("");
    setLoading(true);

    const payload = {
      name: form.name,
      description: form.description,
      type: form.type,
      unitPrice: parseFloat(form.unitPrice) || 0,
      unitCost: form.unitCost === "" ? null : parseFloat(form.unitCost) || 0,
    };

    const { ok, data } =
      editingId === "new"
        ? await postJson<WorkItem>("/api/app/work-items", payload)
        : await postJson<WorkItem>(`/api/app/work-items/${editingId}`, payload, "PATCH");

    setLoading(false);
    if (!ok || !data) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }

    setItems((list) => {
      const next = editingId === "new" ? [...list, data] : list.map((i) => (i.id === data.id ? data : i));
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setEditingId(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this item from your price book?")) return;
    const { ok } = await postJson(`/api/app/work-items/${id}`, undefined, "DELETE");
    if (ok) setItems((list) => list.filter((i) => i.id !== id));
  }

  const editorRow = (
    <div className="border border-green-200 bg-green-50/40 rounded-lg p-4 space-y-3">
      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px_110px_110px] gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. House Washing"
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
          <select
            value={form.type}
            onChange={(e) => set("type", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          >
            <option value="SERVICE">Service</option>
            <option value="PRODUCT">Product</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Unit price</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.unitPrice}
            onChange={(e) => set("unitPrice", e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Unit cost</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.unitCost}
            onChange={(e) => set("unitCost", e.target.value)}
            placeholder="Optional"
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Shown on quotes and invoices"
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
        >
          {loading && <Loader2 size={13} className="animate-spin" />}
          {editingId === "new" ? "Add Item" : "Save Changes"}
        </button>
        <button
          onClick={() => setEditingId(null)}
          className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-600 rounded hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/app/settings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Products &amp; Services</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6 ml-8">
        Your price book. These items autocomplete on quotes and invoices.
      </p>

      <div className="flex justify-end mb-4">
        {editingId !== "new" && (
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
          >
            <Plus size={15} />
            Add Item
          </button>
        )}
      </div>

      <div className="space-y-3">
        {editingId === "new" && editorRow}

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {items.length === 0 && editingId !== "new" ? (
            <div className="py-16 text-center">
              <Package size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-4">Your price book is empty.</p>
              <button
                onClick={startNew}
                className="inline-flex items-center gap-1 text-sm text-green-600 hover:underline font-medium"
              >
                <Plus size={13} />
                Add your first item
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              <div className="hidden sm:grid grid-cols-[1fr_90px_100px_100px_70px] gap-4 px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
                <span>Name</span>
                <span>Type</span>
                <span className="text-right">Price</span>
                <span className="text-right">Cost</span>
                <span></span>
              </div>
              {items.map((item) =>
                editingId === item.id ? (
                  <div key={item.id} className="p-3">
                    {editorRow}
                  </div>
                ) : (
                  <div
                    key={item.id}
                    className="grid sm:grid-cols-[1fr_90px_100px_100px_70px] gap-2 sm:gap-4 items-center px-5 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-gray-500 truncate">{item.description}</p>
                      )}
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600 w-fit">
                      {item.type === "SERVICE" ? "Service" : "Product"}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 sm:text-right">
                      {money(item.unitPrice)}
                    </span>
                    <span className="text-sm text-gray-500 sm:text-right">
                      {item.unitCost !== null ? money(item.unitCost) : "—"}
                    </span>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => startEdit(item)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => remove(item.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
