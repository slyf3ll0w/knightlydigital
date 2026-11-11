"use client";

import { useEffect, useRef, useState } from "react";
import { hapticImpact } from "@/lib/haptics";

/**
 * Swipe down to close a phone bottom sheet (More since 2026-10-01, Create
 * since 2026-10-03). A downward drag on the sheet — on the handle, or on
 * its list while that is scrolled to the top — carries the sheet with the
 * finger; let go past ~a quarter of its height (or with a flick) and it
 * closes, otherwise it springs back. `scrollRef` is optional: a sheet with
 * no scrolling list takes the pull from anywhere on it. Shared by every
 * phone sheet since 2026-11-11 (Notifications, BottomSheet, Modal, the
 * company switcher) — a sheet that shows a grab handle can be pulled down.
 */
export function useSheetDrag(open: boolean, onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x0: number; y0: number; t0: number; live: boolean } | null>(null);
  const [dragY, setDragY] = useState(0);
  useEffect(() => {
    if (!open) setDragY(0);
  }, [open]);
  const onTouchStart = (e: React.TouchEvent) => {
    // Not from a control that uses the drag itself (a signature pad, a
    // slider, a text field's caret, a reorder handle), and not from inside
    // an inner list that is scrolled down — that pull scrolls the list.
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("canvas, input, textarea, select, [contenteditable='true'], [draggable='true'], [data-no-sheet-drag]")) {
      drag.current = null;
      return;
    }
    for (let el = target; el && el !== sheetRef.current; el = el.parentElement) {
      if (el.scrollTop > 0) {
        drag.current = null;
        return;
      }
    }
    drag.current = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, t0: Date.now(), live: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.touches[0].clientY - d.y0;
    const scrolled = (scrollRef.current?.scrollTop ?? 0) > 0;
    if (!d.live) {
      // A sideways swipe belongs to the row under the finger (swipe to clear)
      if (Math.abs(e.touches[0].clientX - d.x0) > Math.abs(dy) + 4) {
        drag.current = null;
        return;
      }
      // Only claim a downward pull that starts with the list at its top
      if (dy <= 6 || scrolled) {
        if (dy < -6 || scrolled) drag.current = null;
        return;
      }
      d.live = true;
      d.y0 = e.touches[0].clientY;
      d.t0 = Date.now();
    }
    setDragY(Math.max(0, e.touches[0].clientY - d.y0));
  };
  const onTouchEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.live) return;
    const h = sheetRef.current?.offsetHeight ?? 600;
    const speed = dragY / Math.max(1, Date.now() - d.t0);
    if (dragY > h * 0.25 || (dragY > 40 && speed > 0.6)) {
      hapticImpact("LIGHT");
      onClose();
    } else {
      setDragY(0);
    }
  };
  return {
    sheetRef,
    scrollRef,
    dragY,
    dragging: Boolean(drag.current?.live),
    dragHandlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
  };
}
