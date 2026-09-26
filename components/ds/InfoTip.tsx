"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * The (i) bubble — THE place for any explanation on a page (design rule:
 * never a sentence of subtext under a title). Desktop: opens on hover or
 * keyboard focus. Phones: tap to open, tap anywhere else (or Esc) to close.
 * `align="end"` opens it leftward for bubbles near the right edge.
 */
export default function InfoTip({
  children,
  label = "What is this?",
  align = "start",
  className = "",
}: {
  children: React.ReactNode;
  label?: string;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const [nudge, setNudge] = useState(0);

  // Keep the card on screen: slide it back inside a 12px margin.
  useLayoutEffect(() => {
    if (!open || !pop.current) return setNudge(0);
    const r = pop.current.getBoundingClientRect();
    const vw = window.innerWidth;
    if (r.right > vw - 12) setNudge(vw - 12 - r.right);
    else if (r.left < 12) setNudge(12 - r.left);
  }, [open]);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span
      ref={wrap}
      className={`relative inline-flex align-middle ${className}`}
      onMouseEnter={(e) => {
        if (e.nativeEvent instanceof MouseEvent && window.matchMedia("(hover: hover)").matches) setOpen(true);
      }}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
    >
      <button
        type="button"
        className="ds-info"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const next = !(open && pinned);
          setOpen(next);
          setPinned(next);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (!pinned) setOpen(false);
        }}
      >
        <Info size={15} strokeWidth={2.2} />
      </button>
      {open && (
        <span
          ref={pop}
          style={nudge ? { translate: `${nudge}px 0` } : undefined}
          id={id}
          role="tooltip"
          className={`ds-pop top-full mt-2 ${align === "end" ? "right-0" : "left-0"}`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
