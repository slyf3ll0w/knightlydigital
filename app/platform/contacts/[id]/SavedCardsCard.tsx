"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, Plus, Trash2 } from "lucide-react";
import { confirmSheet } from "@/components/ConfirmSheet";
import { FINIX_JS_SRC, type FinixConfig, type FinixForm } from "@/lib/finix-js";

/**
 * Cards on file, staff side. Lists every saved card (default first) and — for
 * managers, when the company can take online payments — adds one right here:
 * the client hands their card over in person or reads it on the phone, the
 * browser tokenizes it with finix.js (the number never touches our server),
 * and it's vaulted without a charge. Same flow the client hub uses.
 */

type Card = { id: string; label: string; isDefault: boolean };

export default function SavedCardsCard({
  contactId,
  cards,
  canManage,
  finix,
}: {
  contactId: string;
  cards: Card[];
  canManage: boolean;
  finix: FinixConfig;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [formHasErrors, setFormHasErrors] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null); // card id, or "add"
  const [error, setError] = useState("");
  const formRef = useRef<FinixForm | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!finix || !adding) return;
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
  }, [finix, adding]);

  useEffect(() => {
    if (!finix || !adding || !scriptReady || !window.Finix || !containerRef.current) return;
    containerRef.current.innerHTML = "";
    setFormHasErrors(true);
    formRef.current = window.Finix.PaymentForm(
      containerRef.current,
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
  }, [finix, adding, scriptReady]);

  // Nothing on file and nothing addable — no card to render at all
  if (cards.length === 0 && !(canManage && finix)) return null;

  async function saveCard() {
    if (!formRef.current) return;
    setError("");
    setBusyId("add");
    formRef.current.submit(async (err, res) => {
      const paymentToken = res?.data?.id;
      if (err || !paymentToken) {
        setBusyId(null);
        setError("Please check the card details and try again.");
        return;
      }
      const r = await fetch(`/api/app/contacts/${contactId}/payment-method`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentToken }),
      });
      const data = await r.json().catch(() => null);
      setBusyId(null);
      if (!r.ok) {
        setError(data?.error ?? "Couldn't save the card. Please try again.");
        return;
      }
      setAdding(false);
      router.refresh();
    });
  }

  async function makeDefault(card: Card) {
    setBusyId(card.id);
    await fetch(`/api/app/contacts/${contactId}/payment-method`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id }),
    });
    setBusyId(null);
    router.refresh();
  }

  async function removeCard(card: Card) {
    if (
      !(await confirmSheet({
        title: "Remove this card?",
        message: `${card.label} will no longer be chargeable. The client can re-add it anytime.`,
        confirmLabel: "Remove",
        destructive: true,
      }))
    )
      return;
    setBusyId(card.id);
    await fetch(`/api/app/contacts/${contactId}/payment-method`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id }),
    });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="card-ledger p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold text-gray-500">Cards on file</h2>
        {canManage && finix && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs font-medium text-green-700 hover:underline"
          >
            <Plus size={12} />
            Add card
          </button>
        )}
      </div>

      {cards.length === 0 && !adding && (
        <p className="text-sm text-gray-400">
          No cards yet — add one here, or the client can save one when paying online.
        </p>
      )}

      {cards.length > 0 && (
        <div className="divide-y divide-gray-100">
          {cards.map((card) => (
            <div key={card.id} className="py-2.5 first:pt-0 flex items-center gap-3">
              <CreditCard size={16} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">{card.label}</p>
                {card.isDefault && cards.length > 1 && (
                  <p className="text-xs text-gray-400">Default</p>
                )}
              </div>
              {canManage && !card.isDefault && (
                <button
                  onClick={() => makeDefault(card)}
                  disabled={busyId !== null}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  Make default
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => removeCard(card)}
                  disabled={busyId !== null}
                  className="text-gray-300 hover:text-red-600 disabled:opacity-50"
                  title="Remove card"
                >
                  {busyId === card.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {error && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}
          <div ref={containerRef} />
          {!scriptReady && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
              <Loader2 size={13} className="animate-spin" />
              Loading secure card form…
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={saveCard}
              disabled={busyId !== null || !scriptReady || formHasErrors}
              className="flex-1 py-2 text-sm font-semibold rounded-[10px] bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busyId === "add" && <Loader2 size={13} className="animate-spin" />}
              Save card
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setError("");
              }}
              disabled={busyId !== null}
              className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-[10px] text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            Card details go straight to the payment processor — they never touch this
            server. No charge happens when you save.
          </p>
          {finix?.environment === "sandbox" && (
            <p className="mt-1 text-[11px] text-amber-600">Test mode — no real cards.</p>
          )}
        </div>
      )}
    </div>
  );
}
