"use client";

import { useEffect, useRef, useState } from "react";

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
export default function Modal({
  open,
  onClose,
  children,
  cardClassName = "card-ledger w-full max-w-md p-5",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Classes for the card itself — width, padding, surface. */
  cardClassName?: string;
  dismissible?: boolean;
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
  return (
    <div
      className={`modal-pop fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 ${
        phase === "closing" ? "modal-closing" : ""
      }`}
      onClick={dismissible ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div className={`modal-card ${cardClassName}`} onClick={(e) => e.stopPropagation()}>
        {phase === "closing" ? lastChildren.current : children}
      </div>
    </div>
  );
}
