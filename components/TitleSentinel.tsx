"use client";

import { useEffect, useRef } from "react";

/**
 * Invisible marker inside a page's large title (PageTitle). Watches whether
 * the title is on screen and tells the shell, so the mobile header can show
 * a small centered title once the large one scrolls away — the iOS
 * large-title collapse. AppShell listens for the event and clears state on
 * navigation.
 */
export default function TitleSentinel({ title }: { title: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scroller = el.closest("main");
    // A phone-only title (inside lg:hidden) isn't rendered at a desk: watch
    // the page's visible header title instead, or it reads as "scrolled
    // away" and the top bar shows the name under the big title (2026-11-24).
    const target: Element | null =
      el.getClientRects().length > 0
        ? el
        : (Array.from(scroller?.querySelectorAll(".ds-pagehead h1, .ds-pagehead .ds-title") ?? []).find(
            (h) => h.getClientRects().length > 0
          ) ?? null);
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        window.dispatchEvent(
          new CustomEvent("wb:pagetitle", {
            detail: { title, hidden: !entry.isIntersecting },
          })
        );
      },
      { root: scroller ?? null, rootMargin: "-8px 0px 0px 0px" }
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
      window.dispatchEvent(
        new CustomEvent("wb:pagetitle", { detail: { title, hidden: false } })
      );
    };
  }, [title]);

  return <span ref={ref} aria-hidden className="absolute h-px w-px" />;
}
