"use client";

import { useEffect, useRef, useState } from "react";
import { CreditCard, Building2, Loader2, Clock, Lock } from "lucide-react";
import ChargeOverlay, { type ChargePhase } from "@/components/ChargeOverlay";
import { brandAccent, textOn } from "@/lib/branding";
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

type LineItem = { id: string; name?: string; description: string; quantity: number; unitPrice: number; total: number; recurringInterval?: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL" | null };

const RECURRING_LABEL: Record<string, string> = {
  MONTHLY: "Billed monthly",
  QUARTERLY: "Billed quarterly",
  SEMIANNUAL: "Billed every 6 months",
  ANNUAL: "Billed annually",
};
const METHOD_LABEL: Record<string, string> = {
  CARD: "Card", ACH: "Bank (ACH)", CASH: "Cash", CHECK: "Check", CASH_APP: "Cash App",
  PAYPAL: "PayPal", VENMO: "Venmo", ZELLE: "Zelle", OTHER: "Other",
};
type Invoice = {
  id: string; invoiceNumber: number; status: string; kind: string; publicToken: string;
  subtotal: number; discount: number | null; tax: number | null; surcharge: number | null; depositApplied: number | null; total: number;
  notes: string | null; clientMessage: string | null; dueDate: string | null;
  issuedAt: string | null; createdAt: string;
  contact: (PaperContact & { firstName: string; lastName: string }) | null;
  company: PaperCompany & {
    name: string;
    surchargeEnabled: boolean; surchargeRate: number | null;
  };
  lineItems: LineItem[];
  payments: { id: string; amount: number; method: string; paidAt: string }[];
};

import { FINIX_JS_SRC, type FinixConfig, type FinixForm } from "@/lib/finix-js";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function PayPage({
  invoice,
  balance,
  finix,
  preview = false,
}: {
  invoice: Invoice;
  balance: number;
  finix: FinixConfig;
  preview?: boolean;
}) {
  const [method, setMethod] = useState<"CARD" | "ACH">("CARD");
  const [saveCard, setSaveCard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [pendingAch, setPendingAch] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const [formHasErrors, setFormHasErrors] = useState(true);
  // Partial payments: full balance by default; "Pay another amount" opens an input
  const [partial, setPartial] = useState(false);
  const [amountText, setAmountText] = useState("");
  // The card-terminal ritual while the charge runs (see components/ChargeOverlay)
  const [charge, setCharge] = useState<ChargePhase | null>(null);
  const formRef = useRef<FinixForm | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const surchargeRate = invoice.company.surchargeEnabled
    ? Number(invoice.company.surchargeRate) || 0.03
    : 0;

  const paid = Math.round((Number(invoice.total) - balance) * 100) / 100;
  const parsedAmount = Math.round((Number(amountText) || 0) * 100) / 100;
  const payAmount = partial ? parsedAmount : balance;
  const amountValid = !partial || (parsedAmount >= 1 && parsedAmount <= balance);
  const surcharge = method === "CARD" && invoice.company.surchargeEnabled && amountValid
    ? Math.round(payAmount * surchargeRate * 100) / 100
    : 0;
  const chargeTotal = (amountValid ? payAmount : 0) + surcharge;

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

  // "done" is the just-paid confirmation moment. Revisiting a settled
  // invoice's link falls through to the document itself, stamped PAID.
  const isPaid = invoice.status === "PAID";

  if (done) {
    return (
      <div className="app-ui min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full card-ledger p-8 text-center shadow-sm">
          {pendingAch ? (
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock size={28} className="text-blue-600" />
            </div>
          ) : (
            // Same self-drawing checkmark as the charge ritual
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
          )}
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {pendingAch ? "Payment on its way!" : "Payment received!"}
          </h1>
          <p className="text-gray-500 text-sm">
            {pendingAch
              ? `Thank you. Your bank transfer for invoice #${invoice.invoiceNumber} is processing — it usually clears within a few business days.`
              : remaining > 0
                ? `Thank you. Your payment on invoice #${invoice.invoiceNumber} went through — $${remaining.toFixed(2)} remains on the balance.`
                : `Thank you. Invoice #${invoice.invoiceNumber} is paid in full.`}
          </p>
          {remaining > 0 && !pendingAch && (
            <button
              onClick={() => window.location.reload()}
              className="inline-block mt-3 text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-800"
            >
              Make another payment
            </button>
          )}
          <a
            href={`/pay/${invoice.publicToken}/pdf`}
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

  async function submitPayment(paymentToken?: string) {
    // The terminal ritual: processing overlay with a minimum on-screen beat,
    // then the approved checkmark before the confirmation card. Failures drop
    // the overlay and surface the normal inline error.
    const label = method === "CARD" ? "your card" : "your bank account";
    setCharge({
      state: "processing",
      label,
      amount: chargeTotal,
      ...(method === "ACH" && { caption: "Submitting the bank transfer…" }),
    });
    const started = Date.now();

    const res = await fetch(`/api/public/pay/${invoice.publicToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method,
        paymentToken,
        saveCard: method === "CARD" && saveCard,
        amount: payAmount,
      }),
    }).catch(() => null);

    await new Promise((r) => setTimeout(r, Math.max(0, 1100 - (Date.now() - started))));
    setLoading(false);

    if (!res || !res.ok) {
      setCharge(null);
      const data = res ? await res.json().catch(() => null) : null;
      // 503 = no money can move. The processor-not-enabled case (identified by
      // the processorLive field) gets the "coming soon" copy with the
      // business's contact details; anything else — a paused account, say —
      // already sends copy that fits, so show that instead of overriding it.
      if (res && res.status === 503 && data && "processorLive" in data) {
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
    if (data?.pending) {
      // ACH: submitted, not yet cleared — no "Approved" claim, straight to
      // the on-its-way confirmation.
      setCharge(null);
      setPendingAch(true);
      setRemaining(Number(data?.remaining) || 0);
      setDone(true);
      return;
    }
    setCharge({ state: "approved", label, amount: chargeTotal });
    setTimeout(() => {
      setCharge(null);
      setPendingAch(false);
      setRemaining(Number(data?.remaining) || 0);
      setDone(true);
    }, 1800);
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

  const accent = brandAccent(invoice.company);

  return (
    <div className="app-ui min-h-screen bg-white py-4 sm:py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {preview && (
          <p className="mb-3 text-center text-xs text-gray-400">
            {isPaid
              ? "Preview — doesn't count as a client view."
              : "Preview — doesn't count as a client view. If your client hands you their card, you can run the payment right here."}
          </p>
        )}

        {/* The document — the web twin of the PDF letterhead */}
        <PaperSheet>
          <PaperHeader
            company={invoice.company}
            kind="invoice"
            docNumber={invoice.invoiceNumber}
            metaLines={[
              `Date: ${shortDate(invoice.issuedAt ?? invoice.createdAt)}`,
              invoice.dueDate ? `Due: ${shortDate(invoice.dueDate)}` : null,
              invoice.kind === "DEPOSIT" ? "Deposit invoice" : null,
            ]}
          />

          <div className="flex items-start justify-between gap-4">
            <PreparedFor contact={invoice.contact} />
            {isPaid && (
              <div className="mt-6 shrink-0 pr-1 sm:pr-4">
                <PaperStamp kind="invoice" text="Paid" />
              </div>
            )}
          </div>

          {invoice.clientMessage && (
            <p className="mt-4 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
              {invoice.clientMessage}
            </p>
          )}

          {/* Line items — ruled table like the PDF */}
          <div className="mt-5">
            <ItemsTableHead />
            <div>
              {invoice.lineItems.map((li) => (
                <div
                  key={li.id}
                  className="border-b border-gray-100 py-2.5 sm:grid sm:grid-cols-[1fr_54px_90px_96px] sm:items-start sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {li.name || li.description}
                      {li.recurringInterval && (
                        <span className="ml-1.5 text-xs font-normal text-gray-400">
                          ({RECURRING_LABEL[li.recurringInterval].toLowerCase()})
                        </span>
                      )}
                    </p>
                    {li.name && li.description && (
                      <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                        {li.description}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-400 sm:hidden">
                      {Number(li.quantity)} × ${Number(li.unitPrice).toFixed(2)}
                    </p>
                  </div>
                  <p className="hidden text-right text-sm text-gray-600 sm:block">
                    {Number(li.quantity)}
                  </p>
                  <p className="hidden text-right text-sm text-gray-600 sm:block">
                    ${Number(li.unitPrice).toFixed(2)}
                  </p>
                  <p className="text-right text-sm text-gray-900 max-sm:mt-1">
                    ${Number(li.total).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Totals ledger — right-aligned, accent-ruled total like the PDF */}
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-[260px] space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span>${Number(invoice.subtotal).toFixed(2)}</span>
              </div>
              {invoice.discount && Number(invoice.discount) > 0 ? (
                <div className="flex justify-between text-gray-500">
                  <span>Discount</span>
                  <span>-${Number(invoice.discount).toFixed(2)}</span>
                </div>
              ) : null}
              {invoice.tax && Number(invoice.tax) > 0 ? (
                <div className="flex justify-between text-gray-500">
                  <span>Tax</span>
                  <span>${Number(invoice.tax).toFixed(2)}</span>
                </div>
              ) : null}
              {invoice.depositApplied && Number(invoice.depositApplied) > 0 ? (
                <div className="flex justify-between text-gray-500">
                  <span>Deposit applied</span>
                  <span>-${Number(invoice.depositApplied).toFixed(2)}</span>
                </div>
              ) : null}
              <div
                className="flex justify-between border-t-2 pt-1.5 text-base font-bold text-gray-900"
                style={{ borderTopColor: accent }}
              >
                <span>Total</span>
                <span>${Number(invoice.total).toFixed(2)}</span>
              </div>
              {paid > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Paid to date</span>
                  <span>-${paid.toFixed(2)}</span>
                </div>
              )}
              {surcharge > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>Card surcharge ({(surchargeRate * 100).toFixed(1)}%)</span>
                  <span>${surcharge.toFixed(2)}</span>
                </div>
              )}
              {(paid > 0 || surcharge > 0 || partial) && (
                <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-bold text-gray-900">
                  <span>{partial && amountValid ? "You're paying" : "Balance due"}</span>
                  <span>${chargeTotal.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Payments so far — mirrors the PDF's PAYMENTS section */}
          {invoice.payments.length > 0 && (
            <div className="mt-6">
              <SectionLabel>Payments</SectionLabel>
              <div className="mt-1 space-y-1">
                {invoice.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      {shortDate(p.paidAt)} · {METHOD_LABEL[p.method] ?? p.method}
                    </span>
                    <span className="text-gray-700">${Number(p.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {invoice.notes && (
            <div className="mt-6">
              <SectionLabel>Notes</SectionLabel>
              <p className="mt-1 text-xs leading-relaxed text-gray-500 whitespace-pre-wrap">
                {invoice.notes}
              </p>
            </div>
          )}

          {/* Payment — the bottom of the same sheet, like the remittance stub
              on a paper invoice. A settled invoice has no stub — the stamp
              says everything. */}
          {!isPaid && (
          <div className="mt-8 border-t-2 border-gray-900 pt-5">
          {/* Amount — full balance by default, or a partial payment */}
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Payment amount</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <button
              type="button"
              onClick={() => setPartial(false)}
              className={`px-4 py-3 border rounded text-sm font-medium transition-colors ${
                !partial
                  ? "border-green-500 bg-green-50 text-green-700"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              Full balance — ${balance.toFixed(2)}
            </button>
            <button
              type="button"
              onClick={() => setPartial(true)}
              className={`px-4 py-3 border rounded text-sm font-medium transition-colors ${
                partial
                  ? "border-green-500 bg-green-50 text-green-700"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              Another amount
            </button>
          </div>
          {partial && (
            <div className="mb-4">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={balance}
                  step="0.01"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  placeholder={balance.toFixed(2)}
                  className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500"
                />
              </div>
              {!amountValid && amountText !== "" && (
                <p className="mt-1.5 text-xs text-red-600">
                  Enter an amount between $1.00 and ${balance.toFixed(2)}.
                </p>
              )}
              <p className="mt-1.5 text-xs text-gray-400">
                The rest stays on the invoice — you can come back and pay it anytime.
              </p>
            </div>
          )}

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
              {method === "CARD" && scriptReady && (
                <label className="flex items-start gap-2 mt-3 text-xs text-gray-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveCard}
                    onChange={(e) => setSaveCard(e.target.checked)}
                    className="mt-0.5 accent-green-600"
                  />
                  <span>
                    Keep this card on file with {invoice.company.name} for faster future
                    payments. You can remove it anytime.
                  </span>
                </label>
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
            disabled={loading || !amountValid || (finix != null && (!scriptReady || formHasErrors))}
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
          )}

          <PaperFooter
            kind="invoice"
            docNumber={invoice.invoiceNumber}
            companyName={invoice.company.name}
            pdfHref={`/pay/${invoice.publicToken}/pdf`}
          />
        </PaperSheet>
      </div>
      <ChargeOverlay phase={charge} onDismiss={() => setCharge(null)} />
    </div>
  );
}
