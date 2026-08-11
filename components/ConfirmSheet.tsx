"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hapticNotify } from "@/lib/haptics";

export type ConfirmSheetOptions = {
  /** Optional bold first line ("Delete this quote?"). */
  title?: string;
  /** The consequence sentence — what happens if they confirm. */
  message: string;
  /** Verb-specific commit button ("Delete Quote"), never a bare "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red commit button + warning haptic. */
  destructive?: boolean;
  /** One-button notice (alertSheet) — no cancel, always resolves true. */
  alertOnly?: boolean;
};

type Presenter = (opts: ConfirmSheetOptions, resolve: (ok: boolean) => void) => void;

let presenter: Presenter | null = null;

/**
 * Drop-in async replacement for window.confirm(). On phones (<lg) it presents
 * an iOS action sheet — dimmed backdrop, floating translucent cards, red
 * destructive action, separate Cancel. On desktop it presents a centered
 * modal dialog in the app's own visual language (no native browser chrome).
 * Native window.confirm remains only as the fallback where the host isn't
 * mounted (portal pages, marketing routes), so call sites never care where
 * they run.
 */
export function confirmSheet(opts: ConfirmSheetOptions): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!presenter) {
    const text = opts.title ? `${opts.title}\n\n${opts.message}` : opts.message;
    return Promise.resolve(opts.alertOnly ? (window.alert(text), true) : window.confirm(text));
  }
  return new Promise((resolve) => presenter!(opts, resolve));
}

/**
 * Drop-in async replacement for window.alert(): same presentation as
 * confirmSheet but with a single OK button. Fire-and-forget friendly —
 * awaiting the promise is optional.
 */
export function alertSheet(
  opts: Omit<ConfirmSheetOptions, "alertOnly" | "cancelLabel">
): Promise<boolean> {
  return confirmSheet({ confirmLabel: "OK", ...opts, alertOnly: true });
}

export default function ConfirmSheetHost() {
  const [opts, setOpts] = useState<ConfirmSheetOptions | null>(null);
  const [open, setOpen] = useState(false); // drives the slide/fade transition
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    presenter = (o, resolve) => {
      resolveRef.current?.(false); // a new ask while open cancels the old one
      resolveRef.current = resolve;
      closingRef.current = false;
      setOpts(o);
      setOpen(false);
      // Two frames so the closed position paints before the transition starts
      requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
      if (o.destructive) hapticNotify("WARNING");
    };
    return () => {
      presenter = null;
    };
  }, []);

  const settle = useCallback((ok: boolean) => {
    if (closingRef.current) return;
    closingRef.current = true;
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOpen(false);
    window.setTimeout(() => {
      closingRef.current = false;
      setOpts(null);
    }, 300);
  }, []);

  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape backs out; an alert has only one way out, so both keys settle it
      if (e.key === "Escape") settle(Boolean(opts.alertOnly));
      if (e.key === "Enter") settle(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts, settle]);

  if (!opts) return null;

  const accent = opts.destructive ? "#FF3B30" : "var(--mobile-accent, #0B57D8)";

  return (
    <div className="fixed inset-0 z-[70]" role="alertdialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        style={{ touchAction: "none" }}
        onClick={() => settle(Boolean(opts.alertOnly))}
      />

      {/* Phone: iOS action sheet, unchanged */}
      <div
        className={`absolute inset-x-0 bottom-0 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] lg:hidden ${
          /* open = NO transform so iOS renders the cards' backdrop blur */
          open ? "" : "translate-y-full"
        }`}
      >
        <div className="sheet-material overflow-hidden rounded-[14px]">
          <div className="px-4 pb-3.5 pt-4 text-center">
            {opts.title && (
              <p className="text-[13px] font-semibold text-gray-500">{opts.title}</p>
            )}
            <p className="mx-auto max-w-[34ch] text-[13px] leading-snug text-gray-500">
              {opts.message}
            </p>
          </div>
          <button
            onClick={() => settle(true)}
            className="block w-full border-t sheet-hairline px-4 py-[15px] text-center text-[17px] active:bg-black/5"
            style={{ color: opts.alertOnly ? "var(--mobile-accent, #0B57D8)" : accent }}
          >
            {opts.confirmLabel ?? "Confirm"}
          </button>
        </div>
        {!opts.alertOnly && (
          <div className="sheet-material mt-2 overflow-hidden rounded-[14px]">
            <button
              onClick={() => settle(false)}
              className="block w-full px-4 py-[15px] text-center text-[17px] font-semibold active:bg-black/5"
              style={{ color: "var(--mobile-accent, #0B57D8)" }}
            >
              {opts.cancelLabel ?? "Cancel"}
            </button>
          </div>
        )}
      </div>

      {/* Desktop: centered modal in the app's own language — replaces the
          native window.confirm this used to fall back to */}
      <div className="hidden lg:flex absolute inset-0 items-center justify-center p-4 pointer-events-none">
        <div
          className={`modal-card pointer-events-auto w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl transition-all duration-200 ${
            open ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          {opts.title && (
            <h2 className="text-base font-bold text-gray-900 mb-1.5">{opts.title}</h2>
          )}
          <p className="text-sm leading-relaxed text-gray-600">{opts.message}</p>
          <div className="mt-5 flex justify-end gap-2">
            {!opts.alertOnly && (
              <button
                onClick={() => settle(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                {opts.cancelLabel ?? "Cancel"}
              </button>
            )}
            <button
              onClick={() => settle(true)}
              autoFocus
              className={`px-4 py-2 text-sm font-semibold text-white rounded-[10px] btn-tool transition-colors ${
                opts.destructive
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-green-500 hover:bg-green-600"
              }`}
            >
              {opts.confirmLabel ?? (opts.alertOnly ? "OK" : "Confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
