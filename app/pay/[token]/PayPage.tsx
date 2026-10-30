"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, CreditCard, Loader2, Lock } from "lucide-react";
import ChargeOverlay, { type ChargePhase } from "@/components/ChargeOverlay";
import { FINIX_JS_SRC, type FinixForm } from "@/lib/finix-js";
import { isTestMode, processorLabel, type ClientPayConfig } from "@/lib/pay-config";
import { clientAccent } from "@/lib/client-theme";
import { textOn } from "@/lib/branding";
import SquareCardFields, { type SquareCardFieldsHandle } from "@/components/SquareCardFields";
import SquareAchButton from "@/components/SquareAchButton";
import {
  ActionBar,
  Button,
  Choice,
  Choices,
  ClientRoot,
  Foot,
  ItemRow,
  ItemsHead,
  Label,
  Letterhead,
  Notice,
  PreparedFor,
  Receipt,
  Sheet,
  Stamp,
  Stub,
  TRow,
  Totals,
  longDate,
  money,
  shortDate,
  type ClientCompany,
  type ClientPerson,
} from "@/components/client";

type LineItem = {
  id: string;
  name?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  recurringInterval?: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL" | null;
};

const RECURRING_LABEL: Record<string, string> = {
  MONTHLY: "billed monthly",
  QUARTERLY: "billed quarterly",
  SEMIANNUAL: "billed every 6 months",
  ANNUAL: "billed annually",
};
const METHOD_LABEL: Record<string, string> = {
  CARD: "Card", ACH: "Bank transfer", CASH: "Cash", CHECK: "Check", CASH_APP: "Cash App",
  PAYPAL: "PayPal", VENMO: "Venmo", ZELLE: "Zelle", OTHER: "Other",
};

export type PublicInvoice = {
  id: string;
  invoiceNumber: number;
  status: string;
  kind: string;
  publicToken: string;
  subtotal: number;
  discount: number | null;
  tax: number | null;
  surcharge: number | null;
  depositApplied: number | null;
  total: number;
  notes: string | null;
  clientMessage: string | null;
  dueDate: string | null;
  issuedAt: string | null;
  createdAt: string;
  contact: (ClientPerson & { firstName: string; lastName: string }) | null;
  company: ClientCompany & { name: string; surchargeEnabled: boolean; surchargeRate: number | null };
  lineItems: LineItem[];
  payments: { id: string; amount: number; surchargeAmount: number | null; method: string; paidAt: string }[];
};

/**
 * The public invoice — the same sheet of stationery as the estimate, with
 * the remittance stub at the foot. Paying doesn't leave the page: the PAID
 * stamp drops onto the sheet and the stub becomes the receipt.
 *
 * `demo` (the /app/design/client gallery): the card fields are a still
 * picture and Pay plays the charge ritual locally — no processor involved.
 */
export default function PayPage({
  invoice,
  balance,
  pay,
  preview = false,
  demo = false,
}: {
  invoice: PublicInvoice;
  balance: number;
  /** The browser tokenizer config (lib/pay-config.ts); null = no online payment. */
  pay: ClientPayConfig;
  preview?: boolean;
  demo?: boolean;
}) {
  const finix = pay?.processor === "finix" ? pay : null;
  const square = pay?.processor === "square" ? pay : null;
  const squareCardRef = useRef<SquareCardFieldsHandle>(null);
  const [squareReady, setSquareReady] = useState(false);
  const [method, setMethod] = useState<"CARD" | "ACH">("CARD");
  const [saveCard, setSaveCard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [paidNow, setPaidNow] = useState<{ amount: number; method: "CARD" | "ACH"; at: string } | null>(null);
  const [pendingAch, setPendingAch] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const [formHasErrors, setFormHasErrors] = useState(true);
  const [partial, setPartial] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [charge, setCharge] = useState<ChargePhase | null>(null);
  const formRef = useRef<FinixForm | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const company = invoice.company;
  const accent = clientAccent(company);
  const surchargeRate = company.surchargeEnabled ? Number(company.surchargeRate) || 0 : 0;

  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const priorSurcharges = invoice.payments.reduce((s, p) => s + Number(p.surchargeAmount ?? 0), 0);
  const parsedAmount = Math.round((Number(amountText) || 0) * 100) / 100;
  const payAmount = partial ? parsedAmount : balance;
  const amountValid = !partial || (parsedAmount >= 1 && parsedAmount <= balance);
  const docType = invoice.kind === "DEPOSIT" ? "Deposit invoice" : invoice.kind === "QUICK_CHARGE" ? "Payment request" : "Invoice";
  const canSplit = invoice.kind !== "DEPOSIT" && balance > 1;
  const surcharge = method === "CARD" && company.surchargeEnabled && amountValid ? Math.round(payAmount * surchargeRate * 100) / 100 : 0;
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

  // (Re)mount the tokenization form when the payment method toggles.
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
      onUpdate: (_state: unknown, _bin: unknown, hasErrors: boolean) => setFormHasErrors(hasErrors),
      styles: {
        default: {
          input: {
            default: { border: "1px solid #D1D5DB", borderRadius: "10px", fontSize: "16px" },
            focused: { border: `1px solid ${accent}`, boxShadow: `0 0 0 3px ${accent}22` },
            error: { border: "1px solid #F87171" },
          },
        },
      },
    });
  }, [finix, scriptReady, method, accent]);

  const isPaid = invoice.status === "PAID" || (done && !pendingAch && remaining <= 0);
  const isArchived = invoice.status === "ARCHIVED";
  const payable = !isPaid && !isArchived && !done && (pay !== null || demo) && !preview;

  async function submitPayment(paymentToken?: string) {
    const label = method === "CARD" ? "your card" : "your bank account";
    setCharge({ state: "processing", label, amount: chargeTotal, ...(method === "ACH" && { caption: "Submitting the bank transfer…" }) });
    const started = Date.now();

    let data: { pending?: boolean; remaining?: number; error?: string; processorLive?: boolean } | null = null;
    let ok = false;
    let status = 0;
    if (demo) {
      await new Promise((r) => setTimeout(r, 900));
      ok = true;
      data = { pending: method === "ACH", remaining: Math.max(0, Math.round((balance - payAmount) * 100) / 100) };
    } else {
      const res = await fetch(`/api/public/pay/${invoice.publicToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, paymentToken, saveCard: method === "CARD" && saveCard, amount: payAmount }),
      }).catch(() => null);
      ok = Boolean(res?.ok);
      status = res?.status ?? 0;
      data = res ? await res.json().catch(() => null) : null;
    }

    await new Promise((r) => setTimeout(r, Math.max(0, 1100 - (Date.now() - started))));
    setLoading(false);

    if (!ok) {
      setCharge(null);
      if (status === 503 && data && "processorLive" in data) {
        const contactBits = [company.phone, company.email].filter(Boolean).join(" or ");
        setError(`Online payment isn't available for this invoice. Please contact ${company.name}${contactBits ? ` at ${contactBits}` : ""} to arrange payment.`);
      } else {
        setError(data?.error ?? "Payment failed. Please try again.");
      }
      return;
    }

    const finish = (pending: boolean) => {
      setCharge(null);
      setPendingAch(pending);
      setRemaining(Number(data?.remaining) || 0);
      setPaidNow({ amount: payAmount, method, at: new Date().toISOString() });
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    if (data?.pending) return finish(true);
    setCharge({ state: "approved", label, amount: chargeTotal });
    setTimeout(() => finish(false), 1600);
  }

  async function handlePay() {
    setError("");
    setLoading(true);
    if (demo) return submitPayment();
    if (square) {
      const token = await squareCardRef.current?.tokenize();
      if (!token) {
        setLoading(false);
        setError(squareCardRef.current?.lastError() || "Please check your card details and try again.");
        return;
      }
      await submitPayment(token);
      return;
    }
    if (!finix || !formRef.current) {
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

  const contactLine = [company.phone, company.email].filter(Boolean).join(" or ");
  const fieldsReady = demo || (finix ? scriptReady : squareReady);

  return (
    <ClientRoot brand={company}>
      {preview && (
        <p className="c-preview">
          {isPaid ? "Preview — doesn't count as a client view." : "Preview — doesn't count as a client view. If your client hands you their card, you can run the payment right here."}
        </p>
      )}
      <Sheet>
        <Letterhead
          company={company}
          docType={docType}
          docNumber={invoice.invoiceNumber}
          meta={[shortDate(invoice.issuedAt ?? invoice.createdAt), invoice.dueDate && !isPaid ? `Due ${shortDate(invoice.dueDate)}` : null]}
        />

        <div className="mt-6 flex items-start justify-between gap-4">
          <PreparedFor person={invoice.contact} label="Billed to" />
          {(isPaid || isArchived) && (
            <div className="shrink-0 pt-1">
              {isPaid ? <Stamp text="Paid" slam={done} /> : <Stamp text="Withdrawn" tone="muted" />}
            </div>
          )}
        </div>

        {invoice.clientMessage && <p className="c-body mt-6 whitespace-pre-wrap">{invoice.clientMessage}</p>}

        <div className="mt-6">
          <ItemsHead />
          {invoice.lineItems.map((li) => (
            <ItemRow
              key={li.id}
              name={li.name || li.description}
              description={li.name ? li.description : null}
              qty={Number(li.quantity)}
              unit={Number(li.unitPrice)}
              amount={Number(li.total)}
              tag={li.recurringInterval ? RECURRING_LABEL[li.recurringInterval] : null}
            />
          ))}
        </div>

        <Totals>
          <TRow label="Subtotal" value={money(invoice.subtotal)} />
          {invoice.discount && Number(invoice.discount) > 0 ? <TRow label="Discount" value={`−${money(invoice.discount)}`} /> : null}
          {invoice.tax && Number(invoice.tax) > 0 ? <TRow label="Tax" value={money(invoice.tax)} /> : null}
          {invoice.depositApplied && Number(invoice.depositApplied) > 0 ? <TRow label="Deposit applied" value={`−${money(invoice.depositApplied)}`} /> : null}
          <TRow label="Total" value={money(invoice.total)} kind="total" />
          {priorSurcharges > 0 && <TRow label="Card surcharges" value={money(priorSurcharges)} />}
          {paid > 0 && <TRow label="Paid to date" value={`−${money(paid)}`} />}
          {payable && surcharge > 0 && <TRow label={`Card surcharge (${(surchargeRate * 100).toFixed(1)}%)`} value={money(surcharge)} kind="warn" />}
          {!isPaid && (paid > 0 || priorSurcharges > 0 || surcharge > 0 || partial) && (
            <TRow label={partial && amountValid ? "You're paying" : "Balance due"} value={money(payable ? chargeTotal : balance)} kind="due" />
          )}
        </Totals>

        {invoice.payments.length > 0 && (
          <div className="mt-8">
            <Label>Payments</Label>
            <div className="mt-1">
              {invoice.payments.map((p) => (
                <div key={p.id} className="c-trow">
                  <span>
                    {shortDate(p.paidAt)} · {METHOD_LABEL[p.method] ?? p.method}
                  </span>
                  <span className="c-num">{money(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {invoice.notes && (
          <div className="mt-8">
            <Label>Notes</Label>
            <p className="c-small mt-1 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        {/* ── What happened, on the invoice ── */}
        {done && paidNow && (
          <Receipt>
            {pendingAch ? (
              <>
                <p className="c-receipt-line">
                  <strong>Bank transfer submitted</strong> — {money(paidNow.amount)} on {longDate(paidNow.at)}.
                </p>
                <p className="c-receipt-line">It usually clears within a few business days; this page updates when it does.</p>
              </>
            ) : (
              <>
                <p className="c-receipt-line">
                  <strong>Paid {money(paidNow.amount)}</strong> by {paidNow.method === "CARD" ? "card" : "bank transfer"} on {longDate(paidNow.at)}.
                  {remaining > 0 ? ` ${money(remaining)} remains on the balance.` : " Thank you."}
                </p>
                {remaining > 0 && (
                  <ActionBar>
                    <Button variant="outline" onClick={() => window.location.reload()}>
                      Make another payment
                    </Button>
                  </ActionBar>
                )}
              </>
            )}
          </Receipt>
        )}

        {isPaid && !done && (
          <Receipt>
            <p className="c-receipt-line">
              <strong>Paid in full.</strong> Thank you for your business.
            </p>
          </Receipt>
        )}

        {isArchived && (
          <Receipt>
            <p className="c-receipt-line">
              <strong>This invoice was withdrawn</strong> by {company.name}, so there is nothing to pay here. If you were expecting
              to pay, reach them{contactLine ? ` at ${contactLine}` : ""}.
            </p>
          </Receipt>
        )}

        {!isPaid && !isArchived && !done && !pay && !demo && (
          <Stub title="How to pay">
            <p className="c-body">
              Please pay {company.name} directly
              {company.phone || company.email ? (
                <>
                  {" "}— reach them at{" "}
                  {company.phone && (
                    <a href={`tel:${company.phone}`} className="c-link">
                      {company.phone}
                    </a>
                  )}
                  {company.phone && company.email && " or "}
                  {company.email && (
                    <a href={`mailto:${company.email}`} className="c-link">
                      {company.email}
                    </a>
                  )}
                </>
              ) : null}
              .
            </p>
          </Stub>
        )}

        {/* ── The remittance stub ── */}
        {payable && (
          <Stub title="Pay this invoice">
            {canSplit && (
              <div className="mb-5">
                <Choices>
                  <Choice on={!partial} onClick={() => setPartial(false)}>
                    Full balance · {money(balance)}
                  </Choice>
                  <Choice on={partial} onClick={() => setPartial(true)}>
                    Another amount
                  </Choice>
                </Choices>
                {partial && (
                  <div className="mt-3">
                    <div className="relative max-w-xs">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px]" style={{ color: "var(--c-faint)" }}>
                        $
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={1}
                        max={balance}
                        step="0.01"
                        value={amountText}
                        onChange={(e) => setAmountText(e.target.value)}
                        placeholder={balance.toFixed(2)}
                        className="c-field c-num pl-8"
                        aria-label="Amount to pay"
                      />
                    </div>
                    <p className="c-hint">
                      {!amountValid && amountText !== ""
                        ? `Enter an amount between $1.00 and ${money(balance)}.`
                        : "The rest stays on the invoice — come back and pay it anytime."}
                    </p>
                  </div>
                )}
              </div>
            )}

            <Label>Pay with</Label>
            <div className="mt-2 mb-4">
              <Choices>
                <Choice on={method === "CARD"} onClick={() => setMethod("CARD")}>
                  <CreditCard size={16} />
                  Card
                </Choice>
                <Choice on={method === "ACH"} onClick={() => setMethod("ACH")}>
                  <Building2 size={16} />
                  Bank transfer
                </Choice>
              </Choices>
            </div>

            {method === "CARD" && company.surchargeEnabled && surchargeRate > 0 && (
              <div className="mb-4">
                <Notice tone="warn">
                  A {(surchargeRate * 100).toFixed(1)}% card surcharge applies. Pay by bank transfer to avoid it.
                </Notice>
              </div>
            )}

            {error && (
              <div className="mb-4">
                <Notice tone="bad">{error}</Notice>
              </div>
            )}

            <div className="mb-4">
              {demo && method === "CARD" && (
                <div className="grid gap-3">
                  <input className="c-field c-num" placeholder="Card number" disabled aria-label="Card number (demo)" />
                  <div className="grid grid-cols-2 gap-3">
                    <input className="c-field c-num" placeholder="MM / YY" disabled aria-label="Expiry (demo)" />
                    <input className="c-field c-num" placeholder="CVC" disabled aria-label="CVC (demo)" />
                  </div>
                </div>
              )}
              {square && method === "CARD" && (
                <SquareCardFields key="square-card" ref={squareCardRef} config={square} accent={accent} onReady={setSquareReady} />
              )}
              {square && method === "ACH" && (
                <SquareAchButton
                  key="square-ach"
                  config={square}
                  amount={chargeTotal}
                  defaultName={invoice.contact ? `${invoice.contact.firstName} ${invoice.contact.lastName}`.trim() : ""}
                  accent={accent}
                  textColor={textOn(accent)}
                  disabled={loading || !amountValid}
                  onToken={async (token) => {
                    setError("");
                    setLoading(true);
                    await submitPayment(token);
                  }}
                  onError={(message) => setError(message)}
                />
              )}
              {finix && (
                <>
                  <div ref={containerRef} />
                  {!scriptReady && (
                    <div className="flex items-center justify-center gap-2 py-6 c-small">
                      <Loader2 size={13} className="animate-spin" />
                      Loading secure payment form…
                    </div>
                  )}
                </>
              )}
              {method === "CARD" && fieldsReady && (
                <label className="mt-3 flex cursor-pointer select-none items-start gap-2 c-small">
                  <input type="checkbox" className="c-check" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} />
                  <span>
                    Keep this card on file with {company.name} for faster payments next time. You can remove it anytime.
                    {company.surchargeEnabled && surchargeRate > 0 && (
                      <> Charges to a card on file, including automatic plan payments, carry the same {(surchargeRate * 100).toFixed(1)}% card surcharge.</>
                    )}
                  </span>
                </label>
              )}
            </div>

            {/* Square's bank flow has its own button (the Plaid popup must open from the click) */}
            {!(square && method === "ACH") && (
              <ActionBar>
                <Button
                  block
                  onClick={handlePay}
                  disabled={loading || !amountValid || (demo ? false : finix ? !scriptReady || formHasErrors : !squareReady)}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
                  Pay {money(chargeTotal)}
                </Button>
              </ActionBar>
            )}

            <p className="mt-3 flex items-center justify-center gap-1.5 c-small">
              <Lock size={11} />
              Secured by {demo ? "Square" : processorLabel(pay)}
              {!demo && isTestMode(pay) && <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: "#FEF3C7", color: "#92400E" }}>Test mode</span>}
            </p>
          </Stub>
        )}

        <Foot docType={docType} docNumber={invoice.invoiceNumber} companyName={company.name} pdfHref={`/pay/${invoice.publicToken}/pdf`} />
      </Sheet>
      <ChargeOverlay phase={charge} onDismiss={() => setCharge(null)} />
    </ClientRoot>
  );
}
