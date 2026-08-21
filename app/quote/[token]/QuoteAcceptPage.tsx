"use client";

import { useState } from "react";
import { CheckCircle, Loader2, MessageSquare } from "lucide-react";
import { brandAccent, textOn } from "@/lib/branding";
import { signatureMatchesName } from "@/lib/signature";
import {
  PaperSheet,
  PaperHeader,
  PaperStamp,
  PreparedFor,
  SectionLabel,
  ItemsTableHead,
  PaperFooter,
  type PaperCompany,
  type PaperContact,
} from "@/components/paper-doc";

type Quote = {
  id: string;
  publicToken: string;
  quoteNumber: number;
  title: string | null;
  status: string;
  subtotal: number;
  discountType: string;
  discountValue: number | null;
  taxRate: number | null;
  tax: number | null;
  total: number;
  depositType: string;
  depositValue: number | null;
  clientMessage: string | null;
  disclaimer: string | null;
  validUntil: string | null;
  sentAt: string | null;
  createdAt: string;
  signatureName: string | null;
  approvedAt: string | null;
  contact: (PaperContact & { firstName: string; lastName: string }) | null;
  company: PaperCompany & { name: string };
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

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  // Signed off (converted = approved-then-scheduled) — the paper still shows,
  // stamped, with actions gone; the client keeps a viewable copy.
  const approved = quote.status === "APPROVED" || quote.status === "CONVERTED";
  const expired = Boolean(quote.validUntil && new Date(quote.validUntil) < new Date());
  const accent = brandAccent(quote.company);

  // Live totals as the client toggles optional items
  const includedItems = quote.lineItems.filter((li) => !optedOut.includes(li.id));
  const subtotal = includedItems.reduce((s, li) => s + Number(li.total), 0);
  // Discount tracks the live subtotal (percent recomputes as optional items
  // toggle; fixed never exceeds what's left)
  const discount =
    quote.discountType === "PERCENT"
      ? Math.round(subtotal * Number(quote.discountValue ?? 0)) / 100
      : quote.discountType === "FIXED"
        ? Math.min(Number(quote.discountValue ?? 0), subtotal)
        : 0;
  const tax = quote.taxRate
    ? Math.round((subtotal - discount) * Number(quote.taxRate) * 100) / 100
    : 0;
  const total = subtotal - discount + tax;
  const deposit =
    quote.depositType === "PERCENT"
      ? Math.round(total * (Number(quote.depositValue ?? 0) / 100) * 100) / 100
      : quote.depositType === "FIXED"
        ? Math.min(Number(quote.depositValue ?? 0), total)
        : quote.depositType === "FULL"
          ? total
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
    // The signature is the client's sign-off — it has to be their own name
    if (
      quote.contact &&
      !signatureMatchesName(signatureName, quote.contact.firstName, quote.contact.lastName)
    ) {
      setError(
        `This quote was prepared for ${quote.contact.firstName} ${quote.contact.lastName} — please sign with that name to approve.`
      );
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
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Something went wrong. Please try again.");
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

  // Right after signing: the confirmation moment. Coming back to the link
  // later falls through to the stamped document below.
  if (done === "approved") {
    return (
      <div className="app-ui min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full card-ledger p-8 text-center shadow-sm">
          {/* Same self-drawing checkmark as the payment ritual */}
          <div className="charge-pop w-14 h-14 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 48 48" className="h-7 w-7">
              <path
                className="charge-draw"
                d="M12 25 L21 34 L37 16"
                fill="none"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Quote approved!</h1>
          <p className="text-gray-500 text-sm">
            {quote.company.name} will be in touch to schedule your service.
            {deposit > 0 && ` A deposit of ${money(deposit)} will be collected to get started.`}
          </p>
          <a
            href={`/quote/${quote.publicToken}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-4 text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700"
          >
            Download a copy (PDF)
          </a>
        </div>
      </div>
    );
  }

  if (done === "changes") {
    return (
      <div className="app-ui min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full card-ledger p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Changes requested</h1>
          <p className="text-gray-500 text-sm">
            {quote.company.name} will review your request and send an updated quote.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-ui min-h-screen bg-white py-4 sm:py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {preview && (
          <p className="mb-3 text-center text-xs text-gray-400">
            Preview — this is what your client sees. Actions are disabled.
          </p>
        )}

        {/* The document — the web twin of the PDF letterhead */}
        <PaperSheet>
          <PaperHeader
            company={quote.company}
            kind="quote"
            docNumber={quote.quoteNumber}
            metaLines={[
              `Date: ${shortDate(quote.sentAt ?? quote.createdAt)}`,
              quote.validUntil ? `Valid until: ${shortDate(quote.validUntil)}` : null,
            ]}
          />

          <div className="flex items-start justify-between gap-4">
            <PreparedFor contact={quote.contact} />
            {approved && (
              <div className="mt-6 shrink-0 pr-1 sm:pr-4">
                <PaperStamp kind="quote" text="Approved" />
              </div>
            )}
          </div>

          {quote.title && (
            <p className="mt-4 text-base font-bold text-gray-900">{quote.title}</p>
          )}
          {quote.clientMessage && (
            <p className="mt-3 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
              {quote.clientMessage}
            </p>
          )}

          {/* Line items — ruled table like the PDF; optional items keep their
              interactive include/exclude checkboxes */}
          <div className="mt-5">
            <ItemsTableHead />
            <div>
              {quote.lineItems.map((li) => {
                const excluded = optedOut.includes(li.id);
                return (
                  <div
                    key={li.id}
                    className={`border-b border-gray-100 py-2.5 sm:grid sm:grid-cols-[1fr_54px_90px_96px] sm:items-start sm:gap-3 ${excluded ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      {li.isOptional && !approved && (
                        <input
                          type="checkbox"
                          checked={!excluded}
                          onChange={() => toggleItem(li.id)}
                          disabled={!reviewable}
                          className="mt-0.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {li.name || li.description}
                          {li.isOptional && (
                            <span className="ml-1.5 text-xs font-normal text-gray-400">
                              {excluded ? "(optional — not included)" : "(optional)"}
                            </span>
                          )}
                        </p>
                        {li.name && li.description && (
                          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                            {li.description}
                          </p>
                        )}
                        {/* Phones: qty × unit reads under the name */}
                        <p className="mt-0.5 text-xs text-gray-400 sm:hidden">
                          {Number(li.quantity)} × {money(Number(li.unitPrice))}
                        </p>
                      </div>
                    </div>
                    <p className="hidden text-right text-sm text-gray-600 sm:block">
                      {Number(li.quantity)}
                    </p>
                    <p className="hidden text-right text-sm text-gray-600 sm:block">
                      {money(Number(li.unitPrice))}
                    </p>
                    <p className="text-right text-sm text-gray-900 max-sm:mt-1">
                      {excluded ? "—" : money(Number(li.total))}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals ledger — right-aligned, accent-ruled total like the PDF */}
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-[260px] space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Subtotal
                  {quote.lineItems.some((li) => li.isOptional) &&
                    ` (${includedItems.length} of ${quote.lineItems.length} items)`}
                </span>
                <span>{money(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>
                    Discount
                    {quote.discountType === "PERCENT" ? ` (${Number(quote.discountValue)}%)` : ""}
                  </span>
                  <span>−{money(discount)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>
                    Tax{quote.taxRate ? ` (${(Number(quote.taxRate) * 100).toFixed(2).replace(/\.?0+$/, "")}%)` : ""}
                  </span>
                  <span>{money(tax)}</span>
                </div>
              )}
              <div
                className="flex justify-between border-t-2 pt-1.5 text-base font-bold text-gray-900"
                style={{ borderTopColor: accent }}
              >
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
              {deposit > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Deposit due on approval</span>
                  <span>{money(deposit)}</span>
                </div>
              )}
            </div>
          </div>

          {quote.disclaimer && (
            <div className="mt-6">
              <SectionLabel>Terms &amp; Conditions</SectionLabel>
              <p className="mt-1 text-xs leading-relaxed text-gray-500 whitespace-pre-wrap">
                {quote.disclaimer}
              </p>
            </div>
          )}

          {/* Signed-off record — mirrors the PDF's APPROVED block */}
          {approved && quote.signatureName && (
            <div className="mt-8 border-t-2 border-gray-900 pt-4">
              <SectionLabel>Approved</SectionLabel>
              <p className="mt-1 text-sm text-gray-700">
                Signed by <span className="font-semibold">{quote.signatureName}</span>
                {quote.approvedAt ? ` on ${longDate(quote.approvedAt)}` : ""}.
              </p>
            </div>
          )}

          {/* Sign-off — the bottom of the same sheet, like the signature
              line on a paper proposal */}
          {(error || (reviewable && !preview) || (expired && reviewable)) && (
            <div className="mt-8 border-t-2 border-gray-900 pt-5">
              {error && (
                <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Expired: no online approval — prices may be stale. Requesting
                  changes stays open as the "send me a fresh one" path. */}
              {expired && reviewable && !showChanges && (
                <>
                  <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    This quote expired on {longDate(quote.validUntil!)}. Contact{" "}
                    {quote.company.name} for an updated quote, or request changes and
                    they&apos;ll send a fresh one.
                  </div>
                  <button
                    onClick={() => setShowChanges(true)}
                    className="mt-4 flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50"
                  >
                    <MessageSquare size={14} />
                    Request changes
                  </button>
                </>
              )}

              {reviewable && !expired && !showChanges && (
                <>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sign by typing your full name
            </label>
            <input
              type="text"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              placeholder={
                quote.contact
                  ? `${quote.contact.firstName} ${quote.contact.lastName}`
                  : "Your full name"
              }
              className={`w-full max-w-sm px-3 py-2.5 border border-gray-300 rounded text-[16px] sm:text-sm italic focus:outline-none focus:ring-2 focus:ring-green-500 ${quote.contact ? "mb-1" : "mb-4"}`}
            />
            {quote.contact && (
              <p className="text-xs text-gray-400 mb-4">
                Signing as {quote.contact.firstName} {quote.contact.lastName}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={approve}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-6 py-3 font-semibold text-sm rounded transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: accent, color: textOn(accent) }}
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
                </>
              )}

              {reviewable && showChanges && (
                <>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    What would you like changed?
                  </label>
                  <textarea
                    value={changeMessage}
                    onChange={(e) => setChangeMessage(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none mb-3"
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
                </>
              )}
            </div>
          )}

          <PaperFooter
            kind="quote"
            docNumber={quote.quoteNumber}
            companyName={quote.company.name}
            pdfHref={`/quote/${quote.publicToken}/pdf`}
          />
        </PaperSheet>
      </div>
    </div>
  );
}
