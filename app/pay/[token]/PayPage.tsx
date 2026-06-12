"use client";

import { useState } from "react";
import { CreditCard, Building2, Loader2, CheckCircle, Lock } from "lucide-react";
import { brandHeader, brandAccent, textOn } from "@/lib/branding";

type LineItem = { id: string; name?: string; description: string; quantity: number; unitPrice: number; total: number };
type Invoice = {
  id: string; invoiceNumber: number; status: string; publicToken: string;
  subtotal: number; discount: number | null; tax: number | null; surcharge: number | null; total: number;
  notes: string | null; dueDate: string | null;
  contact: { firstName: string; lastName: string; email: string | null } | null;
  company: {
    name: string; phone: string | null; email: string | null;
    logoUrl: string | null; brandColor: string | null;
    surchargeEnabled: boolean; surchargeRate: number | null;
  };
  lineItems: LineItem[];
};

export default function PayPage({ invoice }: { invoice: Invoice }) {
  const [method, setMethod] = useState<"CARD" | "ACH">("CARD");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const surchargeRate = invoice.company.surchargeEnabled
    ? Number(invoice.company.surchargeRate) || 0.03
    : 0;

  const baseTotal = Number(invoice.total);
  const surcharge = method === "CARD" && invoice.company.surchargeEnabled
    ? Math.round(baseTotal * surchargeRate * 100) / 100
    : 0;
  const chargeTotal = baseTotal + surcharge;

  if (invoice.status === "PAID" || done) {
    return (
      <div className="app-ui min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full card-ledger p-8 text-center shadow-sm">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Payment received!</h1>
          <p className="text-gray-500 text-sm">
            Thank you. Invoice #{invoice.invoiceNumber} is paid in full.
          </p>
        </div>
      </div>
    );
  }

  async function handlePay() {
    setError("");
    setLoading(true);

    const res = await fetch(`/api/public/pay/${invoice.publicToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      if (res.status === 503) {
        const contactBits = [invoice.company.phone, invoice.company.email]
          .filter(Boolean)
          .join(" or ");
        setError(
          `Online payments are coming soon. Please contact ${invoice.company.name}${contactBits ? ` at ${contactBits}` : ""} to arrange payment.`
        );
      } else {
        setError(data.error ?? "Payment failed. Please try again.");
      }
      return;
    }

    setDone(true);
  }

  return (
    <div className="app-ui min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Company + invoice header */}
        <div className="card-ledger shadow-sm overflow-hidden">
          <div
            className="px-5 py-4 flex items-center gap-3"
            style={{ backgroundColor: brandHeader(invoice.company) }}
          >
            {invoice.company.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={invoice.company.logoUrl}
                alt={`${invoice.company.name} logo`}
                className="h-16 w-auto max-w-[260px] object-contain shrink-0"
              />
            )}
            <p
              className="font-bold text-lg"
              style={{ color: textOn(brandHeader(invoice.company)) }}
            >
              {invoice.company.name}
            </p>
          </div>
          <div className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Invoice #{invoice.invoiceNumber}</p>
            </div>
            <div className="text-right">
              {invoice.contact && (
                <p className="text-sm text-gray-600">
                  {invoice.contact.firstName} {invoice.contact.lastName}
                </p>
              )}
              {invoice.dueDate && (
                <p className="text-xs text-gray-400">
                  Due {new Date(invoice.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              )}
            </div>
          </div>

          {/* Line items */}
          <div className="mt-4 border-t border-gray-100 pt-4 space-y-2">
            {invoice.lineItems.map((li) => (
              <div key={li.id} className="flex justify-between text-sm">
                <span className="text-gray-700">{li.name || li.description}</span>
                <span className="font-medium text-gray-900">${Number(li.total).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-4 border-t border-gray-100 pt-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span>${Number(invoice.subtotal).toFixed(2)}</span>
            </div>
            {invoice.discount && Number(invoice.discount) > 0 && (
              <div className="flex justify-between text-sm text-green-700">
                <span>Discount</span>
                <span>-${Number(invoice.discount).toFixed(2)}</span>
              </div>
            )}
            {invoice.tax && Number(invoice.tax) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tax</span>
                <span>${Number(invoice.tax).toFixed(2)}</span>
              </div>
            )}
            {surcharge > 0 && (
              <div className="flex justify-between text-sm text-amber-600">
                <span>Card surcharge ({(surchargeRate * 100).toFixed(1)}%)</span>
                <span>${surcharge.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1.5">
              <span>Total due</span>
              <span>${chargeTotal.toFixed(2)}</span>
            </div>
          </div>
          </div>
        </div>

        {/* Payment method */}
        <div className="card-ledger p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Payment method</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              type="button"
              onClick={() => setMethod("CARD")}
              className={`flex items-center gap-2 px-4 py-3 border rounded text-sm font-medium transition-colors ${
                method === "CARD"
                  ? "border-green-500 bg-green-50 text-green-700"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <CreditCard size={15} />
              Credit / Debit
            </button>
            <button
              type="button"
              onClick={() => setMethod("ACH")}
              className={`flex items-center gap-2 px-4 py-3 border rounded text-sm font-medium transition-colors ${
                method === "ACH"
                  ? "border-green-500 bg-green-50 text-green-700"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Building2 size={15} />
              Bank (ACH)
            </button>
          </div>

          {method === "CARD" && invoice.company.surchargeEnabled && (
            <p className="text-xs text-amber-600 mb-4 bg-amber-50 px-3 py-2 rounded">
              A {(surchargeRate * 100).toFixed(1)}% card surcharge applies. Pay via bank transfer to avoid this fee.
            </p>
          )}

          {error && (
            <div className="mb-3 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
          )}

          {/* In a real integration, mount Stripe Elements or similar here */}
          <div className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded text-center mb-4">
            <p className="text-xs text-gray-400">
              Payment form — connect your processor here
              <br />
              <span className="text-gray-300">(Stripe, Square, Finix, etc.)</span>
            </p>
          </div>

          <button
            onClick={handlePay}
            disabled={loading}
            className="w-full py-3 font-semibold text-sm rounded transition-opacity hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50"
            style={{
              backgroundColor: brandAccent(invoice.company),
              color: textOn(brandAccent(invoice.company)),
            }}
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Lock size={14} />
            )}
            Pay ${chargeTotal.toFixed(2)}
          </button>

          <div className="flex items-center justify-center gap-1 mt-3 text-xs text-gray-400">
            <Lock size={11} />
            Secure payment
          </div>
        </div>
      </div>
    </div>
  );
}
