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
  unitCost: string; // hidden; filled from the price book for margin tracking
  isOptional: boolean;
};

const emptyLine: LineItem = {
  name: "",
  description: "",
  quantity: "1",
  unitPrice: "",
  unitCost: "",
  isOptional: false,
};

export default function QuoteEditor({
  contacts,
  workItems = [],
  prefilledContactId = "",
  requestId = "",
  requestTitle = "",
}: {
  contacts: Contact[];
  workItems?: PickerWorkItem[];
  prefilledContactId?: string;
  requestId?: string;
  requestTitle?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contactId, setContactId] = useState(prefilledContactId);
  const [title, setTitle] = useState(requestTitle);
  const [taxRate, setTaxRate] = useState("");
  const [depositType, setDepositType] = useState<"NONE" | "PERCENT" | "FIXED">("NONE");
  const [depositValue, setDepositValue] = useState("");
  const [clientMessage, setClientMessage] = useState("");
  const [disclaimer, setDisclaimer] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ ...emptyLine }]);

  function addLine() {
    setLineItems((l) => [...l, { ...emptyLine }]);
  }

  function removeLine(i: number) {
    setLineItems((l) => l.filter((_, idx) => idx !== i));
  }

  function updateLine(i: number, field: keyof LineItem, value: string | boolean) {
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
              unitCost: item.unitCost !== null ? String(Number(item.unitCost)) : "",
            }
          : li
      )
    );
  }

  // Optional items count toward the total by default (client can opt out in the hub)
  const subtotal = lineItems.reduce((sum, li) => {
    const qty = parseFloat(li.quantity) || 0;
    const price = parseFloat(li.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  const tax = taxRate ? subtotal * (parseFloat(taxRate) / 100) : 0;
  const total = subtotal + tax;
  const deposit =
    depositType === "PERCENT"
      ? total * ((parseFloat(depositValue) || 0) / 100)
      : depositType === "FIXED"
        ? Math.min(parseFloat(depositValue) || 0, total)
        : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactId) {
      setError("Please select a client.");
      return;
    }
    setError("");
    setLoading(true);

    const { ok, data } = await postJson<{ id: string }>("/api/app/quotes", {
      contactId,
      requestId: requestId || null,
      title: title || null,
      taxRate: taxRate ? parseFloat(taxRate) / 100 : null,
      depositType,
      depositValue: depositValue ? parseFloat(depositValue) || 0 : null,
      clientMessage: clientMessage || null,
      disclaimer: disclaimer || null,
      lineItems: lineItems.map((li, i) => ({
        name: li.name,
        description: li.description,
        quantity: parseFloat(li.quantity) || 1,
        unitPrice: parseFloat(li.unitPrice) || 0,
        unitCost: li.unitCost === "" ? null : parseFloat(li.unitCost) || 0,
        isOptional: li.isOptional,
        sortOrder: i,
      })),
    });

    setLoading(false);

    if (!ok || !data?.id) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }

    router.push(`/app/quotes/${data.id}`);
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/quotes" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">New Quote</h1>
        {requestId && (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-700">
            From request
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              required
              className="w-full max-w-xs px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Select a client...</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g. Pressure Washing Services"
            />
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Product / Service
            </h2>
          </div>
          <div className="p-5">
            <div className="space-y-4">
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
                      min="0"
                      step="0.001"
                      className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 sm:order-2"
                    />
                    <input
                      type="number"
                      placeholder="Unit price"
                      value={li.unitPrice}
                      onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                      min="0"
                      step="0.01"
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
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer w-fit">
                    <input
                      type="checkbox"
                      checked={li.isOptional}
                      onChange={(e) => updateLine(i, "isOptional", e.target.checked)}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    Mark as optional — client can remove this item when approving
                  </label>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLine}
              className="mt-3 flex items-center gap-1 text-sm text-green-600 hover:underline font-medium"
            >
              <Plus size={13} />
              Add line item
            </button>
          </div>

          {/* Totals + deposit */}
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Tax rate</label>
                <input
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="0"
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
              <div className="text-right space-y-1 text-sm">
                <div className="flex justify-between gap-8">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>
                {tax > 0 && (
                  <div className="flex justify-between gap-8">
                    <span className="text-gray-500">Tax</span>
                    <span className="font-medium">${tax.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-8 font-bold text-base border-t border-gray-200 pt-1">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
                {deposit > 0 && (
                  <div className="flex justify-between gap-8 text-green-700">
                    <span>Required deposit</span>
                    <span className="font-semibold">${deposit.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Deposit */}
            <div className="border-t border-gray-200 pt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Required deposit</p>
              <p className="text-xs text-gray-500 mb-2">
                Collect an upfront payment when the client approves this quote.
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={depositType}
                  onChange={(e) => setDepositType(e.target.value as "NONE" | "PERCENT" | "FIXED")}
                  className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="NONE">No deposit</option>
                  <option value="PERCENT">Percent of total</option>
                  <option value="FIXED">Fixed amount</option>
                </select>
                {depositType !== "NONE" && (
                  <div className="flex items-center gap-1.5">
                    {depositType === "FIXED" && <span className="text-sm text-gray-500">$</span>}
                    <input
                      type="number"
                      value={depositValue}
                      onChange={(e) => setDepositValue(e.target.value)}
                      min="0"
                      step={depositType === "PERCENT" ? "1" : "0.01"}
                      placeholder={depositType === "PERCENT" ? "25" : "100.00"}
                      className="w-28 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    {depositType === "PERCENT" && <span className="text-sm text-gray-500">%</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Client message</label>
          <textarea
            value={clientMessage}
            onChange={(e) => setClientMessage(e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            placeholder="A message the client sees at the top of the quote..."
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Contract / disclaimer
          </label>
          <textarea
            value={disclaimer}
            onChange={(e) => setDisclaimer(e.target.value)}
            rows={4}
            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            placeholder="Terms and conditions the client agrees to when approving..."
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Save Quote
          </button>
          <Link
            href="/app/quotes"
            className="px-5 py-2.5 border border-gray-300 text-sm font-medium text-gray-600 rounded hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
