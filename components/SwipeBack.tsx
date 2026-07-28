"use client";

import { useEffect, useRef } from "react";

/**
 * iOS edge-swipe-back for the mobile shell. A drag starting within 24px of
 * the left edge tracks the finger — the app's <main> translates live with an
 * edge shadow — and past the commit threshold (or with enough velocity) pops
 * back through the same handler as the header's "‹ Section" control. Works
 * identically in Safari, the PWA, and the Capacitor App Store shell, so no
 * native rebuild is needed (and the WKWebView native gesture stays off to
 * avoid double-firing).
 *
 * Only active on subpages (enabled = the header shows a back control) and
 * only for touches that land inside <main> — sheets and drawers keep their
 * own gestures.
 */
export default function SwipeBack({
  enabled,
  mainRef,
  onBack,
  pathname,
}: {
  enabled: boolean;
  mainRef: React.RefObject<HTMLElement | null>;
  onBack: () => void;
  pathname: string;
}) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const backRef = useRef(onBack);
  backRef.current = onBack;

  // Navigation completed — drop any leftover slide instantly (no transition,
  // the incoming page plays its own entrance).
  useEffect(() => {
    const el = mainRef.current;
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
      el.style.boxShadow = "";
    }
  }, [pathname, mainRef]);

  useEffect(() => {
    const state = {
      tracking: false,
      dragging: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastT: 0,
      velocity: 0,
    };

    const reset = (el: HTMLElement, animate: boolean) => {
      if (animate) {
        el.style.transition = "transform 0.22s cubic-bezier(0.32,0.72,0,1), box-shadow 0.22s ease";
        el.style.transform = "translateX(0)";
        el.style.boxShadow = "";
        window.setTimeout(() => {
          el.style.transition = "";
          el.style.transform = "";
        }, 240);
      } else {
        el.style.transition = "";
        el.style.transform = "";
        el.style.boxShadow = "";
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      const el = mainRef.current;
      if (!el || !enabledRef.current) return;
      if (window.innerWidth >= 1024) return;
      const t = e.touches[0];
      if (e.touches.length !== 1 || t.clientX > 24) return;
      if (!(e.target instanceof Node) || !el.contains(e.target)) return;
      state.tracking = true;
      state.dragging = false;
      state.startX = t.clientX;
      state.startY = t.clientY;
      state.lastX = t.clientX;
      state.lastT = e.timeStamp;
      state.velocity = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!state.tracking) return;
      const el = mainRef.current;
      if (!el) return;
      const t = e.touches[0];
      const dx = t.clientX - state.startX;
      const dy = t.clientY - state.startY;
      if (!state.dragging) {
        // Axis lock: clearly horizontal or we hand the touch back to scroll
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (dx <= 0 || Math.abs(dx) < Math.abs(dy) * 1.2) {
          state.tracking = false;
          return;
        }
        state.dragging = true;
        el.style.transition = "none";
        el.style.boxShadow = "-8px 0 24px rgba(0,0,0,0.14)";
      }
      e.preventDefault();
      const x = Math.max(0, dx);
      const dt = Math.max(1, e.timeStamp - state.lastT);
      state.velocity = (t.clientX - state.lastX) / dt;
      state.lastX = t.clientX;
      state.lastT = e.timeStamp;
      el.style.transform = `translateX(${x}px)`;
    };

    const onTouchEnd = () => {
      if (!state.tracking) return;
      const el = mainRef.current;
      state.tracking = false;
      if (!el || !state.dragging) return;
      state.dragging = false;
      const dx = state.lastX - state.startX;
      const commit = dx > Math.min(96, window.innerWidth * 0.3) || state.velocity > 0.55;
      if (commit) {
        el.style.transition = "transform 0.18s ease-out";
        el.style.transform = `translateX(${window.innerWidth}px)`;
        backRef.current();
      } else {
        reset(el, true);
      }
    };

    // touchmove must be non-passive to preventDefault mid-drag
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [mainRef]);

  return null;
}
