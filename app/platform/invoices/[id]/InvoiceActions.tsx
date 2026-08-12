"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  DollarSign,
  Loader2,
  Copy,
  CopyPlus,
  MoreHorizontal,
  Eye,
  Pencil,
  RotateCcw,
  Trash2,
  AlertTriangle,
  FileDown,
  Archive,
  X,
  CreditCard,
} from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import Modal from "@/components/Modal";
import { money } from "@/lib/statuses";
import { confirmSheet, alertSheet } from "@/components/ConfirmSheet";
import { hapticImpact } from "@/lib/haptics";
import ChargeOverlay, { type ChargePhase } from "@/components/ChargeOverlay";
import { showSendRitual } from "@/lib/send-ritual";
import { FINIX_JS_SRC, type FinixConfig, type FinixForm } from "@/lib/finix-js";

type SavedCardOption = { id: string; label: string; isDefault: boolean };

export default function InvoiceActions({
  invoiceId,
  status,
  publicUrl,
  canDelete = false,
  paymentCount = 0,
  paymentTotal = 0,
  contactEmail = "",
  chargeStoredLabel = null,
  savedCards = [],
  balance = 0,
  reopenStatus = "DRAFT",
  contactId = "",
  finix = null,
}: {
  invoiceId: string;
  status: string;
  publicUrl: string;
  canDelete?: boolean;
  paymentCount?: number;
  paymentTotal?: number;
  contactEmail?: string;
  /** Default-card label when this invoice can be charged to a card on file. */
  chargeStoredLabel?: string | null;
  /** Every card on the client's file — a picker shows when there's a choice. */
  savedCards?: SavedCardOption[];
  balance?: number;
  /** Where "Reopen" lands an archived invoice (computed from its payments). */
  reopenStatus?: string;
  /** The invoice's client — needed to vault a NEW card at charge time. */
  contactId?: string;
  /** finix.js config when the company can tokenize cards staff-side. */
  finix?: FinixConfig;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [charge, setCharge] = useState<ChargePhase | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickedId, setPickedId] = useState<string>("");
  // New-card entry inside the charge dialog (finix.js tokenization, same
  // pattern as the contact page's SavedCardsCard — numbers never touch us)
  const [scriptReady, setScriptReady] = useState(false);
  const [formHasErrors, setFormHasErrors] = useState(true);
  const [savingCard, setSavingCard] = useState(false);
  const [cardError, setCardError] = useState("");
  // Keeping the new card on file is the client's choice, not a side effect —
  // same opt-in default as the public /pay page
  const [saveNewCard, setSaveNewCard] = useState(false);
  const finixFormRef = useRef<FinixForm | null>(null);
  const finixContainerRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  // The chargeable options: SavedCard rows, or the legacy single-card mirror
  const cardOptions: SavedCardOption[] =
    savedCards.length > 0
      ? savedCards
      : chargeStoredLabel
        ? [{ id: "", label: chargeStoredLabel, isDefault: true }]
        : [];
  const canNewCard = Boolean(finix && contactId);
  const canChargeCard = balance > 0 && (cardOptions.length > 0 || canNewCard);

  useEffect(() => {
    if (!finix || !pickOpen || pickedId !== "new") return;
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
  }, [finix, pickOpen, pickedId]);

  useEffect(() => {
    if (!finix || !pickOpen || pickedId !== "new" || !scriptReady || !window.Finix || !finixContainerRef.current)
      return;
    finixContainerRef.current.innerHTML = "";
    setFormHasErrors(true);
    finixFormRef.current = window.Finix.PaymentForm(
      finixContainerRef.current,
      finix.environment,
      finix.applicationId,
      {
        paymentMethods: ["card"],
        showLabels: true,
        showPlaceholders: true,
        showAddress: false,
        requiredFields: ["card_holder_name"],
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
      }
    );
  }, [finix, pickOpen, pickedId, scriptReady]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Sent confirmation auto-dismisses — on mobile it floats as a pill above
  // the tab bar instead of crowding the action row
  useEffect(() => {
    if (!sentTo) return;
    const t = setTimeout(() => setSentTo(""), 6000);
    return () => clearTimeout(t);
  }, [sentTo]);

  async function setStatus(newStatus: string) {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/app/invoices/${invoiceId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alertSheet({ message: data?.error ?? "Couldn't update the invoice." });
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Duplicate into a fresh draft and jump straight to it
  async function duplicateInvoice() {
    setOpen(false);
    const res = await fetch(`/api/app/invoices/${invoiceId}/duplicate`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.id) {
      alertSheet({ message: data?.error ?? "Couldn't duplicate the invoice." });
      return;
    }
    router.push(`/app/invoices/${data.id}`);
  }

  // Archive shelves the invoice without touching its payments — the
  // paper-trail-preserving alternative to Delete.
  async function archive() {
    setOpen(false);
    const ok = await confirmSheet({
      title: "Archive this invoice?",
      message:
        "It moves out of your invoice list and stops payment reminders. Payments already recorded stay. You can reopen it anytime.",
      confirmLabel: "Archive Invoice",
    });
    if (ok) await setStatus("ARCHIVED");
  }

  // Charge the remaining balance to a card: the dialog lists the client's
  // saved cards plus "New card" (tokenized in place), and its Charge button
  // IS the confirmation — amount and card are both on screen.
  function openChargeDialog() {
    setOpen(false);
    setCardError("");
    setSaveNewCard(false);
    setPickedId(
      cardOptions.find((c) => c.isDefault)?.id ??
        cardOptions[0]?.id ??
        (canNewCard ? "new" : "")
    );
    setPickOpen(true);
  }

  function chargeSelected() {
    if (pickedId === "new") {
      if (!finixFormRef.current) return;
      setCardError("");
      setSavingCard(true);
      finixFormRef.current.submit(async (err, res) => {
        const paymentToken = res?.data?.id;
        setSavingCard(false);
        if (err || !paymentToken) {
          setCardError("Please check the card details and try again.");
          return;
        }
        // The charge route token-charges directly; the card is only kept on
        // the client's file when the save box was ticked (their choice, same
        // opt-in as the public pay page).
        runCharge({ paymentToken, saveCard: saveNewCard }, "new card");
      });
      return;
    }
    const card = cardOptions.find((c) => c.id === pickedId);
    if (card) runCharge(card.id ? { cardId: card.id } : {}, card.label);
  }

  // The terminal ritual: processing overlay (minimum on-screen beat so even
  // instant responses read as a real charge), then approved / declined.
  async function runCharge(
    payload: { cardId?: string; paymentToken?: string; saveCard?: boolean },
    label: string
  ) {
    setPickOpen(false);
    setCharge({ state: "processing", label, amount: balance });
    const started = Date.now();
    let res: Response | null = null;
    let data: { error?: string; amount?: number } | null = null;
    try {
      res = await fetch(`/api/app/invoices/${invoiceId}/charge-stored`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      data = await res.json().catch(() => null);
    } catch {
      res = null;
    }
    await new Promise((r) => setTimeout(r, Math.max(0, 1100 - (Date.now() - started))));
    if (!res || !res.ok) {
      setCharge({
        state: "declined",
        label,
        amount: balance,
        error: data?.error ?? GENERIC_ERROR,
      });
      return;
    }
    hapticImpact();
    setCharge({ state: "approved", label, amount: data?.amount ?? balance });
    setTimeout(() => {
      setCharge(null);
      router.refresh();
    }, 1800);
  }

  // Email the client their pay link (DRAFT invoices move to Awaiting Payment)
  async function emailToClient() {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/app/invoices/${invoiceId}/send`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alertSheet({ message: data?.error ?? "Couldn't send the invoice." });
        return;
      }
      setSentTo(data?.to ?? contactEmail);
      hapticImpact("LIGHT");
      // Body-attached on purpose — the refresh below swaps the action
      // buttons and would kill any overlay held in this component's state
      showSendRitual(data?.to ?? contactEmail);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function doDelete(force: boolean) {
    setBusy(true);
    setDeleteError("");
    const { ok, data } = await postJson(
      `/api/app/invoices/${invoiceId}${force ? "?force=1" : ""}`,
      undefined,
      "DELETE"
    );
    setBusy(false);
    if (!ok) {
      setDeleteError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.push("/app/invoices");
    router.refresh();
  }

  async function onDeleteClick() {
    setOpen(false);
    setDeleteError("");
    if (paymentCount === 0) {
      if (
        await confirmSheet({
          title: "Permanently delete this invoice?",
          message: "This can't be undone.",
          confirmLabel: "Delete Invoice",
          destructive: true,
        })
      )
        doDelete(false);
      return;
    }
    setConfirmText("");
    setDeleteOpen(true);
  }

  return (
    <div className="flex items-center gap-2 shrink-0" ref={ref}>
      {busy && <Loader2 size={16} className="animate-spin text-gray-400" />}

      {sentTo && (
        // Floating pill on every screen size (desktop used to demote it to
        // inline text); outer span owns the centering so the entrance
        // animation's transform doesn't fight -translate-x-1/2
        <span className="fixed left-1/2 -translate-x-1/2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-8 z-40 max-w-[calc(100vw-2rem)]">
          <span className="msg-enter block truncate rounded-full bg-gray-900/95 px-4 py-2 text-xs font-medium text-white shadow-lg">
            Emailed to {sentTo}
          </span>
        </span>
      )}

      {status === "DRAFT" &&
        (contactEmail ? (
          <button
            onClick={emailToClient}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
          >
            <Send size={13} />
            Email to Client
          </button>
        ) : (
          <button
            onClick={() => setStatus("AWAITING_PAYMENT")}
            title="No client email on file — this only marks the invoice as sent"
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
          >
            <Send size={13} />
            Mark as Sent
          </button>
        ))}
      {(status === "AWAITING_PAYMENT" || status === "PAST_DUE") &&
        (canChargeCard ? (
          <button
            onClick={openChargeDialog}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
          >
            <CreditCard size={13} />
            Charge Card
          </button>
        ) : (
          <button
            onClick={() => router.push(`/app/payments/new?invoiceId=${invoiceId}`)}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
          >
            <DollarSign size={13} />
            Collect Payment
          </button>
        ))}
      {status === "PAID" && (
        <button
          onClick={() => setStatus("AWAITING_PAYMENT")}
          className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors"
        >
          <RotateCcw size={13} />
          Re-open Invoice
        </button>
      )}

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-2 btn-tool-line bg-white rounded-[10px] text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <MoreHorizontal size={16} />
        </button>
        {open && (
          <div className="sheet-material absolute right-0 top-full mt-1 z-30 w-max min-w-[13rem] whitespace-nowrap rounded-lg shadow-xl border border-gray-200 py-1.5">
            {status !== "PAID" && (
              <button
                onClick={() => router.push(`/app/invoices/${invoiceId}/edit`)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Pencil size={14} className="text-gray-400" />
                Edit Invoice
              </button>
            )}
            <a
              href={`${publicUrl}?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Eye size={14} className="text-gray-400" />
              Preview as Client
            </a>
            <button
              onClick={copyLink}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Copy size={14} className="text-gray-400" />
              {copied ? "Copied!" : "Copy payment link"}
            </button>
            <a
              href={`/api/app/invoices/${invoiceId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileDown size={14} className="text-gray-400" />
              Download PDF
            </a>
            {canChargeCard && status !== "AWAITING_PAYMENT" && status !== "PAST_DUE" && (
              <button
                onClick={openChargeDialog}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <CreditCard size={14} className="text-gray-400" />
                <span className="truncate">
                  {chargeStoredLabel ? `Charge card on file (${chargeStoredLabel})` : "Charge a card"}
                </span>
              </button>
            )}
            <button
              onClick={duplicateInvoice}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <CopyPlus size={14} className="text-gray-400" />
              Duplicate Invoice
            </button>
            {contactEmail && status === "DRAFT" && (
              <button
                onClick={() => setStatus("AWAITING_PAYMENT")}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Send size={14} className="text-gray-400" />
                Mark as Sent (no email)
              </button>
            )}
            {contactEmail && (status === "AWAITING_PAYMENT" || status === "PAST_DUE") && (
              <button
                onClick={emailToClient}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Send size={14} className="text-gray-400" />
                Email to client again
              </button>
            )}
            {status !== "PAID" && (
              <>
                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={() => router.push(`/app/payments/new?invoiceId=${invoiceId}`)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <DollarSign size={14} className="text-gray-400" />
                  {canChargeCard ? "Collect other payment" : "Collect Payment"}
                </button>
              </>
            )}
            <div className="my-1 border-t border-gray-100" />
            {status === "ARCHIVED" ? (
              <button
                onClick={() => setStatus(reopenStatus)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <RotateCcw size={14} className="text-gray-400" />
                Reopen Invoice
              </button>
            ) : (
              <button
                onClick={archive}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Archive size={14} className="text-gray-400" />
                Archive
              </button>
            )}
            {canDelete && (
              <button
                onClick={onDeleteClick}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} />
                Delete Invoice
              </button>
            )}
          </div>
        )}
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => !busy && setDeleteOpen(false)}
        cardClassName="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        {deleteOpen && (
          <>
            <div className="flex items-start justify-between mb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle size={17} className="text-red-600" />
              </span>
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={busy}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-1">Delete this invoice?</h2>
            <p className="text-sm text-gray-600 mb-3">
              It has{" "}
              <span className="font-semibold text-gray-900">
                {paymentCount} recorded {paymentCount === 1 ? "payment" : "payments"} totaling{" "}
                {money(paymentTotal)}
              </span>
              {" "}— those records are deleted with it, and your revenue history changes. There is
              no undo.
            </p>

            <label className="block text-xs text-gray-500 mb-1">
              Type <span className="font-semibold text-gray-700">DELETE</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
            />

            {deleteError && <p className="text-xs text-red-600 mb-3">{deleteError}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full"
              >
                Cancel
              </button>
              <button
                onClick={() => doDelete(true)}
                disabled={confirmText.trim().toUpperCase() !== "DELETE" || busy}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-40"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete Invoice
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={pickOpen}
        onClose={() => !savingCard && setPickOpen(false)}
        cardClassName="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        {pickOpen && (
          <>
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900">Charge Card</h2>
              <button
                onClick={() => setPickOpen(false)}
                disabled={savingCard}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 mb-4">
              {cardOptions.map((card) => (
                <label
                  key={card.id || "legacy"}
                  className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 cursor-pointer transition-colors ${
                    pickedId === card.id
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="charge-card"
                    checked={pickedId === card.id}
                    onChange={() => setPickedId(card.id)}
                    className="accent-green-600"
                  />
                  <span className="flex-1 text-sm text-gray-800">{card.label}</span>
                  {card.isDefault && cardOptions.length > 1 && (
                    <span className="text-xs text-gray-400">Default</span>
                  )}
                </label>
              ))}
              {canNewCard && (
                <label
                  className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 cursor-pointer transition-colors ${
                    pickedId === "new"
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="charge-card"
                    checked={pickedId === "new"}
                    onChange={() => setPickedId("new")}
                    className="accent-green-600"
                  />
                  <span className="flex-1 text-sm text-gray-800 flex items-center gap-2">
                    <CreditCard size={14} className="text-gray-400" />
                    New card…
                  </span>
                </label>
              )}
            </div>

            {pickedId === "new" && (
              <div className="mb-4">
                {cardError && (
                  <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {cardError}
                  </div>
                )}
                <div ref={finixContainerRef} />
                {!scriptReady && (
                  <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
                    <Loader2 size={13} className="animate-spin" />
                    Loading secure card form…
                  </div>
                )}
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-600 select-none cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={saveNewCard}
                    onChange={(e) => setSaveNewCard(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  Save this card to the client&apos;s file for next time
                </label>
                <p className="mt-2 text-[11px] text-gray-400">
                  Card details go straight to the payment processor — they never touch this
                  server.
                </p>
                {finix?.environment === "sandbox" && (
                  <p className="mt-1 text-[11px] text-amber-600">Test mode — no real cards.</p>
                )}
              </div>
            )}

            <button
              onClick={chargeSelected}
              disabled={
                savingCard ||
                !pickedId ||
                (pickedId === "new" && (!scriptReady || formHasErrors))
              }
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-40"
            >
              {savingCard ? <Loader2 size={13} className="animate-spin" /> : <DollarSign size={13} />}
              Charge {money(balance)}
            </button>
            <p className="mt-2 text-center text-[11px] text-gray-400">
              Charged right now — no card surcharge on stored charges.
            </p>
          </>
        )}
      </Modal>

      <ChargeOverlay phase={charge} onDismiss={() => setCharge(null)} />
    </div>
  );
}
