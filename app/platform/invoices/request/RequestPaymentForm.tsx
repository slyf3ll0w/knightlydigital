"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Mail, MessageSquare, Smartphone } from "lucide-react";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import ContactPicker, { type PickerContact } from "@/components/ContactPicker";
import { InfoTip } from "@/components/ds";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { money } from "@/lib/statuses";
import { fmtPhone } from "@/lib/format";
import { hapticImpact } from "@/lib/haptics";
import { parseDollars, quickChargeIssue, QUICK_CHARGE_DESCRIPTION_MAX, QUICK_CHARGE_MAX } from "@/lib/quick-charge";
import type { TapToPayOffer } from "@/lib/tap-to-pay-shared";
import TapToPayButton from "@/components/TapToPayButton";

type Created = {
  invoice: { id: string; invoiceNumber: number; publicToken: string; total: number };
  payUrl: string;
  qrSvg: string;
  contact: { id: string; name: string; email: string; phone: string; canText: boolean } | null;
};

const inputCls =
  "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";

/**
 * Two steps on one card: the ask (amount · what for · who), then the share
 * step (link, Copy / Text / Email, QR, Tap to Pay in the phone app). The
 * invoice exists the moment Get link succeeds — leaving the page loses
 * nothing, it is on the Invoices list as "Payment request".
 */
export default function RequestPaymentForm({
  contacts,
  initialContactId,
  tapToPay,
}: {
  contacts: PickerContact[];
  initialContactId: string;
  tapToPay: TapToPayOffer;
}) {
  const router = useRouter();
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [contactId, setContactId] = useState(initialContactId);
  const [extraContacts, setExtraContacts] = useState<PickerContact[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [message, setMessage] = useState("");
  const [taxPercent, setTaxPercent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState<"" | "text" | "email">("");
  const [sent, setSent] = useState("");
  const [paid, setPaid] = useState(false);

  const amount = parseDollars(amountText);
  const liveIssue = amountText || description ? quickChargeIssue({ amount, description }) : null;
  const taxRate = Number(taxPercent) > 0 ? Number(taxPercent) / 100 : 0;
  const total = Number.isFinite(amount) ? Math.round(amount * (1 + taxRate) * 100) / 100 : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const issue = quickChargeIssue({ amount, description });
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    setBusy(true);
    const { ok, data } = await postJson<Created & { error?: string }>("/api/app/invoices/quick-charge", {
      amount,
      description: description.trim(),
      contactId: contactId || null,
      message: message.trim() || undefined,
      taxRate: taxRate || undefined,
    });
    setBusy(false);
    if (!ok || !data?.invoice) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    hapticImpact("MEDIUM");
    setCreated(data);
  }

  async function copyLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.payUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — long-press the link to copy it.");
    }
  }

  async function send(channel: "text" | "email") {
    if (!created) return;
    setSending(channel);
    setError("");
    const { ok, data } = await postJson<{ error?: string }>(`/api/app/invoices/${created.invoice.id}/send`, {
      email: channel === "email",
      text: channel === "text",
    });
    setSending("");
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    hapticImpact("LIGHT");
    setSent(
      channel === "text"
        ? `Texted ${fmtPhone(created.contact?.phone ?? "")}`
        : `Emailed ${created.contact?.email ?? ""}`
    );
  }

  function startOver() {
    setCreated(null);
    setAmountText("");
    setDescription("");
    setMessage("");
    setTaxPercent("");
    setSent("");
    setPaid(false);
    setError("");
  }

  const allContacts = extraContacts.length ? [...extraContacts, ...contacts] : contacts;

  if (created) {
    const c = created.contact;
    return (
      <div className="p-4 lg:p-8 max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <BackLink href="/app/invoices" />
          <PageTitle
            sub={`${money(created.invoice.total)} · #${created.invoice.invoiceNumber}${c ? ` · ${c.name}` : ""}`}
            info="The link is live now and stays open until it is paid. It is on your Invoices list as a payment request, so you can find it, edit it or write it off later like any invoice."
          >
            {paid ? "Paid" : "Share the pay link"}
          </PageTitle>
        </div>

        <div className="ds-card p-5 space-y-5">
          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}
          {sent && (
            <p className="flex items-center gap-2 text-sm text-[color:var(--ds-good)]">
              <Check size={15} /> {sent}
            </p>
          )}

          {tapToPay && !paid && (
            <TapToPayButton
              invoiceId={created.invoice.id}
              amount={created.invoice.total}
              label={`#${created.invoice.invoiceNumber} · ${description.trim()}`}
              offer={tapToPay}
              onPaid={() => {
                setPaid(true);
                router.refresh();
              }}
              className="w-full btn-primary btn-lg justify-center"
            />
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Pay link</label>
            <div className="flex items-center gap-2">
              <input readOnly value={created.payUrl} onFocus={(e) => e.currentTarget.select()} className={`${inputCls} font-mono text-xs`} />
              <button type="button" onClick={copyLink} className="btn-secondary shrink-0">
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => send("text")}
              disabled={!c?.canText || sending !== ""}
              className="btn-secondary"
              title={c?.canText ? `Texts ${fmtPhone(c.phone)} from your business line` : undefined}
            >
              {sending === "text" ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
              Text it
            </button>
            <button
              type="button"
              onClick={() => send("email")}
              disabled={!c?.email || sending !== ""}
              className="btn-secondary"
              title={c?.email ? `Emails ${c.email}` : undefined}
            >
              {sending === "email" ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
              Email it
            </button>
            {(!c || !c.canText || !c.email) && (
              <InfoTip label="Why are some greyed out?">
                {!c
                  ? "No client on this request, so there is nobody to text or email. Copy the link, or let them scan the code."
                  : !c.canText && !c.email
                    ? "This client has no email and can't be texted (no phone, opted out, or texting isn't on for your business line). Copy the link or let them scan the code."
                    : !c.canText
                      ? "Texting needs a phone on file, no opt-out, and an active business line."
                      : "Emailing needs an email on file."}
              </InfoTip>
            )}
          </div>

          {created.qrSvg && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <div
                className="w-44 h-44 lg:w-52 lg:h-52 rounded-xl bg-white p-2 border border-gray-200 [&>svg]:w-full [&>svg]:h-full"
                aria-label="QR code for the pay link"
                dangerouslySetInnerHTML={{ __html: created.qrSvg }}
              />
              <p className="flex items-center gap-1.5 text-xs text-gray-500">
                <Smartphone size={12} /> They can scan this with their phone camera
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
            <Link href={`/app/invoices/${created.invoice.id}`} className="ds-btn ds-btn-outline">
              Open invoice
            </Link>
            <button type="button" onClick={startOver} className="ds-link text-sm">
              New request
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BackLink href="/app/invoices" />
        <PageTitle info="A payment request is an invoice without the editor: one amount, one line. You get a pay link to text, email or have scanned, and the payment lands in your reports like any other.">
          Request payment
        </PageTitle>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}

        <div className="ds-card p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-gray-400">$</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="0.00"
                className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl text-3xl font-semibold numeral-ledger focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">What for</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, QUICK_CHARGE_DESCRIPTION_MAX))}
              placeholder="Filter swap, service call, balance due…"
              className={inputCls}
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
              Client
              <InfoTip>
                Optional. Leave it empty to charge someone who isn&apos;t a client yet — the link is then the only way to pay it. With a client picked you can text or email the link, and the payment shows on their record.
              </InfoTip>
            </label>
            <ContactPicker
              contacts={allContacts}
              value={contactId}
              onChange={setContactId}
              placeholder="No client — just a link"
              onCreated={(c) => setExtraContacts((xs) => [c, ...xs])}
            />
            {contactId && (
              <button type="button" onClick={() => setContactId("")} className="ds-link text-xs mt-1">
                Clear
              </button>
            )}
          </div>

          {showMore ? (
            <div className="space-y-4 pt-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note on the pay page</label>
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Thanks for having us out today"
                  className={inputCls}
                />
              </div>
              <div className="max-w-[10rem]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax %</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="30"
                  step="0.01"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowMore(true)} className="ds-link text-sm">
              + Note or tax
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {liveIssue ? (
              <span className="text-[color:var(--ds-warn)]">{liveIssue}</span>
            ) : total > 0 ? (
              <>
                Total <span className="numeral-ledger font-semibold text-gray-900">{money(total)}</span>
                {taxRate > 0 ? " incl. tax" : ""}
              </>
            ) : (
              `Up to ${money(QUICK_CHARGE_MAX)}`
            )}
          </p>
          <button type="submit" disabled={busy || Boolean(liveIssue) || !amountText || !description.trim()} className="btn-primary btn-lg">
            {busy && <Loader2 size={14} className="animate-spin" />}
            Get link
          </button>
        </div>
      </form>
    </div>
  );
}
