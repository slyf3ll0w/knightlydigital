"use client";

import { useEffect, useState } from "react";
import { PhoneOutgoing, Loader2, Check, Headphones } from "lucide-react";
import { getSoftphoneState, softphone, softphoneIdle, softphoneRecoverable, useSoftphone, waitForSoftphone } from "@/lib/softphone-client";

/**
 * "Call from line" — place a call from the company's business number
 * (lib/voice.ts startOutboundCall). Two shapes, picked by whether the
 * softphone (components/Softphone.tsx) is registered in this tab:
 *
 *   in the browser  → "Call in app": the tab rings itself, auto-answers,
 *                     and the customer is dialed and bridged here.
 *   otherwise       → the tier-1 flow: the server rings the signed-in
 *                     user's cell first, whispers who they're about to
 *                     call, then rings the client and bridges — so the
 *                     button's whole job is to say "pick up your phone".
 *
 * Target is a contact (`contactId`) or a raw number (`to`, e.g. "Call back"
 * on a Calls row from an unknown caller). The plain tel: Call button next to
 * it still dials from the personal cell for free.
 */
export default function CallFromLineButton({
  contactId,
  to,
  contactName,
  agentPhone,
  compact = false,
  label,
}: {
  contactId?: string | null;
  /** E.164 / any dialable number when there is no contact. */
  to?: string | null;
  contactName: string;
  /** Pretty-printed cell that will ring (from My Profile or the line's ring-through number); "" when there is none. */
  agentPhone: string;
  compact?: boolean;
  /** Override the button text (e.g. "Call back"). */
  label?: string;
}) {
  const sp = useSoftphone();
  const inApp = softphoneIdle(sp);
  const [state, setState] = useState<"idle" | "busy" | "ringing" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (state !== "ringing") return;
    const t = setTimeout(() => setState("idle"), 12_000);
    return () => clearTimeout(t);
  }, [state]);

  const target = contactId ? { contactId } : { to: to ?? null };

  async function call() {
    setState("busy");
    setError("");
    try {
      let viaApp = inApp;
      if (!viaApp && softphoneRecoverable(sp)) {
        // Registered a moment ago and lost it: a fresh token first (up to
        // 8 s), so the call goes out from here as the label promised rather
        // than surprising the caller with their cell.
        softphone.reconnect();
        viaApp = (await waitForSoftphone(8_000)) && softphoneIdle(getSoftphoneState());
      }
      if (viaApp) {
        await softphone.placeCall({ ...target, label: contactName });
        setState("idle");
        return;
      }
      const res = await fetch("/api/app/line/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't place the call.");
      setState("ringing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't place the call.");
      setState("error");
    }
  }

  // The cell flow needs a cell to ring only when we know there is none; the server still checks.
  const disabled = state === "busy" || state === "ringing" || (sp.status === "ready" && !!sp.call);

  const cls = compact
    ? "flex items-center justify-center gap-1.5 px-3 py-1.5 btn-tool-line bg-white text-xs font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-60"
    : "flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-semibold text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-60";
  const size = compact ? 12 : 14;
  const reconnecting = softphoneRecoverable(sp);
  const text = state === "ringing" ? "Pick up your phone" : label ?? (inApp ? "Call in app" : reconnecting ? "Call in app…" : "Call from line");

  return (
    <div className={compact ? "min-w-0" : "relative"}>
      <button
        type="button"
        onClick={call}
        disabled={disabled}
        className={cls}
        title={
          inApp
            ? `Call ${contactName} from this browser. They see your business number.`
            : reconnecting
              ? `The browser is reconnecting to your line — it tries that first, then rings ${agentPhone || "your cell"}.`
              : agentPhone
              ? `Ring ${agentPhone} first, then connect ${contactName}. They see your business number.`
              : `Ring your cell first, then connect ${contactName}. They see your business number.`
        }
      >
        {state === "busy" ? (
          <Loader2 size={size} className="animate-spin" />
        ) : state === "ringing" ? (
          <Check size={size} />
        ) : inApp ? (
          <Headphones size={size} />
        ) : (
          <PhoneOutgoing size={size} />
        )}
        {text}
      </button>
      {state === "ringing" && !compact && (
        <p className="absolute left-0 top-full mt-1 whitespace-nowrap text-[11px] text-gray-500">
          Ringing {agentPhone || "your cell"} — press 1 to connect.
        </p>
      )}
      {state === "error" && (
        <p className={`${compact ? "" : "absolute left-0 top-full"} mt-1 text-[11px] text-red-600`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
