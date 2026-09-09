"use client";

import { useEffect } from "react";
import { Loader2, MessageSquare, Undo2, X } from "lucide-react";

export type ToastState = {
  id: number;
  text: string;
  sub?: string;
  onUndo?: () => void;
  /** Offer to tell the client about the new time. */
  onNotify?: () => Promise<void>;
  notifyLabel?: string;
  notifyBusy?: boolean;
  notified?: boolean;
  tone?: "ok" | "warn";
};

/**
 * One bottom-center toast for the calendar. Every move lands here with
 * Undo, and when a client is attached, a one-tap "Text client" that sends
 * the new time. Auto-dismisses; hovering keeps it.
 */
export default function UndoToast({
  toast,
  onClose,
}: {
  toast: ToastState | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onClose, toast.onNotify ? 12000 : 8000);
    return () => window.clearTimeout(t);
    // A fresh toast restarts the clock
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id, toast?.notified]);

  if (!toast) return null;
  return (
    <div
      role="status"
      className="pointer-events-auto fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[60] flex justify-center px-4 lg:bottom-6"
    >
      <div
        className={`flex max-w-[560px] items-center gap-3 rounded-[14px] px-4 py-2.5 text-sm shadow-[0_10px_30px_rgba(9,13,19,0.25)] ${
          toast.tone === "warn" ? "bg-amber-900 text-amber-50" : "bg-gray-900 text-white"
        }`}
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{toast.text}</p>
          {toast.sub && <p className="truncate text-xs opacity-75">{toast.sub}</p>}
        </div>
        {toast.onUndo && (
          <button
            onClick={() => {
              toast.onUndo?.();
              onClose();
            }}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20"
          >
            <Undo2 size={13} />
            Undo
          </button>
        )}
        {toast.onNotify && (
          <button
            onClick={() => toast.onNotify?.()}
            disabled={toast.notifyBusy || toast.notified}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-green-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-400 disabled:opacity-60"
          >
            {toast.notifyBusy ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
            {toast.notified ? "Sent" : toast.notifyLabel ?? "Notify client"}
          </button>
        )}
        <button onClick={onClose} aria-label="Dismiss" className="shrink-0 p-0.5 opacity-60 hover:opacity-100">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
