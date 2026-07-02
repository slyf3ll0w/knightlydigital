"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Trash2, ArrowLeft } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import WorkItemPicker, { type PickerWorkItem } from "@/components/WorkItemPicker";

type Contact = { id: string; firstName: string; lastName: string };
type LineItem = {
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
  workItemId?: string;
  recurringInterval?: string | null;
  serviceDate?: string | null; // preserved through edits, not editable here
};
// Present when editing an existing invoice — switches submit to PATCH
type EditInvoice = {
  id: string;
  subject: string;
  notes: string;
  taxRatePercent: string; // "8.25", not 0.0825
  discountType: "NONE" | "PERCENT" | "FIXED";
  discountValue: string;
  dueDate: string; // yyyy-mm-dd or ""
  depositApplied: number;
  contactName: string;
  lineItems: {
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
    workItemId?: string | null;
    recurringInterval?: string | null;
    serviceDate?: string | null;
  }[];
};
type PrefillJob = {
  id: string;
  title: string;
  contactId: string;
  contact: Contact;
  lineItems?: { name: string; description: string | null; quantity: number; unitPrice: number }[];
  quote?: {
    lineItems: { name: string; description: string; quantity: number; unitPrice: number }[];
    discountType?: string;
    discountValue?: number | null;
  } | null;
};

export default function InvoiceEditor({
  contacts,
  workItems = [],
  prefillJob,
  prefilledContactId = "",
  editInvoice = null,
}: {
  contacts: Contact[];
  workItems?: PickerWorkItem[];
  prefillJob: PrefillJob | null;
  prefilledContactId?: string;
  editInvoice?: EditInvoice | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Prefer the job's own line items; fall back to its quote's items
  const sourceLines =
    prefillJob?.lineItems?.length
      ? prefillJob.lineItems
      : prefillJob?.quote?.lineItems?.length
        ? prefillJob.quote.lineItems
        : null;
  const initLines: LineItem[] = editInvoice
    ? editInvoice.lineItems.map((li) => ({
        name: li.name ?? "",
        description: li.description ?? "",
        quantity: String(li.quantity),
        unitPrice: String(li.unitPrice),
        workItemId: li.workItemId ?? undefined,
        recurringInterval: li.recurringInterval ?? null,
        serviceDate: li.serviceDate ?? null,
      }))
    : sourceLines?.map((li) => ({
        name: li.name ?? "",
        description: li.description ?? "",
        quantity: String(li.quantity),
        unitPrice: String(li.unitPrice),
      })) ?? [{ name: "", description: "", quantity: "1", unitPrice: "" }];

  const [contactId, setContactId] = useState(prefillJob?.contactId ?? prefilledContactId);
  const [jobId] = useState(prefillJob?.id ?? "");
  const [subject, setSubject] = useState(editInvoice?.subject ?? prefillJob?.title ?? "");
  const [notes, setNotes] = useState(editInvoice?.notes ?? "");
  const [taxRate, setTaxRate] = useState(editInvoice?.taxRatePercent ?? "");
  // Quote discounts carry over when invoicing a quoted job
  const quoteDiscount = prefillJob?.quote;
  const [discountType, setDiscountType] = useState<"NONE" | "PERCENT" | "FIXED">(
    editInvoice
      ? editInvoice.discountType
      : quoteDiscount?.discountType === "PERCENT" || quoteDiscount?.discountType === "FIXED"
        ? quoteDiscount.discountType
        : "NONE"
  );
  const [discountValue, setDiscountValue] = useState(
    editInvoice
      ? editInvoice.discountValue
      : quoteDiscount?.discountValue != null && quoteDiscount.discountValue > 0
        ? String(Number(quoteDiscount.discountValue))
        : ""
  );
  const [dueDate, setDueDate] = useState(editInvoice?.dueDate ?? "");
  const [lineItems, setLineItems] = useState<LineItem[]>(initLines);
  const depositApplied = editInvoice?.depositApplied ?? 0;
  const backHref = editInvoice ? `/app/invoices/${editInvoice.id}` : "/app/invoices";

  function addLine() {
    setLineItems((l) => [...l, { name: "", description: "", quantity: "1", unitPrice: "" }]);
  }
  function removeLine(i: number) {
    setLineItems((l) => l.filter((_, idx) => idx !== i));
  }
  function updateLine(i: number, field: keyof LineItem, value: string) {
    setLineItems((l) => l.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  }

  function applyWorkItem(i: number, item: PickerWorkItem) {
    setLineItems((l) =>
      l.map((li, idx) =>
        idx === i
          ? {
              ...li,
              name: item.name,
              description: item.description ?? li.description,
              unitPrice: String(Number(item.unitPrice)),
              workItemId: item.id,
              recurringInterval: item.recurringInterval ?? null,
            }
          : li
      )
    );
  }

  const subtotal = lineItems.reduce((sum, li) => {
    return sum + (parseFloat(li.quantity) || 0) * (parseFloat(li.unitPrice) || 0);
  }, 0);
  const discountNum = parseFloat(discountValue) || 0;
  const discount =
    discountType === "PERCENT"
      ? Math.round(subtotal * Math.min(Math.max(discountNum, 0), 100)) / 100
      : discountType === "FIXED"
        ? Math.min(Math.max(discountNum, 0), subtotal)
        : 0;
  const tax = taxRate ? (subtotal - discount) * (parseFloat(taxRate) / 100) : 0;
  const grossTotal = subtotal - discount + tax;
  const total = Math.max(0, grossTotal - Math.min(depositApplied, grossTotal));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editInvoice && !contactId) { setError("Please select a customer."); return; }
    setError(""); setLoading(true);

    const payload = {
      subject: subject || null,
      notes,
      taxRate: taxRate ? parseFloat(taxRate) / 100 : null,
      discountType,
      discountValue: discountNum || null,
      dueDate: dueDate || null,
      lineItems: lineItems.map((li, i) => ({
        name: li.name,
        description: li.description,
        quantity: parseFloat(li.quantity) || 1,
        unitPrice: parseFloat(li.unitPrice) || 0,
        workItemId: li.workItemId || null,
        recurringInterval: li.recurringInterval ?? null,
        serviceDate: li.serviceDate ?? undefined,
        sortOrder: i,
      })),
    };

    if (editInvoice) {
      const { ok, data } = await postJson(`/api/app/invoices/${editInvoice.id}`, payload, "PATCH");
      setLoading(false);
      if (!ok) { setError(data?.error ?? GENERIC_ERROR); return; }
      router.push(`/app/invoices/${editInvoice.id}`);
      router.refresh();
      return;
    }

    const { ok, data } = await postJson<{ id: string }>("/api/app/invoices", {
      contactId,
      jobId: jobId || null,
      ...payload,
    });

    setLoading(false);
    if (!ok || !data?.id) { setError(data?.error ?? GENERIC_ERROR); return; }
    router.push(`/app/invoices/${data.id}`);
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">
          {editInvoice ? "Edit Invoice" : "New Invoice"}
        </h1>
      </div>

      {prefillJob && (
        <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
          Creating invoice for job: <strong>{prefillJob.title}</strong>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="card-ledger p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Pressure Washing Services"
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
              {editInvoice ? (
                <p className="px-3 py-2.5 border border-gray-200 bg-gray-50 rounded text-sm text-gray-700">
                  {editInvoice.contactName || "—"}
                </p>
              ) : (
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select...</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="card-ledger overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Line Items</h2>
          </div>
          <div className="p-5">
            <div className="space-y-3">
              {lineItems.map((li, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
                  {/* Phone: name + delete on row 1, qty/price on row 2; sm+: one row */}
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] sm:grid-cols-[minmax(0,1fr)_70px_110px_32px] gap-2 items-start">
                    <div className="col-span-2 sm:col-span-1 min-w-0 sm:order-1">
                      <WorkItemPicker
                        value={li.name}
                        items={workItems}
                        onChange={(text) => updateLine(i, "name", text)}
                        onSelect={(item) => applyWorkItem(i, item)}
                        required
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={lineItems.length === 1}
                      className="p-2 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-0 sm:order-4"
                    >
                      <Trash2 size={14} />
                    </button>
                    <input
                      type="number"
                      placeholder="Qty"
                      value={li.quantity}
                      onChange={(e) => updateLine(i, "quantity", e.target.value)}
                      min="0" step="0.001"
                      className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 sm:order-2"
                    />
                    <input
                      type="number"
                      placeholder="Unit price"
                      value={li.unitPrice}
                      onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                      min="0" step="0.01"
                      className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 sm:order-3"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Description"
                    value={li.description}
                    onChange={(e) => updateLine(i, "description", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              ))}
            </div>
            <button type="button" onClick={addLine}
              className="mt-3 flex items-center gap-1 text-sm text-green-600 hover:underline font-medium">
              <Plus size={13} /> Add line item
            </button>
          </div>
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Tax</label>
                  <input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)}
                    min="0" max="100" step="0.1" placeholder="0"
                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Discount</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as "NONE" | "PERCENT" | "FIXED")}
                    className="px-2 py-1 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="NONE">None</option>
                    <option value="PERCENT">%</option>
                    <option value="FIXED">$</option>
                  </select>
                  {discountType !== "NONE" && (
                    <input type="number" value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      min="0" step="0.01" placeholder="0"
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  )}
                </div>
              </div>
              <div className="text-right space-y-1 text-sm">
                <div className="flex justify-between gap-8">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between gap-8 text-green-700">
                    <span>Discount{discountType === "PERCENT" ? ` (${discountNum}%)` : ""}</span>
                    <span className="font-medium">-${discount.toFixed(2)}</span>
                  </div>
                )}
                {tax > 0 && (
                  <div className="flex justify-between gap-8">
                    <span className="text-gray-500">Tax</span>
                    <span className="font-medium">${tax.toFixed(2)}</span>
                  </div>
                )}
                {depositApplied > 0 && (
                  <div className="flex justify-between gap-8 text-green-700">
                    <span>Deposit applied</span>
                    <span className="font-medium">
                      -${Math.min(depositApplied, grossTotal).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-8 font-bold text-base border-t border-gray-200 pt-1">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card-ledger p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            placeholder="Payment terms, thank you note, etc." />
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50">
            {loading && <Loader2 size={14} className="animate-spin" />}
            {editInvoice ? "Save Changes" : "Save Invoice"}
          </button>
          <Link href={backHref}
            className="px-5 py-2.5 border border-gray-300 text-sm font-medium text-gray-600 rounded hover:bg-gray-50">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
