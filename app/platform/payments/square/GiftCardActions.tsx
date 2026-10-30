"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Gift, Loader2, Search } from "lucide-react";
import Modal from "@/components/Modal";
import ContactPicker, { type PickerContact } from "@/components/ContactPicker";
import { Chip } from "@/components/ds";
import { money } from "@/lib/statuses";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { toast } from "@/lib/toast";
import { giftCardState } from "./labels";

const QUICK_AMOUNTS = [25, 50, 100, 200];

/**
 * The two buttons above the gift card list: Sell a gift card (amount, who it
 * is for, the client paying) → an invoice + pay link the buyer pays; Check a
 * balance (type the number). Managers sell; anyone who sees money can check.
 */
export default function GiftCardActions({ canSell, contacts }: { canSell: boolean; contacts: PickerContact[] }) {
  const router = useRouter();
  const [sellOpen, setSellOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);

  // Sell
  const [amountText, setAmountText] = useState("50");
  const [contactId, setContactId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sold, setSold] = useState<{ payUrl: string; invoiceId: string; invoiceNumber: number; amountCents: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const amountCents = Math.round((Number(amountText) || 0) * 100);

  // Check
  const [gan, setGan] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [found, setFound] = useState<{ tail: string; state: string; balanceCents: number } | null>(null);

  function resetSell() {
    setAmountText("50");
    setContactId("");
    setRecipientName("");
    setRecipientEmail("");
    setMessage("");
    setError(null);
    setSold(null);
    setCopied(false);
  }

  async function sell() {
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await postJson<{ payUrl: string; invoiceId: string; invoiceNumber: number; amountCents: number }>("/api/app/payments/square/gift-cards", {
        amountCents,
        contactId: contactId || null,
        recipientName: recipientName || null,
        recipientEmail: recipientEmail || null,
        message: message || null,
      });
      if (!ok || !data) {
        setError(data?.error ?? GENERIC_ERROR);
        return;
      }
      setSold(data);
      toast("Gift card ready — send the pay link");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setChecking(true);
    setCheckError(null);
    setFound(null);
    try {
      const res = await fetch(`/api/app/payments/square/gift-cards/lookup?gan=${encodeURIComponent(gan)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setCheckError(data?.error ?? GENERIC_ERROR);
        return;
      }
      setFound(data.giftCard);
    } catch {
      setCheckError(GENERIC_ERROR);
    } finally {
      setChecking(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is on screen */
    }
  }

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSell && (
        <button type="button" className="btn-primary" onClick={() => (resetSell(), setSellOpen(true))}>
          <Gift size={14} /> Sell a gift card
        </button>
      )}
      <button type="button" className="btn-secondary" onClick={() => (setGan(""), setFound(null), setCheckError(null), setCheckOpen(true))}>
        <Search size={14} /> Check a balance
      </button>

      <Modal open={sellOpen} onClose={() => !busy && setSellOpen(false)}>
        {sellOpen && !sold && (
          <div className="ds">
            <h2 className="ds-h2">Sell a gift card</h2>
            <p className="ds-body mt-1">The buyer pays an ordinary invoice. When it&apos;s paid, the card loads and the recipient gets the number by email.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Amount</label>
                <div className="flex flex-wrap items-center gap-2">
                  {QUICK_AMOUNTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAmountText(String(a))}
                      className={`rounded-full border px-3 py-1 text-sm ${Number(amountText) === a ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)] font-semibold" : "border-gray-300"}`}
                    >
                      ${a}
                    </button>
                  ))}
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                    <input value={amountText} onChange={(e) => setAmountText(e.target.value)} inputMode="decimal" className={`${field} numeral-ledger w-28 pl-6`} aria-label="Amount" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Who&apos;s paying (optional)</label>
                <ContactPicker contacts={contacts} value={contactId} onChange={setContactId} placeholder="A client, or leave blank for a walk-up" allowCreate={false} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Recipient&apos;s name (optional)</label>
                  <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className={field} placeholder="Who it's for" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Send the card number to</label>
                  <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} type="email" className={field} placeholder={contactId ? "The client's email, unless you add one" : "email@example.com"} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">A note in the email (optional)</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className={field} placeholder="Happy birthday!" />
              </div>
              <p className="text-[11px] text-gray-400">Square keeps 2.5% of each load as its gift card fee. The buyer&apos;s invoice carries no sales tax.</p>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-[color:var(--ds-bad)]">
                {error}
              </p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full" onClick={() => setSellOpen(false)} disabled={busy}>
                Not now
              </button>
              <button type="button" className="btn-primary" onClick={sell} disabled={busy || amountCents < 500}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
                Create {amountCents >= 500 ? money(amountCents / 100) : ""} gift card
              </button>
            </div>
          </div>
        )}
        {sellOpen && sold && (
          <div className="ds">
            <h2 className="ds-h2">Gift card created</h2>
            <p className="ds-body mt-1">
              Invoice #{sold.invoiceNumber} for {money(sold.amountCents / 100)} is ready. Send the buyer the pay link — or open the invoice to charge a card, take Tap to Pay, or record cash.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{sold.payUrl}</span>
              <button type="button" className="btn-secondary btn-sm" onClick={() => copy(sold.payUrl)}>
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full" onClick={() => setSellOpen(false)}>
                Done
              </button>
              <a href={`/app/invoices/${sold.invoiceId}`} className="btn-primary">
                Open invoice
              </a>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={checkOpen} onClose={() => !checking && setCheckOpen(false)}>
        {checkOpen && (
          <div className="ds">
            <h2 className="ds-h2">Check a balance</h2>
            <p className="ds-body mt-1">Type the number on the card or in the email.</p>
            <form
              className="mt-4 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void check();
              }}
            >
              <input value={gan} onChange={(e) => setGan(e.target.value)} inputMode="numeric" autoFocus className={`${field} numeral-ledger tracking-wider`} placeholder="7783 3200 0000 0000" aria-label="Gift card number" />
              <button type="submit" className="btn-primary" disabled={checking || gan.replace(/\D/g, "").length < 10}>
                {checking ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Check
              </button>
            </form>
            {checkError && (
              <p role="alert" className="mt-3 text-sm text-[color:var(--ds-bad)]">
                {checkError}
              </p>
            )}
            {found && (
              <div className="mt-4 rounded-lg border border-gray-200 px-4 py-3">
                <p className="ds-label">Card {found.tail}</p>
                <p className="numeral-ledger mt-1 text-2xl font-semibold text-gray-900">{money(found.balanceCents / 100)}</p>
                <p className="mt-1">
                  <Chip tone={giftCardState(found.state).tone}>{giftCardState(found.state).label}</Chip>
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
