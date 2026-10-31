"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";
import { textOn } from "@/lib/branding";
import { money } from "@/lib/statuses";
import { orderTotals, STORE_MAX_QUANTITY, STORE_NOTE_MAX, storeBuyerIssue, storeQuantityIssue } from "@/lib/store-rules";

/**
 * The buy form on a product page: quantity, who's buying, an optional note,
 * then POST /api/public/store/[slug] and on to the pay page. The numbers
 * here are the same rule the server applies (lib/store-rules.ts), so the
 * total the buyer sees is the invoice they get; the service fee, if the
 * business charges one, shows on the pay page where they pick card or bank.
 */
export default function BuyForm({
  companySlug,
  itemId,
  unitPrice,
  taxRate,
  dark,
  accent,
  businessName,
}: {
  companySlug: string;
  itemId: string;
  unitPrice: number;
  taxRate: number | null;
  dark: boolean;
  accent: string;
  businessName: string;
}) {
  const [quantity, setQuantity] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const startedAt = useRef(Date.now());

  const totals = useMemo(() => orderTotals({ unitPrice, quantity, taxRate }), [unitPrice, quantity, taxRate]);
  const field = `w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
    dark ? "border-white/15 bg-white/5 text-white placeholder:text-gray-500" : "border-gray-300 bg-white text-gray-900"
  }`;
  const label = `mb-1 block text-xs font-medium ${dark ? "text-gray-400" : "text-gray-500"}`;
  const muted = dark ? "text-gray-400" : "text-gray-500";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const issue = storeQuantityIssue(quantity) ?? storeBuyerIssue({ firstName, lastName, email, phone });
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/public/store/${companySlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, quantity, firstName, lastName, email, phone, note, captchaToken, website: honeypot, elapsedMs: Date.now() - startedAt.current }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      if (data?.payUrl) {
        window.location.href = data.payUrl;
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <div className={`rounded-lg border p-4 text-sm ${dark ? "border-white/15 text-gray-200" : "border-gray-200 bg-white text-gray-700"}`}>Thanks — {businessName} will be in touch.</div>;
  }

  return (
    <form onSubmit={submit} className={`rounded-lg border p-4 ${dark ? "border-white/15" : "border-gray-200 bg-white"}`} noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[110px_1fr]">
        <div>
          <label className={label} htmlFor="qty">
            How many
          </label>
          <select id="qty" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={field}>
            {Array.from({ length: STORE_MAX_QUANTITY }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className={`flex flex-col justify-end text-sm ${muted}`}>
          <p>
            {quantity} × {money(unitPrice)} = <span className={`numeral-ledger font-medium ${dark ? "text-white" : "text-gray-900"}`}>{money(totals.subtotal)}</span>
            {totals.tax > 0 && <> + {money(totals.tax)} tax</>}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="fn">
            First name
          </label>
          <input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={field} autoComplete="given-name" />
        </div>
        <div>
          <label className={label} htmlFor="ln">
            Last name
          </label>
          <input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} className={field} autoComplete="family-name" />
        </div>
        <div>
          <label className={label} htmlFor="em">
            Email
          </label>
          <input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} autoComplete="email" inputMode="email" />
        </div>
        <div>
          <label className={label} htmlFor="ph">
            Phone <span className="font-normal">(optional)</span>
          </label>
          <input id="ph" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} autoComplete="tel" inputMode="tel" />
        </div>
      </div>
      <div className="mt-3">
        <label className={label} htmlFor="note">
          Anything we should know? <span className="font-normal">(optional)</span>
        </label>
        <input id="note" value={note} onChange={(e) => setNote(e.target.value.slice(0, STORE_NOTE_MAX))} className={field} placeholder="Color, size, where to leave it…" />
      </div>
      <div className="hidden" aria-hidden="true">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>
      {error && (
        <div role="alert" className="form-error mt-3">
          {error}
        </div>
      )}
      <TurnstileWidget onToken={setCaptchaToken} />
      <button
        type="submit"
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-opacity disabled:opacity-60"
        style={{ backgroundColor: accent, color: textOn(accent) }}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={14} />}
        Continue to payment · {money(totals.total)}
      </button>
      <p className={`mt-2 text-center text-[11px] ${muted}`}>Pay by card or bank on the next page. The receipt goes to your email.</p>
    </form>
  );
}
