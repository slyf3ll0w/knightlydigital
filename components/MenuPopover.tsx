"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import BottomSheet from "@/components/BottomSheet";

/**
 * The anchored "…" / Create / filter menu, done once. Desktop: the glass
 * `sheet-material` dropdown under its trigger (the parent is `relative`),
 * nudged back inside the viewport when it would spill past an edge.
 * Phones: the same children in the iOS bottom sheet, restyled as sheet rows
 * by `.menu-sheet` — so a menu can never open off the screen there.
 *
 * Children are the plain menu buttons / links the app already writes
 * (`flex items-center gap-2.5 px-3.5 py-2 text-sm …`); nothing else
 * changes for callers except swapping their dropdown <div> for this.
 */
export default function MenuPopover({
  open,
  onClose,
  children,
  align = "right",
  title,
  top = "top-full mt-1",
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "left" | "right";
  /** Sheet heading on phones */
  title?: string;
  /** Vertical anchor classes for the desktop dropdown */
  top?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState<CSSProperties>({});

  // keep the dropdown on screen: slide it back by however much it overflows
  useLayoutEffect(() => {
    if (!open || typeof window === "undefined" || window.innerWidth < 1024) {
      setShift({});
      return;
    }
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    let dx = 0;
    if (r.right > window.innerWidth - pad) dx = window.innerWidth - pad - r.right;
    if (r.left + dx < pad) dx = pad - r.left;
    setShift(dx ? { transform: `translateX(${Math.round(dx)}px)` } : {});
  }, [open]);

  return (
    <>
      {open && (
        <div ref={ref} role="menu" style={shift} className={`sheet-material absolute z-30 hidden w-max min-w-[13rem] max-w-[min(24rem,calc(100vw-1rem))] whitespace-nowrap rounded-lg border border-gray-200 py-1.5 shadow-xl lg:block ${align === "right" ? "right-0" : "left-0"} ${top} ${className}`}>
          {children}
        </div>
      )}
      <BottomSheet open={open} onClose={onClose} title={title}>
        <div className="menu-sheet">{children}</div>
      </BottomSheet>
    </>
  );
}
