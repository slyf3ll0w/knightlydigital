"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

/**
 * The (i) bubble — THE place for any explanation on a page (design rule:
 * never a sentence of subtext under a title). Desktop: opens on hover or
 * keyboard focus. Phones: tap to open, tap anywhere else (or Esc) to close.
 *
 * The card is portaled to <body> and positioned `fixed` from the trigger's
 * rect, so it floats above everything: a card's `overflow-hidden`, a
 * `.ds-rise` animation or a hover lift on a sibling card can't clip it or
 * paint over it (the bug where bubbles opened underneath the next card).
 * It opens below the trigger, flips above when there's no room, and is
 * clamped inside a 12px viewport margin. `align="end"` right-aligns it to
 * the trigger for bubbles near the right edge.
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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const id = useId();

  const place = useCallback(() => {
    const t = wrap.current?.getBoundingClientRect();
    const p = pop.current;
    if (!t || !p) return;
    const pad = 12;
    const gap = 8;
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === "end" ? t.right - w : t.left;
    left = Math.max(pad, Math.min(left, vw - pad - w));
    let top = t.bottom + gap;
    if (top + h > vh - pad && t.top - gap - h >= pad) top = t.top - gap - h;
    top = Math.max(pad, Math.min(top, vh - pad - h));
    setPos({ top: Math.round(top), left: Math.round(left) });
  }, [align]);

  // Measure once mounted (the card renders invisible until it has a spot),
  // then follow scrolling and resizing while open.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrap.current?.contains(target) || pop.current?.contains(target)) return;
      setOpen(false);
      setPinned(false);
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

  const card =
    open && typeof document !== "undefined"
      ? createPortal(
          <span
            ref={pop}
            id={id}
            role="tooltip"
            className="ds-pop ds-glass"
            style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
            // hovering the card keeps it open on desktop (moving the pointer
            // from the (i) to the text is a normal thing to do)
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => {
              if (!pinned) setOpen(false);
            }}
          >
            {children}
          </span>,
          document.body
        )
      : null;

  return (
    <span
      ref={wrap}
      className={`relative inline-flex align-middle ${className}`}
      onMouseEnter={(e) => {
        if (e.nativeEvent instanceof MouseEvent && window.matchMedia("(hover: hover)").matches) setOpen(true);
      }}
      onMouseLeave={(e) => {
        if (pinned) return;
        // leaving toward the card itself keeps it open
        const to = e.relatedTarget as Node | null;
        if (to && pop.current?.contains(to)) return;
        setOpen(false);
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
      {card}
    </span>
  );
}
