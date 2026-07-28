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
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.dispatchEvent(
        new CustomEvent("wb:pagetitle", { detail: { title, hidden: false } })
      );
    };
  }, [title]);

  return <span ref={ref} aria-hidden className="absolute h-px w-px" />;
}
