"use client";

import { useEffect, useState } from "react";
import { PhoneOutgoing, Loader2, Check } from "lucide-react";

/**
 * "Call from line" — place a call from the company's business number
 * (lib/voice.ts startOutboundCall). Nothing rings in the browser: the
 * server rings the signed-in user's cell first, whispers who they're about
 * to call, then rings the client and bridges. So the button's whole job is
 * to say "pick up your phone" for a few seconds. The plain tel: Call button
 * next to it still dials from the personal cell for free.
 */
export default function CallFromLineButton({
  contactId,
  contactName,
  agentPhone,
  compact = false,
}: {
  contactId: string;
  contactName: string;
  /** Pretty-printed cell that will ring (from My Profile or the line's ring-through number). */
  agentPhone: string;
  compact?: boolean;
}) {
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

  const cls = compact
    ? "flex items-center justify-center gap-1.5 flex-1 px-3 py-1.5 btn-tool-line bg-white text-xs font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-60"
    : "flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-semibold text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-60";

  return (
    <div className={compact ? "flex-1 min-w-0" : "relative"}>
      <button
        type="button"
        onClick={call}
        disabled={state === "busy" || state === "ringing"}
        className={cls}
        title={`Ring ${agentPhone} first, then connect ${contactName}. They see your business number.`}
      >
        {state === "busy" ? (
          <Loader2 size={compact ? 12 : 14} className="animate-spin" />
        ) : state === "ringing" ? (
          <Check size={compact ? 12 : 14} />
        ) : (
          <PhoneOutgoing size={compact ? 12 : 14} />
        )}
        {state === "ringing" ? "Pick up your phone" : "Call from line"}
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
