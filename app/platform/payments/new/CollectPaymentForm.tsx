"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, CreditCard } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

type OutstandingInvoice = {
  id: string;
  invoiceNumber: number;
  subject: string | null;
  status: string;
  dueDate: string | null;
  contactName: string;
  total: number;
  balance: number;
};

const methods = [
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "CARD", label: "Credit/debit card" },
  { value: "ACH", label: "Bank payment (ACH)" },
  { value: "CASH_APP", label: "Cash App" },
  { value: "PAYPAL", label: "PayPal" },
  { value: "VENMO", label: "Venmo" },
  { value: "ZELLE", label: "Zelle" },
  { value: "OTHER", label: "Other" },
];

function money(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CollectPaymentForm({
  invoices,
  preselectedInvoiceId,
}: {
  invoices: OutstandingInvoice[];
  preselectedInvoiceId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const initial = invoices.find((i) => i.id === preselectedInvoiceId) ?? invoices[0] ?? null;
  const [invoiceId, setInvoiceId] = useState(initial?.id ?? "");
  const selected = invoices.find((i) => i.id === invoiceId) ?? null;

  const [amount, setAmount] = useState(initial ? String(initial.balance.toFixed(2)) : "");
  const [method, setMethod] = useState("CASH");
  // Local date, not toISOString() — UTC rolls to tomorrow for evening entries
  const [paidAt, setPaidAt] = useState(new Date().toLocaleDateString("en-CA"));
  const [referenceNumber, setReferenceNumber] = useState("");
  const [details, setDetails] = useState("");

  function selectInvoice(id: string) {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    if (inv) setAmount(String(inv.balance.toFixed(2)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceId) {
      setError("Select an invoice to apply this payment to.");
      return;
    }
    setError("");
    setLoading(true);

    const { ok, data } = await postJson("/api/app/payments", {
      invoiceId,
      amount: parseFloat(amount) || 0,
      method,
      paidAt,
      referenceNumber: referenceNumber || null,
      details: details || null,
    });

    setLoading(false);

    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }

    router.push(`/app/invoices/${invoiceId}`);
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/invoices" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Collect Payment</h1>
          {selected && (
            <p className="text-sm text-gray-500">
              {selected.contactName} — balance {money(selected.balance)}
            </p>
          )}
        </div>
      </div>

      {/* Card processing teaser: ready for the processor, disabled until live */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg mb-6 text-sm text-gray-600">
        <CreditCard size={16} className="text-gray-400 shrink-0" />
        <p>
          Instant card and bank payments are coming soon — clients will be able to pay online with
          one click. Until then, record payments you&apos;ve collected here.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Payment details */}
        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Payment details
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  $
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0.01"
                  step="0.01"
                  required
                  className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment method *
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {methods.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transaction date
              </label>
              <input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reference #</label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Check #, confirmation #..."
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Details</label>
            <input
              type="text"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Optional note about this payment"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {/* Outstanding invoices */}
        <div className="card-ledger overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Outstanding invoices
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Select the invoice you&apos;re applying this payment to.
            </p>
          </div>
          {invoices.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">
              No outstanding invoices. <Link href="/app/invoices/new" className="text-green-600 hover:underline">Create an invoice</Link> first.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              <div className="hidden lg:grid grid-cols-[28px_1fr_120px_90px_90px] gap-3 px-5 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
                <span></span>
                <span>Invoice</span>
                <span>Due date</span>
                <span className="text-right">Total</span>
                <span className="text-right">Balance</span>
              </div>
              {invoices.map((inv) => (
                <label
                  key={inv.id}
                  className={`grid grid-cols-[28px_1fr_120px_90px_90px] gap-3 items-center px-5 py-3 cursor-pointer transition-colors ${
                    invoiceId === inv.id ? "bg-green-50" : "hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="invoice"
                    checked={invoiceId === inv.id}
                    onChange={() => selectInvoice(inv.id)}
                    className="text-green-600 focus:ring-green-500"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      #{inv.invoiceNumber}
                      {inv.subject ? ` — ${inv.subject}` : ""}
                    </p>
                    <p className="text-xs text-gray-500">{inv.contactName}</p>
                  </div>
                  <span className="hidden lg:block text-sm text-gray-500">
                    {inv.dueDate
                      ? new Date(inv.dueDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                  <span className="hidden lg:block text-sm text-gray-700 text-right">
                    {money(inv.total)}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 text-right">
                    {money(inv.balance)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !invoiceId}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Save Payment
          </button>
          <Link
            href="/app/invoices"
            className="px-5 py-2.5 btn-tool-line bg-white text-sm font-medium text-gray-600 rounded-[10px] hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
