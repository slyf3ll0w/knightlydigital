"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Make a page root exactly as tall as the app shell's scrolling `<main>`
 * content box, so a map can be "the page". `h-full` is not enough here: the
 * root sits inside a flex-column `<main>` whose height comes from `flex-1`,
 * and a percentage height on its child collapses to nothing in that setup —
 * which is why the Routes page came up blank and the team map lost its map
 * after the facelift. The old pages dodged it with `calc(100dvh - …)`
 * guesses; measuring is exact and survives header, tab-bar and safe-area
 * changes. Height is re-applied on every resize of `<main>`.
 */
export function useMainFill(rootRef: RefObject<HTMLElement | null>, onResize?: () => void): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const main = root.closest("main") as HTMLElement | null;
    if (!main) return;
    const apply = () => {
      const cs = getComputedStyle(main);
      const h = main.clientHeight - parseFloat(cs.paddingTop || "0") - parseFloat(cs.paddingBottom || "0");
      if (h > 0) root.style.height = `${Math.round(h)}px`;
      // a Leaflet map only re-measures its box when told to
      onResize?.();
    };
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(main);
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
      root.style.height = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRef]);
}
