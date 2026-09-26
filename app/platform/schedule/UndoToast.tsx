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
 * One toast for the calendar. Every move lands here with Undo, and when a
 * client is attached, a one-tap "Text client" that sends the new time.
 *
 * Desktop: a single row, bottom-center. Phones: a card that sits above the
 * tab bar and its floating + button, text on top and the actions on their
 * own row — three buttons beside the text squeezed the message to nothing
 * at 390px. Auto-dismisses; a fresh toast restarts the clock.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id, toast?.notified]);

  if (!toast) return null;
  const dark = toast.tone === "warn" ? "bg-amber-900 text-amber-50" : "bg-gray-900 text-white";
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-[60] flex justify-center px-3 lg:bottom-6 lg:px-4"
    >
      <div
        className={`pointer-events-auto flex w-full max-w-[560px] flex-col gap-2 rounded-[14px] px-4 py-3 text-sm shadow-[0_10px_30px_rgba(9,13,19,0.3)] lg:w-auto lg:flex-row lg:items-center lg:gap-3 lg:py-2.5 ${dark}`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug lg:truncate">{toast.text}</p>
            {toast.sub && <p className="text-xs leading-snug opacity-75 lg:truncate">{toast.sub}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Dismiss"
            className="-mr-1 -mt-0.5 shrink-0 rounded-full p-1 opacity-60 hover:opacity-100 lg:hidden"
          >
            <X size={16} />
          </button>
        </div>
        {(toast.onUndo || toast.onNotify) && (
          <div className="flex shrink-0 items-center gap-2">
            {toast.onUndo && (
              <button
                onClick={() => {
                  toast.onUndo?.();
                  onClose();
                }}
                className="flex h-9 items-center gap-1.5 rounded-[10px] bg-white/12 px-3 text-[13px] font-semibold hover:bg-white/20 lg:h-8 lg:px-2.5 lg:text-xs"
              >
                <Undo2 size={14} />
                Undo
              </button>
            )}
            {toast.onNotify && (
              <button
                onClick={() => toast.onNotify?.()}
                disabled={toast.notifyBusy || toast.notified}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-[color:var(--ds-primary)] px-3 text-[13px] font-semibold text-[color:var(--ds-on-primary)] hover:bg-[color:var(--ds-primary-strong)] disabled:opacity-60 lg:h-8 lg:flex-none lg:px-2.5 lg:text-xs"
              >
                {toast.notifyBusy ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                {toast.notified ? "Sent" : toast.notifyLabel ?? "Notify client"}
              </button>
            )}
          </div>
        )}
        <button onClick={onClose} aria-label="Dismiss" className="hidden shrink-0 p-0.5 opacity-60 hover:opacity-100 lg:block">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
