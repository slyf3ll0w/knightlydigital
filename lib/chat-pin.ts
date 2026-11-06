"use client";

import { useEffect, type RefObject } from "react";

/**
 * Shared "stay at the newest message" helpers for the chat-style panes
 * (Team Chat, client message threads). Ticket #txii6p (2026-11-04): opening
 * a chat left the view short of the bottom, because the pin ran when the
 * messages rendered but photos load after that and push the newest bubbles
 * down out of view. A smooth glide down also fired scroll events part-way,
 * which read as "the user scrolled up" and switched the pin off.
 */

/** How close to the bottom (px) still counts as "at the newest message". */
export const STICK_SLACK_PX = 80;

/**
 * Whether the pane should keep following new content after a scroll event.
 * Only a move UP that leaves the bottom turns following off; scrolling down
 * (our own glide included) never does.
 */
export function stickAfterScroll(
  el: { scrollHeight: number; scrollTop: number; clientHeight: number },
  prevTop: number,
  wasStuck: boolean
): boolean {
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_SLACK_PX;
  if (nearBottom) return true;
  if (el.scrollTop < prevTop - 1) return false;
  return wasStuck;
}

/**
 * Re-pin whenever a photo or video inside the pane finishes loading (it just
 * changed the content's height). `load` does not bubble, so listen in the
 * capture phase on the document and keep only media inside the pane.
 */
export function usePinOnMediaLoad(scrollRef: RefObject<HTMLElement | null>, pin: () => void) {
  useEffect(() => {
    const onLoad = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLImageElement || t instanceof HTMLVideoElement)) return;
      if (scrollRef.current?.contains(t)) pin();
    };
    document.addEventListener("load", onLoad, true);
    document.addEventListener("loadedmetadata", onLoad, true);
    return () => {
      document.removeEventListener("load", onLoad, true);
      document.removeEventListener("loadedmetadata", onLoad, true);
    };
  }, [scrollRef, pin]);
}
