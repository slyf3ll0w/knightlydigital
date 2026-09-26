"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * THE dialog surface — one primitive instead of fifteen hand-rolled
 * overlays. Renders the .modal-pop / .modal-card contract, so the existing
 * responsive CSS keeps applying: phones get the spring-up bottom sheet
 * (sheetUp + grab handle), desktop gets the scrim fade + card rise.
 *
 * What the hand-rolled versions never had: EXITS. When `open` flips false
 * the dialog plays the reverse animation (scrim fades, card settles away /
 * sheet slides down) before unmounting. Children are cached during the
 * exit so `{target && <Modal open={!!target}>…` patterns don't blank the
 * card mid-flight.
 *
 * Escape and backdrop-click close by default; pass dismissible={false} for
 * flows that must finish (nothing should vanish mid-charge).
 */
/** Card widths — the same max-w steps every dialog already picked from. */
const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
};

export type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl";

export default function Modal({
  open,
  onClose,
  children,
  size = "md",
  flush = false,
  cardClassName,
  dismissible = true,
  portal = false,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Card width (max-w-*). Defaults to md — the confirm/edit dialog width. */
  size?: ModalSize;
  /**
   * No card padding + overflow hidden — for dialogs that draw their own
   * header/footer bands edge to edge (search palette, refund sheet).
   */
  flush?: boolean;
  /**
   * Escape hatch: REPLACES the composed card classes entirely. Only for
   * dialogs that need positioning the props can't express (the ⌘K palette's
   * lg:self-start, a max-h clamp). Everything else uses size/flush so every
   * dialog is the same .card-ledger surface.
   */
  cardClassName?: string;
  dismissible?: boolean;
  /**
   * Render into document.body and swallow clicks at the root — for dialogs
   * mounted inside row <Link>s, where a backdrop click would otherwise
   * bubble into navigation.
   */
  portal?: boolean;
}) {
  const [phase, setPhase] = useState<"closed" | "open" | "closing">(open ? "open" : "closed");
  const lastChildren = useRef<React.ReactNode>(children);
  if (open) lastChildren.current = children;

  useEffect(() => {
    if (open) {
      setPhase("open");
      return;
    }
    // Only play the exit if we were actually showing
    setPhase((p) => (p === "open" ? "closing" : p));
    const t = setTimeout(() => setPhase("closed"), 240);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  if (phase === "closed") return null;
  const card =
    cardClassName ??
    `card-ledger ds-glass ds-glass-strong w-full ${SIZE_CLASS[size]} ${flush ? "p-0 overflow-hidden" : "p-5"}`;
  const node = (
    <div
      className={`modal-pop fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 ${
        phase === "closing" ? "modal-closing" : ""
      }`}
      onClick={(e) => {
        if (portal) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (dismissible) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className={`modal-card ${card}`} onClick={(e) => e.stopPropagation()}>
        {phase === "closing" ? lastChildren.current : children}
      </div>
    </div>
  );
  return portal && typeof document !== "undefined" ? createPortal(node, document.body) : node;
}
