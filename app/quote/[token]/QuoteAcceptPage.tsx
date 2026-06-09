"use client";

import { useState } from "react";
import { CheckCircle, X, Loader2 } from "lucide-react";

type Quote = {
  id: string; quoteNumber: number; status: string;
  subtotal: number; tax: number | null; total: number;
  notes: string | null; validUntil: string | null;
  contact: { firstName: string; lastName: string } | null;
  company: { name: string };
  lineItems: { id: string; description: string; quantity: number; unitPrice: number; total: number }[];
};

export default function QuoteAcceptPage({ quote }: { quote: Quote }) {
  const [loading, setLoading] = useState<"accept" | "decline" | null>(null);
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState("");

  if (quote.status === "ACCEPTED" || result === "accepted") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white rounded-lg border border-gray-200 p-8 text-center shadow-sm">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Quote accepted!</h1>
          <p className="text-gray-500 text-sm">
            {quote.company.name} will be in touch to schedule your appointment.
          </p>
        </div>
      </div>
    );
  }

  if (quote.status === "DECLINED" || result === "declined") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white rounded-lg border border-gray-200 p-8 text-center shadow-sm">
          <p className="text-gray-500 text-sm">This quote has been declined.</p>
        </div>
      </div>
    );
  }

  async function respond(action: "accept" | "decline") {
    setError("");
    setLoading(action);

    const res = await fetch(`/api/public/quote/${quote.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    setLoading(null);

    if (!res.ok) {
      setError("Something went wrong. Please try again.");
      return;
    }

    setResult(action === "accept" ? "accepted" : "declined");
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <div className="flex justify-between items-start mb-5">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">QUOTE</h1>
              <p className="text-gray-500 text-sm">#{quote.quoteNumber}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-800">{quote.company.name}</p>
              {quote.contact && (
                <p className="text-sm text-gray-500">
                  {quote.contact.firstName} {quote.contact.lastName}
                </p>
              )}
            </div>
          </div>

          {quote.validUntil && (
            <p className="text-xs text-amber-600 mb-4">
              Valid until {new Date(quote.validUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}

          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-xs text-gray-500 font-semibold uppercase">Description</th>
                <th className="text-right py-2 text-xs text-gray-500 font-semibold uppercase w-16">Qty</th>
                <th className="text-right py-2 text-xs text-gray-500 font-semibold uppercase w-24">Price</th>
                <th className="text-right py-2 text-xs text-gray-500 font-semibold uppercase w-24">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {quote.lineItems.map((li) => (
                <tr key={li.id}>
                  <td className="py-3 text-gray-800">{li.description}</td>
                  <td className="py-3 text-right text-gray-600">{Number(li.quantity)}</td>
                  <td className="py-3 text-right text-gray-600">${Number(li.unitPrice).toFixed(2)}</td>
                  <td className="py-3 text-right font-medium">${Number(li.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ml-auto w-56 border-t border-gray-100 pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span>${Number(quote.subtotal).toFixed(2)}</span>
            </div>
            {quote.tax && (
              <div className="flex justify-between">
                <span className="text-gray-500">Tax</span>
                <span>${Number(quote.tax).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1.5">
              <span>Total</span>
              <span>${Number(quote.total).toFixed(2)}</span>
            </div>
          </div>

          {quote.notes && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}

          {error && (
            <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => respond("accept")}
              disabled={!!loading}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold text-sm rounded transition-colors disabled:opacity-50"
            >
              {loading === "accept" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Accept Quote
            </button>
            <button
              onClick={() => respond("decline")}
              disabled={!!loading}
              className="px-5 py-3 border border-gray-300 text-sm font-medium text-gray-600 rounded hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading === "decline" ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
              Decline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
