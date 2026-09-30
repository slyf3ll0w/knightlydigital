"use client";

import { useEffect, useState } from "react";
import { PhoneOutgoing, Loader2, Check, Headphones } from "lucide-react";
import { softphoneElsewhere, softphoneIdle, softphoneRecoverable, useSoftphone } from "@/lib/softphone-client";
import { lineCallTitle, placeLineCall } from "@/lib/line-calling";

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
 * on a Calls row from an unknown caller). The placing itself is
 * lib/line-calling.ts placeLineCall, shared with every plain Call control
 * (components/CallLink.tsx); this button is the shape with room to show the
 * ringing state inline.
 */
export default function CallFromLineButton({
  contactId,
  to,
  contactName,
  agentPhone,
  compact = false,
  label,
  stacked = false,
  className,
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
  /** Icon over a small label, filling its box — the swipe-action tray on a phone row (components/SwipeRow.tsx). */
  stacked?: boolean;
  /** Replaces the button's own surface classes entirely (a colored swipe block). */
  className?: string;
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
      const out = await placeLineCall({ ...target, label: contactName });
      setState(out.via === "app" ? "idle" : "ringing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't place the call.");
      setState("error");
    }
  }

  // The cell flow needs a cell to ring only when we know there is none; the server still checks.
  const disabled = state === "busy" || state === "ringing" || (sp.status === "ready" && !!sp.call);

  const cls =
    className ??
    (compact
      ? "flex items-center justify-center gap-1.5 px-3 py-1.5 btn-tool-line bg-white text-xs font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-60"
      : "flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-semibold text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-60");
  const size = stacked ? 20 : compact ? 12 : 14;
  const reconnecting = softphoneRecoverable(sp) || softphoneElsewhere(sp);
  const text = state === "ringing" ? "Pick up your phone" : label ?? (inApp ? "Call in app" : reconnecting ? "Call in app…" : "Call from line");

  return (
    <div className={stacked ? "contents" : compact ? "min-w-0" : "relative"}>
      <button
        type="button"
        onClick={call}
        disabled={disabled}
        className={cls}
        title={lineCallTitle(sp, contactName, agentPhone)}
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
        {stacked ? (state === "error" ? "Failed" : state === "ringing" ? "Pick up" : text) : text}
      </button>
      {state === "ringing" && !compact && !stacked && (
        <p className="absolute left-0 top-full mt-1 whitespace-nowrap text-[11px] text-gray-500">
          Ringing {agentPhone || "your cell"} — press 1 to connect.
        </p>
      )}
      {state === "error" && !stacked && (
        <p className={`${compact ? "" : "absolute left-0 top-full"} mt-1 text-[11px] text-red-600`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
