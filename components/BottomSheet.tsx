"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Generic phone bottom sheet — dimmed backdrop + glass panel sliding up on
 * the iOS curve (the Create/More sheet material). Phones only (`lg:hidden`);
 * desktop callers should present their own anchored dropdown instead.
 *
 * Keep it mounted and drive `open`: the panel keeps rendering through the
 * 300ms exit transition, then unmounts itself.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  closeButton = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** An explicit × in the title row — for tall sheets where the backdrop is out of reach. */
  closeButton?: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames so the closed position paints before the transition starts
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setShown(true))
      );
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), 300);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        style={{ touchAction: "none" }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`absolute inset-x-0 bottom-0 sheet-material rounded-t-3xl shadow-[0_-8px_30px_rgba(28,25,23,0.18)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] ${
          /* open = NO transform: iOS kills backdrop-filter on transformed elements */
          shown ? "" : "translate-y-full"
        }`}
      >
        <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-gray-300/80" />
        {(title || closeButton) && (
          <div className="flex items-center gap-3 px-5 pt-3.5 pb-2">
            <p className="font-display min-w-0 flex-1 truncate text-[16px] font-bold text-gray-900">{title}</p>
            {closeButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="glass-control flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-700"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            )}
          </div>
        )}
        <div className="pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
