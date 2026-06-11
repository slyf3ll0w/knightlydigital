"use client";

import { useState } from "react";
import { CheckCircle, Loader2, MessageSquare } from "lucide-react";
import { brandHeader, brandAccent, textOn } from "@/lib/branding";

type Quote = {
  id: string;
  publicToken: string;
  quoteNumber: number;
  title: string | null;
  status: string;
  subtotal: number;
  taxRate: number | null;
  tax: number | null;
  total: number;
  depositType: string;
  depositValue: number | null;
  clientMessage: string | null;
  disclaimer: string | null;
  validUntil: string | null;
  contact: { firstName: string; lastName: string } | null;
  company: { name: string; logoUrl: string | null; brandColor: string | null };
  lineItems: {
    id: string;
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    isOptional: boolean;
    optedOut: boolean;
  }[];
};

function money(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function QuoteAcceptPage({
  quote,
  preview = false,
}: {
  quote: Quote;
  preview?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<"approved" | "changes" | null>(null);
  const [error, setError] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [showChanges, setShowChanges] = useState(false);
  const [changeMessage, setChangeMessage] = useState("");
  const [optedOut, setOptedOut] = useState<string[]>(
    quote.lineItems.filter((li) => li.isOptional && li.optedOut).map((li) => li.id)
  );

  const reviewable =
    !preview && ["AWAITING_RESPONSE", "CHANGES_REQUESTED", "DRAFT"].includes(quote.status);

  // Live totals as the client toggles optional items
  const includedItems = quote.lineItems.filter((li) => !optedOut.includes(li.id));
  const subtotal = includedItems.reduce((s, li) => s + Number(li.total), 0);
  const tax = quote.taxRate ? Math.round(subtotal * Number(quote.taxRate) * 100) / 100 : 0;
  const total = subtotal + tax;
  const deposit =
    quote.depositType === "PERCENT"
      ? Math.round(total * (Number(quote.depositValue ?? 0) / 100) * 100) / 100
      : quote.depositType === "FIXED"
        ? Math.min(Number(quote.depositValue ?? 0), total)
        : 0;

  function toggleItem(id: string) {
    if (!reviewable) return;
    setOptedOut((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function approve() {
    if (!signatureName.trim()) {
      setError("Please type your name to sign and approve.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/public/quote/${quote.publicToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", signatureName, optedOutItemIds: optedOut }),
      });
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }
      setDone("approved");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function requestChanges() {
    if (!changeMessage.trim()) {
      setError("Tell us what you'd like changed.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/public/quote/${quote.publicToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_changes", message: changeMessage }),
      });
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }
      setDone("changes");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (quote.status === "APPROVED" || quote.status === "CONVERTED" || done === "approved") {
    return (
      <div className="app-ui min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white rounded-lg border border-gray-200 p-8 text-center shadow-sm">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Quote approved!</h1>
          <p className="text-gray-500 text-sm">
            {quote.company.name} will be in touch to schedule your service.
            {deposit > 0 && ` A deposit of ${money(deposit)} will be collected to get started.`}
          </p>
        </div>
      </div>
    );
  }

  if (done === "changes") {
    return (
      <div className="app-ui min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white rounded-lg border border-gray-200 p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Changes requested</h1>
          <p className="text-gray-500 text-sm">
            {quote.company.name} will review your request and send an updated quote.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-ui min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {preview && (
          <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 text-center">
            Preview mode — this is what your client sees. Actions are disabled.
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {/* Branded header */}
          <div
            className="px-6 py-5 flex items-center gap-4"
            style={{ backgroundColor: brandHeader(quote.company) }}
          >
            {quote.company.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={quote.company.logoUrl}
                alt={`${quote.company.name} logo`}
                className="h-20 w-auto max-w-[300px] object-contain shrink-0"
              />
            )}
            <div>
              <h1
                className="text-lg font-bold"
                style={{ color: textOn(brandHeader(quote.company)) }}
              >
                {quote.company.name}
              </h1>
              <p
                className="text-sm"
                style={{ color: textOn(brandHeader(quote.company)), opacity: 0.65 }}
              >
                Quote #{quote.quoteNumber}
              </p>
            </div>
          </div>

          <div className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                {quote.title && (
                  <h2 className="text-xl font-bold text-gray-900">{quote.title}</h2>
                )}
                {quote.contact && (
                  <p className="text-sm text-gray-500">
                    Prepared for {quote.contact.firstName} {quote.contact.lastName}
                  </p>
                )}
              </div>
              {quote.validUntil && (
                <p className="text-xs text-amber-600">
                  Valid until{" "}
                  {new Date(quote.validUntil).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>

            {deposit > 0 && (
              <p className="text-sm text-gray-600 italic mb-4">
                A deposit of {money(deposit)} will be required to begin.
              </p>
            )}

            {quote.clientMessage && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap mb-5">
                {quote.clientMessage}
              </p>
            )}

            {/* Line items */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              {quote.lineItems.map((li) => {
                const excluded = optedOut.includes(li.id);
                return (
                  <div
                    key={li.id}
                    className={`flex items-start gap-3 ${excluded ? "opacity-40" : ""}`}
                  >
                    {li.isOptional && (
                      <input
                        type="checkbox"
                        checked={!excluded}
                        onChange={() => toggleItem(li.id)}
                        disabled={!reviewable}
                        className="mt-1 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {li.name || li.description}
                        {li.isOptional && (
                          <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                            Optional
                          </span>
                        )}
                      </p>
                      {li.name && li.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{li.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-gray-900">{money(Number(li.total))}</p>
                      <p className="text-xs text-gray-400">
                        {Number(li.quantity)} × {money(Number(li.unitPrice))}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="ml-auto w-64 border-t border-gray-100 mt-4 pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Subtotal ({includedItems.length} of {quote.lineItems.length} items)
                </span>
                <span>{money(subtotal)}</span>
              </div>
              {tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Tax</span>
                  <span>{money(tax)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1.5">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
              {deposit > 0 && (
                <div className="flex justify-between text-green-700 font-medium">
                  <span>Deposit required</span>
                  <span>{money(deposit)}</span>
                </div>
              )}
            </div>

            {quote.disclaimer && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 uppercase font-semibold mb-1">
                  Terms &amp; Conditions
                </p>
                <p className="text-xs text-gray-600 whitespace-pre-wrap">{quote.disclaimer}</p>
              </div>
            )}

            {error && (
              <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Approval */}
            {reviewable && !showChanges && (
              <div className="mt-6 border-t border-gray-100 pt-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sign by typing your full name
                </label>
                <input
                  type="text"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full max-w-sm px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-4"
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={approve}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-6 py-3 font-semibold text-sm rounded transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{
                      backgroundColor: brandAccent(quote.company),
                      color: textOn(brandAccent(quote.company)),
                    }}
                  >
                    {loading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle size={14} />
                    )}
                    Approve Quote
                  </button>
                  <button
                    onClick={() => setShowChanges(true)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-5 py-3 border border-gray-300 text-sm font-medium text-gray-600 rounded hover:bg-gray-50 transition-colors"
                  >
                    <MessageSquare size={13} />
                    Request Changes
                  </button>
                </div>
              </div>
            )}

            {reviewable && showChanges && (
              <div className="mt-6 border-t border-gray-100 pt-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What would you like changed?
                </label>
                <textarea
                  value={changeMessage}
                  onChange={(e) => setChangeMessage(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none mb-3"
                  placeholder="Tell us what to adjust..."
                />
                <div className="flex gap-3">
                  <button
                    onClick={requestChanges}
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-semibold text-sm rounded transition-colors disabled:opacity-50"
                  >
                    {loading && <Loader2 size={13} className="animate-spin" />}
                    Send Request
                  </button>
                  <button
                    onClick={() => setShowChanges(false)}
                    className="px-5 py-2.5 border border-gray-300 text-sm font-medium text-gray-600 rounded hover:bg-gray-50 transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
