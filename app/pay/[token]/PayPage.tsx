"use client";

import { useEffect, useRef, useState } from "react";
import { CreditCard, Building2, Loader2, CheckCircle, Clock, Lock } from "lucide-react";
import { brandHeader, brandAccent, textOn } from "@/lib/branding";

type LineItem = { id: string; name?: string; description: string; quantity: number; unitPrice: number; total: number; recurringInterval?: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL" | null };

const RECURRING_LABEL: Record<string, string> = {
  MONTHLY: "Billed monthly",
  QUARTERLY: "Billed quarterly",
  SEMIANNUAL: "Billed every 6 months",
  ANNUAL: "Billed annually",
};
type Invoice = {
  id: string; invoiceNumber: number; status: string; publicToken: string;
  subtotal: number; discount: number | null; tax: number | null; surcharge: number | null; depositApplied: number | null; total: number;
  notes: string | null; dueDate: string | null;
  contact: { firstName: string; lastName: string; email: string | null } | null;
  company: {
    name: string; phone: string | null; email: string | null;
    logoUrl: string | null; brandColor: string | null; brandColorSecondary: string | null;
    surchargeEnabled: boolean; surchargeRate: number | null;
  };
  lineItems: LineItem[];
};

/** Server-provided Finix config — non-null only when this company can charge online. */
type FinixConfig = { applicationId: string; environment: "sandbox" | "live" } | null;

// finix.js (loaded from Finix's CDN — self-hosting breaks PCI scope)
type FinixForm = {
  submit: (cb: (err: unknown, res: { data?: { id?: string } } | undefined) => void) => void;
};
declare global {
  interface Window {
    Finix?: {
      PaymentForm: (
        el: string | HTMLElement,
        environment: string,
        applicationId: string,
        options: Record<string, unknown>
      ) => FinixForm;
    };
  }
}

const FINIX_JS_SRC = "https://js.finix.com/v/2/finix.js";

export default function PayPage({ invoice, balance, finix }: { invoice: Invoice; balance: number; finix: FinixConfig }) {
  const [method, setMethod] = useState<"CARD" | "ACH">("CARD");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [pendingAch, setPendingAch] = useState(false);
  const [error, setError] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const [formHasErrors, setFormHasErrors] = useState(true);
  const formRef = useRef<FinixForm | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const surchargeRate = invoice.company.surchargeEnabled
    ? Number(invoice.company.surchargeRate) || 0.03
    : 0;

  const paid = Math.round((Number(invoice.total) - balance) * 100) / 100;
  const surcharge = method === "CARD" && invoice.company.surchargeEnabled
    ? Math.round(balance * surchargeRate * 100) / 100
    : 0;
  const chargeTotal = balance + surcharge;

  // Load finix.js once (only when this company can actually charge online)
  useEffect(() => {
    if (!finix) return;
    if (window.Finix) {
      setScriptReady(true);
      return;
    }
    const existing = document.querySelector(`script[src="${FINIX_JS_SRC}"]`);
    const script = existing ?? document.createElement("script");
    const onLoad = () => setScriptReady(true);
    script.addEventListener("load", onLoad);
    if (!existing) {
      (script as HTMLScriptElement).src = FINIX_JS_SRC;
      document.head.appendChild(script);
    }
    return () => script.removeEventListener("load", onLoad);
  }, [finix]);

  // (Re)mount the tokenization form when the payment method toggles. finix.js
  // has no destroy() — clearing the container and building a new instance is
  // the supported pattern.
  useEffect(() => {
    if (!finix || !scriptReady || !window.Finix || !containerRef.current) return;
    containerRef.current.innerHTML = "";
    setFormHasErrors(true);
    formRef.current = window.Finix.PaymentForm(containerRef.current, finix.environment, finix.applicationId, {
      paymentMethods: [method === "CARD" ? "card" : "bank"],
      showLabels: true,
      showPlaceholders: true,
      showAddress: false,
      requiredFields: method === "CARD" ? ["card_holder_name"] : ["account_holder_name"],
      onUpdate: (_state: unknown, _bin: unknown, hasErrors: boolean) => {
        setFormHasErrors(hasErrors);
      },
      styles: {
        default: {
          input: {
            default: { border: "1px solid #D1D5DB", borderRadius: "8px", fontSize: "14px" },
            focused: { border: "1px solid #22C55E", boxShadow: "0 0 0 2px rgba(34,197,94,0.25)" },
            error: { border: "1px solid #F87171" },
          },
        },
      },
    });
  }, [finix, scriptReady, method]);

  if (invoice.status === "PAID" || done) {
    return (
      <div className="app-ui min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full card-ledger p-8 text-center shadow-sm">
          <div className={`w-14 h-14 ${pendingAch ? "bg-blue-100" : "bg-green-100"} rounded-full flex items-center justify-center mx-auto mb-4`}>
            {pendingAch ? (
              <Clock size={28} className="text-blue-600" />
            ) : (
              <CheckCircle size={28} className="text-green-600" />
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {pendingAch ? "Payment on its way!" : "Payment received!"}
          </h1>
          <p className="text-gray-500 text-sm">
            {pendingAch
              ? `Thank you. Your bank transfer for invoice #${invoice.invoiceNumber} is processing — it usually clears within a few business days.`
              : `Thank you. Invoice #${invoice.invoiceNumber} is paid in full.`}
          </p>
        </div>
      </div>
    );
  }

  async function submitPayment(paymentToken?: string) {
    const res = await fetch(`/api/public/pay/${invoice.publicToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, paymentToken }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      if (res.status === 503) {
        const contactBits = [invoice.company.phone, invoice.company.email]
          .filter(Boolean)
          .join(" or ");
        setError(
          `Online payments are coming soon. Please contact ${invoice.company.name}${contactBits ? ` at ${contactBits}` : ""} to arrange payment.`
        );
      } else {
        setError(data?.error ?? "Payment failed. Please try again.");
      }
      return;
    }

    const data = await res.json().catch(() => null);
    setPendingAch(Boolean(data?.pending));
    setDone(true);
  }

  async function handlePay() {
    setError("");
    setLoading(true);

    if (!finix) {
      // Processor not live for this company — the API answers with the
      // pay-the-business-directly message.
      await submitPayment();
      return;
    }

    if (!formRef.current) {
      setLoading(false);
      setError("The payment form is still loading. Please try again in a moment.");
      return;
    }

    formRef.current.submit(async (err, res) => {
      const paymentToken = res?.data?.id;
      if (err || !paymentToken) {
        setLoading(false);
        setError("Please check your payment details and try again.");
        return;
      }
      await submitPayment(paymentToken);
    });
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
                className="h-20 w-auto max-w-[300px] object-contain shrink-0"
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
                <span className="text-gray-700">
                  {li.name || li.description}
                  {li.recurringInterval && (
                    <span className="ml-2 text-[11px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700 align-middle">
                      {RECURRING_LABEL[li.recurringInterval]}
                    </span>
                  )}
                </span>
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
            {invoice.depositApplied && Number(invoice.depositApplied) > 0 && (
              <div className="flex justify-between text-sm text-green-700">
                <span>Deposit applied</span>
                <span>-${Number(invoice.depositApplied).toFixed(2)}</span>
              </div>
            )}
            {paid > 0 && (
              <div className="flex justify-between text-sm text-green-700">
                <span>Paid to date</span>
                <span>-${paid.toFixed(2)}</span>
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

          {finix ? (
            <div className="mb-4">
              {/* finix.js renders its hosted card/bank fields into this container */}
              <div ref={containerRef} />
              {!scriptReady && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
                  <Loader2 size={13} className="animate-spin" />
                  Loading secure payment form…
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded text-center mb-4">
              <p className="text-xs text-gray-400">
                Online payments aren&apos;t enabled for this invoice yet.
                <br />
                <span className="text-gray-300">Contact {invoice.company.name} to arrange payment.</span>
              </p>
            </div>
          )}

          <button
            onClick={handlePay}
            disabled={loading || (finix != null && (!scriptReady || formHasErrors))}
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
            {finix ? "Payments secured by Finix" : "Secure payment"}
            {finix?.environment === "sandbox" && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Test mode</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
