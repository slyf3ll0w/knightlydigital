"use client";

import { useEffect } from "react";

/**
 * Closes an open dropdown list when the host page scrolls.
 *
 * The form lives in an iframe that is sized to its content, so the visitor
 * scrolls the HOST page, never the frame. Desktop browsers only close a
 * native <select> list when its own document scrolls — on a host-page
 * scroll the list stays put on screen while the form slides away from it.
 * Blurring the focused <select> closes the list.
 *
 * Two signals, so it works however the form was embedded:
 *  - public/embed.js posts "workbench:scroll" from the host page;
 *  - for plain <iframe> snippets (no embed.js, or an old cached copy), an
 *    IntersectionObserver on the frame's root fires as the frame's visible
 *    share of the screen changes, which is what scrolling does.
 *
 * Phones are left alone: their pickers are full-screen sheets that don't
 * drift, and iOS scrolls the page to bring a tapped select into view —
 * closing on that would shut the picker the moment it opens.
 */
export default function EmbedClosePickers() {
  useEffect(() => {
    if (window.parent === window) return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    const close = () => {
      const el = document.activeElement;
      if (el instanceof HTMLSelectElement) el.blur();
    };

    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const d = e.data;
      if (d && typeof d === "object" && d.type === "workbench:scroll") close();
    };
    window.addEventListener("message", onMessage);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      let first = true; // the observer always reports once on start
      const thresholds = Array.from({ length: 51 }, (_, i) => i / 50);
      observer = new IntersectionObserver(() => {
        if (first) {
          first = false;
          return;
        }
        close();
      }, { threshold: thresholds });
      observer.observe(document.documentElement);
    }

    return () => {
      window.removeEventListener("message", onMessage);
      observer?.disconnect();
    };
  }, []);

  return null;
}
