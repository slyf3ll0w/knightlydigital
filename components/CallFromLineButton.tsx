"use client";

import { useEffect, useState } from "react";
import { PhoneOutgoing, Loader2, Check, Headphones } from "lucide-react";
import { softphone, softphoneIdle, useSoftphone } from "@/lib/softphone-client";

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
 * The plain tel: Call button next to it still dials from the personal cell
 * for free.
 */
export default function CallFromLineButton({
  contactId,
  contactName,
  agentPhone,
  compact = false,
}: {
  contactId: string;
  contactName: string;
  /** Pretty-printed cell that will ring (from My Profile or the line's ring-through number); "" when there is none. */
  agentPhone: string;
  compact?: boolean;
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

  async function call() {
    setState("busy");
    setError("");
    try {
      if (inApp) {
        await softphone.placeCall({ contactId, label: contactName });
        setState("idle");
        return;
      }
      const res = await fetch("/api/app/line/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't place the call.");
      setState("ringing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't place the call.");
      setState("error");
    }
  }

  // Cell flow needs a cell to ring; the in-app flow doesn't.
  const disabled = state === "busy" || state === "ringing" || (!inApp && !agentPhone) || (sp.status === "ready" && !!sp.call);

  const cls = compact
    ? "flex items-center justify-center gap-1.5 flex-1 px-3 py-1.5 btn-tool-line bg-white text-xs font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-60"
    : "flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-semibold text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-60";
  const size = compact ? 12 : 14;

  return (
    <div className={compact ? "flex-1 min-w-0" : "relative"}>
      <button
        type="button"
        onClick={call}
        disabled={disabled}
        className={cls}
        title={
          inApp
            ? `Call ${contactName} from this browser. They see your business number.`
            : agentPhone
              ? `Ring ${agentPhone} first, then connect ${contactName}. They see your business number.`
              : "Add your cell under My Profile, or open WorkBench on a computer to call in the app."
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
        {state === "ringing" ? "Pick up your phone" : inApp ? "Call in app" : "Call from line"}
      </button>
      {state === "ringing" && !compact && (
        <p className="absolute left-0 top-full mt-1 whitespace-nowrap text-[11px] text-gray-500">
          Ringing {agentPhone} — press 1 to connect.
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
