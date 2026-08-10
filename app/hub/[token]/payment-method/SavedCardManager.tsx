"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, Trash2 } from "lucide-react";

/**
 * finix.js card tokenization form — same mount pattern as the public pay page,
 * but the token is exchanged into a vaulted instrument with NO charge.
 */

import { FINIX_JS_SRC, type FinixConfig, type FinixForm } from "@/lib/finix-js";

export default function SavedCardManager({
  token,
  companyName,
  savedLabel,
  finix,
}: {
  token: string;
  companyName: string;
  savedLabel: string | null;
  finix: FinixConfig;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [formHasErrors, setFormHasErrors] = useState(true);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    formRef.current.submit(async (err, res) => {
      const paymentToken = res?.data?.id;
      if (err || !paymentToken) {
        setBusy(false);
        setError("Please check your card details and try again.");
        return;
      }
      const r = await fetch("/api/hub/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, paymentToken }),
      });
      const data = await r.json().catch(() => null);
      setBusy(false);
      if (!r.ok) {
        setError(data?.error ?? "Couldn't save the card. Please try again.");
        return;
      }
      setAdding(false);
      router.refresh();
    });
  }

  async function removeCard() {
    if (!confirm(`Remove your saved card from ${companyName}?`)) return;
    setBusy(true);
    await fetch("/api/hub/payment-method", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setBusy(false);
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
      {savedLabel && !adding && (
        <div className="card-ledger p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <CreditCard size={18} className="text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{savedLabel}</p>
            <p className="text-xs text-gray-500">On file with {companyName}</p>
          </div>
          <button
            onClick={removeCard}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Remove
          </button>
        </div>
      )}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full py-3 text-sm font-semibold border border-gray-300 rounded-[10px] text-gray-700 hover:bg-gray-50"
        >
          {savedLabel ? "Replace card" : "Add a card"}
        </button>
      ) : (
        <div className="card-ledger p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {savedLabel ? "Replace your saved card" : "Add a card"}
          </h3>
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
              disabled={busy || !scriptReady || formHasErrors}
              className="flex-1 py-2.5 text-sm font-semibold rounded-[10px] bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              Save card
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setError("");
              }}
              disabled={busy}
              className="px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-[10px] text-gray-600 hover:bg-gray-50"
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
