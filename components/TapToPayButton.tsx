"use client";

import { useEffect, useState } from "react";
import { Nfc } from "lucide-react";
import ChargeOverlay, { type ChargePhase } from "@/components/ChargeOverlay";
import { InfoTip } from "@/components/ds";
import { hapticImpact } from "@/lib/haptics";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { nativeTapToPay, newPaymentAttemptId, tapToPayError, type TapToPayPlugin, type TapToPayStatus } from "@/lib/native-tap-to-pay";
import { tapToPayFailureText, type TapToPayOffer } from "@/lib/tap-to-pay-shared";

/**
 * "Tap to Pay" — the client holds their card to the back of the tech's
 * phone. Renders nothing outside the phone app (no plugin) and nothing when
 * the server made no offer. The tap runs the whole flow: make sure the
 * SDK is authorized for this seller (fetching a token when it isn't), the
 * Apple ID step on iOS, Square's own prompt UI, then the server records the
 * payment after re-reading it from Square. Surcharge: the company's card
 * surcharge is added in person the same way the pay page adds it
 * (decision 3 in the plan).
 */
export default function TapToPayButton({
  invoiceId,
  amount,
  label,
  offer,
  onPaid,
  className = "btn-primary",
}: {
  invoiceId: string;
  /** The balance to take (principal, before surcharge). */
  amount: number;
  /** The note on the Square payment — what the seller sees in their dashboard. */
  label: string;
  offer: TapToPayOffer;
  onPaid: (r: { amount: number; fullyPaid: boolean }) => void;
  className?: string;
}) {
  const [plugin, setPlugin] = useState<TapToPayPlugin | null>(null);
  const [status, setStatus] = useState<TapToPayStatus | null>(null);
  const [phase, setPhase] = useState<ChargePhase | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = nativeTapToPay();
    setPlugin(p);
    if (!p) return;
    p.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!plugin || !offer || amount <= 0) return null;
  const surcharge = offer.surchargeRate > 0 ? Math.round(amount * offer.surchargeRate * 100) / 100 : 0;
  const total = Math.round((amount + surcharge) * 100) / 100;

  // The seller's grant predates the in-person scope: only a manager can fix
  // that (Settings → Online Payments → Reconnect), so tell them, and show
  // nothing to everyone else.
  if (offer.needsReconnect) {
    if (!offer.canSetUp) return null;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        Tap to Pay
        <InfoTip label="Why can't I tap to pay?">
          Square needs a fresh connection before this phone can take cards in person. Settings → Online Payments → Reconnect Square (one time).
        </InfoTip>
      </span>
    );
  }
  if (status && status.configured && !status.capable) return null;

  async function ensureReady(p: TapToPayPlugin): Promise<string | null> {
    let s = await p.status();
    if (!s.configured) return "SDK_NOT_CONFIGURED";
    if (!s.capable) return "NOT_CAPABLE";
    if (!s.authorized || s.locationId !== offer!.locationId || s.environment !== offer!.environment) {
      const perms = await p.requestPermissions().catch(() => ({ location: false }));
      if (!perms.location) return "LOCATION_DENIED";
      const res = await fetch("/api/app/square/mobile-token", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { accessToken?: string; locationId?: string; environment?: "sandbox" | "production"; error?: string; code?: string }
        | null;
      if (!res.ok || !data?.accessToken || !data.locationId || !data.environment) {
        throw new Error(data?.error ?? GENERIC_ERROR);
      }
      if (s.authorized) await p.deauthorize().catch(() => {});
      const auth = await p.authorize({ accessToken: data.accessToken, locationId: data.locationId, environment: data.environment });
      if (!auth.ok) return "NOT_AUTHORIZED";
      s = await p.status();
    }
    if (s.platform === "ios" && s.appleLinked === false) {
      const link = await p.linkAppleAccount();
      if (!link.linked) return "APPLE_NOT_LINKED";
    }
    return null;
  }

  async function run() {
    if (!plugin || busy) return;
    setBusy(true);
    hapticImpact("MEDIUM");
    const overlayLabel = "Tap to Pay";
    try {
      const blocker = await ensureReady(plugin);
      if (blocker) {
        setPhase({ state: "declined", label: overlayLabel, amount: total, error: tapToPayFailureText(blocker) });
        return;
      }
      // Square's prompt UI is up now ("Hold card here"); nothing of ours to show.
      const paid = await plugin.pay({
        amountCents: Math.round(total * 100),
        currency: "USD",
        referenceId: invoiceId,
        note: label.slice(0, 500),
        paymentAttemptId: newPaymentAttemptId(),
      });
      setPhase({ state: "processing", label: overlayLabel, amount: total, caption: "Recording the payment…" });
      const { ok, data } = await postJson<{ amount?: number; fullyPaid?: boolean; error?: string }>(
        `/api/app/invoices/${invoiceId}/tap-payment`,
        { paymentId: paid.paymentId }
      );
      if (!ok) {
        // The card WAS charged — say so plainly rather than "declined".
        setPhase({
          state: "declined",
          label: overlayLabel,
          amount: total,
          error: `${data?.error ?? GENERIC_ERROR} The card was charged; the payment will be matched to this invoice shortly.`,
        });
        return;
      }
      hapticImpact("HEAVY");
      setPhase({ state: "approved", label: overlayLabel, amount: data?.amount ?? total });
      setTimeout(() => {
        setPhase(null);
        onPaid({ amount: data?.amount ?? total, fullyPaid: Boolean(data?.fullyPaid) });
      }, 1400);
    } catch (err) {
      const { code, message } = tapToPayError(err);
      setPhase({ state: "declined", label: overlayLabel, amount: total, error: tapToPayFailureText(code, message) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={run} disabled={busy} className={className} title={surcharge > 0 ? `Includes the ${(offer.surchargeRate * 100).toFixed(2)}% card surcharge` : undefined}>
        <Nfc size={14} />
        Tap to Pay{surcharge > 0 ? ` · $${total.toFixed(2)}` : ""}
      </button>
      <ChargeOverlay phase={phase} onDismiss={() => setPhase(null)} />
    </>
  );
}
