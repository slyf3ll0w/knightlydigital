"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, Package } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

type RecurringInterval = "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL";
type DepositType = "NONE" | "PERCENT" | "FIXED" | "FULL";

type WorkItem = {
  id: string;
  name: string;
  description: string | null;
  type: "SERVICE" | "PRODUCT";
  unitPrice: number | string;
  unitCost: number | string | null;
  requiresAgreement: boolean;
  durationMinutes: number | null;
  recurringInterval: RecurringInterval | null;
  recurringCreatesJob: boolean;
  recurringInvoiceMode: "SEND" | "DRAFT";
  agreementTemplateId: string | null;
  agreementTiming: "WITH_QUOTE" | "ON_APPROVAL";
  depositType: DepositType;
  depositValue: number | string | null;
};

type Template = { id: string; name: string };

type FormState = {
  name: string;
  description: string;
  type: "SERVICE" | "PRODUCT";
  unitPrice: string;
  unitCost: string;
  durationMinutes: string;
  recurringInterval: "" | RecurringInterval;
  recurringCreatesJob: boolean;
  recurringInvoiceMode: "SEND" | "DRAFT";
  agreementTemplateId: string;
  agreementTiming: "WITH_QUOTE" | "ON_APPROVAL";
  depositType: DepositType;
  depositValue: string;
};

const emptyForm: FormState = {
  name: "",
  description: "",
  type: "SERVICE",
  unitPrice: "",
  unitCost: "",
  durationMinutes: "",
  recurringInterval: "",
  recurringCreatesJob: false,
  recurringInvoiceMode: "SEND",
  agreementTemplateId: "",
  agreementTiming: "ON_APPROVAL",
  depositType: "NONE",
  depositValue: "",
};

const INTERVAL_LABEL: Record<RecurringInterval, string> = {
  MONTHLY: "month",
  QUARTERLY: "quarter",
  SEMIANNUAL: "6 months",
  ANNUAL: "year",
};

function money(n: number | string | null) {
  return `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ProductsClient({
  initialItems,
  templates,
}: {
  initialItems: WorkItem[];
  templates: Template[];
}) {
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
      durationMinutes: item.durationMinutes !== null ? String(item.durationMinutes) : "",
      recurringInterval: item.recurringInterval ?? "",
      recurringCreatesJob: item.recurringCreatesJob,
      recurringInvoiceMode: item.recurringInvoiceMode,
      agreementTemplateId: item.agreementTemplateId ?? "",
      agreementTiming: item.agreementTiming,
      depositType: item.depositType ?? "NONE",
      depositValue: item.depositValue != null ? String(Number(item.depositValue)) : "",
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
      durationMinutes: form.durationMinutes === "" ? null : parseInt(form.durationMinutes, 10) || null,
      recurringInterval: form.recurringInterval || null,
      recurringCreatesJob: form.recurringCreatesJob,
      recurringInvoiceMode: form.recurringInvoiceMode,
      agreementTemplateId: form.agreementTemplateId || null,
      agreementTiming: form.agreementTiming,
      depositType: form.depositType,
      depositValue: form.depositValue === "" ? null : parseFloat(form.depositValue) || 0,
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
      {/* Online booking duration */}
      {form.type === "SERVICE" && (
        <div className="border-t border-green-200/60 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Time on site (online booking)
              </label>
              <select
                value={form.durationMinutes}
                onChange={(e) => set("durationMinutes", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              >
                <option value="">Not bookable online</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
                <option value="180">3 hours</option>
                <option value="240">4 hours</option>
                <option value="360">6 hours</option>
                <option value="480">8 hours</option>
              </select>
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            How long this service takes — the online slot picker uses it to find open times.
          </p>
        </div>
      )}
      {/* Recurring / subscription settings */}
      <div className="border-t border-green-200/60 pt-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Billing</label>
            <select
              value={form.recurringInterval}
              onChange={(e) => set("recurringInterval", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            >
              <option value="">One-time</option>
              <option value="MONTHLY">Recurring — monthly</option>
              <option value="QUARTERLY">Recurring — quarterly</option>
              <option value="SEMIANNUAL">Recurring — every 6 months</option>
              <option value="ANNUAL">Recurring — annually</option>
            </select>
          </div>
          {form.recurringInterval && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Each cycle</label>
              <select
                value={form.recurringInvoiceMode}
                onChange={(e) => set("recurringInvoiceMode", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              >
                <option value="SEND">Auto-send the invoice</option>
                <option value="DRAFT">Create a draft to review</option>
              </select>
            </div>
          )}
        </div>
        {form.recurringInterval && (
          <>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.recurringCreatesJob}
                onChange={(e) => setForm((f) => ({ ...f, recurringCreatesJob: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-gray-700">
                Also create a job each cycle
                <span className="block text-xs text-gray-500">
                  For visit-based work (lawn, pool, pest) — schedules a job alongside the invoice.
                </span>
              </span>
            </label>
            <p className="text-xs text-gray-500">
              {form.recurringInvoiceMode === "SEND"
                ? "When a card is on file (once online payments are live) the client is auto-charged each cycle; until then they get a pay-by-link email."
                : "A draft invoice is created each cycle for you to review and send."}
            </p>
          </>
        )}
      </div>

      {/* Agreement */}
      <div className="border-t border-green-200/60 pt-3 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Attach an agreement
          </label>
          <select
            value={form.agreementTemplateId}
            onChange={(e) => set("agreementTemplateId", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          >
            <option value="">No agreement required</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {templates.length === 0 && (
            <p className="mt-1 text-xs text-gray-400">
              Create reusable agreements in Settings → Agreements first.
            </p>
          )}
        </div>
        {form.agreementTemplateId && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Send the agreement</label>
            <select
              value={form.agreementTiming}
              onChange={(e) => set("agreementTiming", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            >
              <option value="ON_APPROVAL">When the quote is approved</option>
              <option value="WITH_QUOTE">As soon as the quote is sent</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Quotes with this service can&apos;t convert to a job until the client signs.
            </p>
          </div>
        )}
      </div>
      {/* Deposit */}
      <div className="border-t border-green-200/60 pt-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Deposit</label>
            <select
              value={form.depositType}
              onChange={(e) => set("depositType", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            >
              <option value="NONE">Use company default</option>
              <option value="PERCENT">Percentage of price</option>
              <option value="FIXED">Fixed amount</option>
              <option value="FULL">Full payment upfront</option>
            </select>
          </div>
          {(form.depositType === "PERCENT" || form.depositType === "FIXED") && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {form.depositType === "PERCENT" ? "Percent (0–100)" : "Amount ($)"}
              </label>
              <input
                type="number"
                min="0"
                step={form.depositType === "PERCENT" ? "1" : "0.01"}
                max={form.depositType === "PERCENT" ? "100" : undefined}
                value={form.depositValue}
                onChange={(e) => set("depositValue", e.target.value)}
                placeholder={form.depositType === "PERCENT" ? "25" : "100.00"}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              />
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500">
          {form.depositType === "NONE"
            ? "Falls back to your company-wide default deposit (Settings → Company)."
            : form.depositType === "FULL"
              ? "The whole price is collected up front when the client approves the quote."
              : "Collected as a deposit invoice when the client approves a quote containing this service."}
        </p>
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
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Products &amp; Services</h1>
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

        <div className="card-ledger overflow-hidden">
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
                      <p className="text-sm font-medium text-gray-900">
                        {item.name}
                        {item.recurringInterval && (
                          <span className="ml-2 stamp border-green-600/30 bg-green-600/[0.06] text-green-700">
                            Recurring · {INTERVAL_LABEL[item.recurringInterval]}
                          </span>
                        )}
                        {item.requiresAgreement && (
                          <span className="ml-2 stamp border-blue-600/30 bg-blue-600/[0.06] text-blue-700">
                            Agreement
                          </span>
                        )}
                        {item.durationMinutes !== null && (
                          <span className="ml-2 stamp border-purple-600/30 bg-purple-600/[0.06] text-purple-700">
                            Bookable ·{" "}
                            {item.durationMinutes % 60 === 0
                              ? `${item.durationMinutes / 60}h`
                              : `${item.durationMinutes}m`}
                          </span>
                        )}
                        {item.depositType && item.depositType !== "NONE" && (
                          <span className="ml-2 stamp border-amber-600/30 bg-amber-600/[0.06] text-amber-700">
                            {item.depositType === "FULL"
                              ? "Paid upfront"
                              : item.depositType === "PERCENT"
                                ? `Deposit ${Number(item.depositValue ?? 0)}%`
                                : `Deposit ${money(item.depositValue)}`}
                          </span>
                        )}
                      </p>
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
