"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { signatureMatchesName } from "@/lib/signature";
import {
  ActionBar,
  Button,
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

export type PublicQuote = {
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
  contact: (ClientPerson & { firstName: string; lastName: string }) | null;
  company: ClientCompany & { name: string };
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

/**
 * The public quote — a sheet of the business's own stationery the client
 * reads, adjusts (optional items) and signs at the foot. Approval doesn't
 * leave the page: the stamp drops onto the sheet and the sign-off block
 * becomes the record of who signed and what happens next.
 *
 * `demo` (the /app/design/client gallery): actions succeed locally so the
 * approved moment can be watched without a server.
 */
export default function QuoteAcceptPage({
  quote,
  preview = false,
  expired: expiredProp,
  demo = false,
}: {
  quote: PublicQuote;
  preview?: boolean;
  /** Decided server-side in the company's timezone (lib/quote-expiry). */
  expired?: boolean;
  demo?: boolean;
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
    !preview && done === null && ["AWAITING_RESPONSE", "CHANGES_REQUESTED", "DRAFT"].includes(quote.status);
  // Signed off (converted = approved-then-scheduled): the paper still shows,
  // stamped, actions gone — the client keeps a viewable copy.
  const approved = done === "approved" || quote.status === "APPROVED" || quote.status === "CONVERTED";
  const changesSent = done === "changes";
  // Withdrawn by the business: the paper still shows (they may need the
  // numbers), stamped, and says so.
  const withdrawn = quote.status === "ARCHIVED";
  const expired = expiredProp ?? Boolean(quote.validUntil && new Date(quote.validUntil) < new Date());
  const signedBy = done === "approved" ? signatureName.trim() : quote.signatureName;
  const approvedAt = done === "approved" ? new Date().toISOString() : quote.approvedAt;

  // Live totals as the client toggles optional items
  const includedItems = quote.lineItems.filter((li) => !optedOut.includes(li.id));
  const subtotal = includedItems.reduce((s, li) => s + Number(li.total), 0);
  const discount =
    quote.discountType === "PERCENT"
      ? Math.round(subtotal * Number(quote.discountValue ?? 0)) / 100
      : quote.discountType === "FIXED"
        ? Math.min(Number(quote.discountValue ?? 0), subtotal)
        : 0;
  const tax = quote.taxRate ? Math.round((subtotal - discount) * Number(quote.taxRate) * 100) / 100 : 0;
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

  async function post(body: Record<string, unknown>): Promise<string | null> {
    if (demo) {
      await new Promise((r) => setTimeout(r, 500));
      return null;
    }
    try {
      const res = await fetch(`/api/public/quote/${quote.publicToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        return data?.error ?? "Something went wrong. Please try again.";
      }
      return null;
    } catch {
      return "Something went wrong. Please try again.";
    }
  }

  async function approve() {
    if (!signatureName.trim()) {
      setError("Please type your name to sign and approve.");
      return;
    }
    if (quote.contact && !signatureMatchesName(signatureName, quote.contact.firstName, quote.contact.lastName)) {
      setError(
        `This quote was prepared for ${quote.contact.firstName} ${quote.contact.lastName} — please sign with that name to approve.`
      );
      return;
    }
    setError("");
    setLoading(true);
    const err = await post({ action: "approve", signatureName, optedOutItemIds: optedOut });
    setLoading(false);
    if (err) return setError(err);
    setDone("approved");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function requestChanges() {
    if (!changeMessage.trim()) {
      setError("Tell us what you'd like changed.");
      return;
    }
    setError("");
    setLoading(true);
    const err = await post({ action: "request_changes", message: changeMessage });
    setLoading(false);
    if (err) return setError(err);
    setDone("changes");
  }

  const company = quote.company;
  const contactLine = [company.phone, company.email].filter(Boolean).join(" or ");
  const hasOptional = quote.lineItems.some((li) => li.isOptional);

  return (
    <ClientRoot brand={company}>
      {preview && <p className="c-preview">Preview — this is what your client sees. Actions are off.</p>}
      <Sheet>
        <Letterhead
          company={company}
          docType="Quote"
          docNumber={quote.quoteNumber}
          meta={[
            shortDate(quote.sentAt ?? quote.createdAt),
            quote.validUntil ? `Valid through ${shortDate(quote.validUntil)}` : null,
          ]}
        />

        <div className="mt-6 flex items-start justify-between gap-4">
          <PreparedFor person={quote.contact} />
          {(approved || withdrawn || (expired && !approved)) && (
            <div className="shrink-0 pt-1">
              {approved ? (
                <Stamp text="Approved" slam={done === "approved"} />
              ) : withdrawn ? (
                <Stamp text="Withdrawn" tone="muted" />
              ) : (
                <Stamp text="Expired" tone="muted" />
              )}
            </div>
          )}
        </div>

        {quote.title && <p className="c-title mt-6">{quote.title}</p>}
        {quote.clientMessage && <p className="c-body mt-3 whitespace-pre-wrap">{quote.clientMessage}</p>}

        <div className="mt-6">
          <ItemsHead />
          {quote.lineItems.map((li) => {
            const excluded = optedOut.includes(li.id);
            return (
              <ItemRow
                key={li.id}
                name={li.name || li.description}
                description={li.name ? li.description : null}
                qty={Number(li.quantity)}
                unit={Number(li.unitPrice)}
                amount={Number(li.total)}
                off={excluded}
                tag={li.isOptional ? (excluded ? "optional, not included" : "optional") : null}
                leading={
                  li.isOptional && !approved ? (
                    <input
                      type="checkbox"
                      className="c-check"
                      checked={!excluded}
                      onChange={() => toggleItem(li.id)}
                      disabled={!reviewable}
                      aria-label={`Include ${li.name || li.description}`}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </div>

        <Totals>
          <TRow
            label={hasOptional ? `Subtotal (${includedItems.length} of ${quote.lineItems.length} items)` : "Subtotal"}
            value={money(subtotal)}
          />
          {discount > 0 && (
            <TRow
              label={`Discount${quote.discountType === "PERCENT" ? ` (${Number(quote.discountValue)}%)` : ""}`}
              value={`−${money(discount)}`}
            />
          )}
          {tax > 0 && (
            <TRow
              label={`Tax${quote.taxRate ? ` (${(Number(quote.taxRate) * 100).toFixed(2).replace(/\.?0+$/, "")}%)` : ""}`}
              value={money(tax)}
            />
          )}
          <TRow label="Total" value={money(total)} kind="total" />
          {deposit > 0 && <TRow label="Deposit to get started" value={money(deposit)} />}
        </Totals>

        {quote.disclaimer && (
          <div className="mt-8">
            <Label>Terms</Label>
            <p className="c-small mt-1 whitespace-pre-wrap">{quote.disclaimer}</p>
          </div>
        )}

        {/* ── What happened to this quote, on the quote ── */}
        {approved && (
          <Receipt>
            <p className="c-receipt-line">
              <strong>Approved</strong>
              {signedBy ? <> — signed by <strong>{signedBy}</strong></> : null}
              {approvedAt ? ` on ${longDate(approvedAt)}` : ""}.
            </p>
            {done === "approved" && (
              <p className="c-receipt-line">
                {company.name} will be in touch to schedule the work.
                {deposit > 0 ? ` A deposit of ${money(deposit)} gets things started.` : ""}
              </p>
            )}
          </Receipt>
        )}

        {changesSent && (
          <Receipt>
            <p className="c-receipt-line">
              <strong>Changes requested.</strong> {company.name} will review your note and send an updated quote.
            </p>
          </Receipt>
        )}

        {withdrawn && (
          <Receipt>
            <p className="c-receipt-line">
              <strong>This quote was withdrawn</strong> by {company.name}, so it can&apos;t be approved here. If you still
              want the work, reach them{contactLine ? ` at ${contactLine}` : ""} for an updated one.
            </p>
          </Receipt>
        )}

        {/* ── Sign-off: the foot of the same sheet, like the signature line on a paper proposal ── */}
        {reviewable && (
          <Stub title={showChanges ? "What would you like changed?" : expired ? "This quote has expired" : "Approve this quote"}>
            {error && (
              <div className="mb-4">
                <Notice tone="bad">{error}</Notice>
              </div>
            )}

            {expired && !showChanges && (
              <>
                <Notice tone="warn">
                  Prices were good through {longDate(quote.validUntil!)}. Ask {company.name} for a fresh quote, or send a
                  note and they&apos;ll update this one.
                </Notice>
                <ActionBar>
                  <Button variant="outline" onClick={() => setShowChanges(true)}>
                    Send a note
                  </Button>
                </ActionBar>
              </>
            )}

            {!expired && !showChanges && (
              <>
                <label className="c-fieldlabel" htmlFor="signature">
                  Sign by typing your full name
                </label>
                <input
                  id="signature"
                  type="text"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder={quote.contact ? `${quote.contact.firstName} ${quote.contact.lastName}` : "Your full name"}
                  autoComplete="name"
                  className="c-field is-signature max-w-md"
                />
                <p className="c-hint">
                  {quote.contact
                    ? `Signing as ${quote.contact.firstName} ${quote.contact.lastName}. `
                    : ""}
                  Approving confirms the items and total above{deposit > 0 ? ` and the ${money(deposit)} deposit` : ""}.
                </p>
                <ActionBar>
                  <Button onClick={approve} disabled={loading}>
                    {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                    Approve · {money(total)}
                  </Button>
                  <Button variant="outline" onClick={() => setShowChanges(true)} disabled={loading}>
                    Request changes
                  </Button>
                </ActionBar>
              </>
            )}

            {showChanges && (
              <>
                <textarea
                  value={changeMessage}
                  onChange={(e) => setChangeMessage(e.target.value)}
                  rows={3}
                  className="c-field"
                  placeholder="Tell us what to adjust…"
                />
                <ActionBar>
                  <Button onClick={requestChanges} disabled={loading}>
                    {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                    Send request
                  </Button>
                  <Button variant="quiet" onClick={() => setShowChanges(false)} disabled={loading}>
                    Back
                  </Button>
                </ActionBar>
              </>
            )}
          </Stub>
        )}

        <Foot docType="Quote" docNumber={quote.quoteNumber} companyName={company.name} pdfHref={`/quote/${quote.publicToken}/pdf`} />
      </Sheet>
    </ClientRoot>
  );
}
