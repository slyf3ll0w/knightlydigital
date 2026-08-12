"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, Trash2 } from "lucide-react";
import { confirmSheet } from "@/components/ConfirmSheet";

/**
 * finix.js card tokenization form — same mount pattern as the public pay page,
 * but the token is exchanged into a vaulted instrument with NO charge. Lists
 * every saved card; the default is the one charged unless staff pick another.
 */

import { FINIX_JS_SRC, type FinixConfig, type FinixForm } from "@/lib/finix-js";

type Card = { id: string; label: string; isDefault: boolean };

export default function SavedCardManager({
  token,
  companyName,
  cards,
  finix,
}: {
  token: string;
  companyName: string;
  cards: Card[];
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

  async function saveCard() {
    if (!formRef.current) return;
    setError("");
    setBusyId("add");
    formRef.current.submit(async (err, res) => {
      const paymentToken = res?.data?.id;
      if (err || !paymentToken) {
        setBusyId(null);
        setError("Please check your card details and try again.");
        return;
      }
      const r = await fetch("/api/hub/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, paymentToken }),
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
    await fetch("/api/hub/payment-method", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, cardId: card.id }),
    });
    setBusyId(null);
    router.refresh();
  }

  async function removeCard(card: Card) {
    if (
      !(await confirmSheet({
        title: "Remove this card?",
        message: `${card.label} will be removed from your account with ${companyName}.`,
        confirmLabel: "Remove",
        destructive: true,
      }))
    )
      return;
    setBusyId(card.id);
    await fetch("/api/hub/payment-method", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, cardId: card.id }),
    });
    setBusyId(null);
    router.refresh();
  }

  if (!finix) {
    return (
      <div className="card-ledger p-5 text-sm text-gray-500">
        {companyName} isn&apos;t set up for online payments yet, so cards can&apos;t be
        saved here. Check back soon.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cards.length > 0 && (
        <div className="card-ledger divide-y divide-gray-100">
          {cards.map((card) => (
            <div key={card.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <CreditCard size={18} className="text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{card.label}</p>
                <p className="text-xs text-gray-500">
                  {card.isDefault ? "Default — used for automatic charges" : "On file"}
                </p>
              </div>
              {!card.isDefault && (
                <button
                  onClick={() => makeDefault(card)}
                  disabled={busyId !== null}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 btn-tool-line bg-white rounded-[9px] hover:text-gray-900 transition-colors disabled:opacity-50"
                >
                  Make default
                </button>
              )}
              <button
                onClick={() => removeCard(card)}
                disabled={busyId !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                {busyId === card.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full py-3 text-sm font-semibold btn-tool-line bg-white rounded-[10px] text-gray-700 hover:text-gray-900 transition-colors"
        >
          {cards.length > 0 ? "Add another card" : "Add a card"}
        </button>
      ) : (
        <div className="card-ledger p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Add a card</h3>
          {error && (
            <div className="mb-3 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
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
          <div className="flex gap-2 mt-4">
            <button
              onClick={saveCard}
              disabled={busyId !== null || !scriptReady || formHasErrors}
              className="flex-1 py-2.5 text-sm font-semibold rounded-[10px] btn-tool bg-green-500 hover:bg-green-600 active:bg-green-700 text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
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
              className="px-4 py-2.5 text-sm font-medium btn-tool-line bg-white rounded-[10px] text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="mt-3 text-[11px] text-gray-400">
            Your card details go directly to the payment processor — {companyName} never
            sees the full number. No charge happens when you save.
          </p>
          {finix.environment === "sandbox" && (
            <p className="mt-1 text-[11px] text-amber-600">Test mode — no real cards.</p>
          )}
        </div>
      )}
    </div>
  );
}
