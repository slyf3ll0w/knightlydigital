"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Brings a form error into view the moment it appears.
 *
 * Every form in the app reports a failed save with the one `.form-error`
 * banner, and almost all of them put it at the TOP of the form — while the
 * user is at the bottom, on the Save button. On a phone (and in a tall
 * sheet) the banner lands off-screen, so a rejected save looks like
 * "nothing happened" (David 2026-10-02: "the error pops up at the top of
 * the screen making it hard to find — for anything, not just
 * appointments"). Rather than touch 57 forms, one observer on the shell
 * watches for a `.form-error` being added or re-worded and, if it isn't
 * fully on screen, scrolls its nearest scroller to it and gives it a brief
 * highlight. Works for page forms, portaled Modals and bottom sheets alike
 * (scrollIntoView walks every scrollable ancestor).
 */
export default function FormErrorFocus() {
  // Banners that are simply part of a page (a rejected texting filing, a tool
  // whose rules no longer compile) mount with the page — those must not yank
  // the scroll on arrival. Only banners that appear AFTER the page settled
  // (a user's failed save) are brought into view.
  const pathname = usePathname();
  const settledAt = useRef(0);
  useEffect(() => {
    settledAt.current = Date.now() + 1500;
  }, [pathname]);

  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    let raf = 0;
    const pending = new Set<HTMLElement>();

    const visible = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return true; // hidden — nothing to do
      return r.top >= 0 && r.bottom <= window.innerHeight;
    };

    const flush = () => {
      raf = 0;
      // The newest banner wins when several appear at once.
      const els = [...pending];
      pending.clear();
      const el = els[els.length - 1];
      if (!el || !el.isConnected) return;
      if (!visible(el)) {
        try {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {
          el.scrollIntoView();
        }
      }
      // A short pulse so the eye lands on it even when it was already in view.
      el.classList.remove("form-error-pulse");
      // force a restart of the animation when the same banner re-words
      void el.offsetWidth;
      el.classList.add("form-error-pulse");
    };

    const queue = (el: HTMLElement) => {
      if (Date.now() < settledAt.current) return;
      pending.add(el);
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const consider = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.classList.contains("form-error")) queue(node);
      else node.querySelectorAll?.(".form-error").forEach((e) => queue(e as HTMLElement));
    };

    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "childList") {
          r.addedNodes.forEach(consider);
          // text swapped inside an existing banner (same element, new message)
          if (r.target instanceof HTMLElement) {
            const banner = r.target.closest?.(".form-error");
            if (banner) queue(banner as HTMLElement);
          }
        } else if (r.type === "characterData") {
          const banner = r.target.parentElement?.closest(".form-error");
          if (banner) queue(banner as HTMLElement);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
