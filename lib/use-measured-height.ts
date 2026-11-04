"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Tells the app shell a page has a composer pinned to the bottom of the
 * screen, and how tall it is, via `--page-composer-h` on <html>. The desktop
 * Atlas capsule (components/AppShell.tsx) lifts itself by that much so it
 * never sits on the Send button (ticket 2026-11-03, Team Chat). Cleared when
 * the page unmounts.
 */
export function usePublishComposerHeight(height: number) {
  useEffect(() => {
    const root = document.documentElement;
    if (height > 0) root.style.setProperty("--page-composer-h", `${height}px`);
    else root.style.removeProperty("--page-composer-h");
  }, [height]);
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--page-composer-h");
    },
    []
  );
}

/**
 * Measures an element's rendered height and keeps it current through a
 * ResizeObserver — for the floating (absolutely positioned) composers that
 * scroll lists have to pad for. Returns a callback ref so it survives the
 * element being conditionally swapped (e.g. the Atlas input strip vs. its
 * locked notice). Height is 0 until the element mounts.
 */
export function useMeasuredHeight(): [(el: HTMLElement | null) => void, number] {
  const [height, setHeight] = useState(0);
  const [observer] = useState(() =>
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => {
          const box = entries[entries.length - 1]?.target as HTMLElement | undefined;
          if (box) setHeight(box.offsetHeight);
        })
  );
  const ref = useCallback(
    (el: HTMLElement | null) => {
      observer?.disconnect();
      if (el) {
        setHeight(el.offsetHeight);
        observer?.observe(el);
      } else {
        setHeight(0);
      }
    },
    [observer]
  );
  return [ref, height];
}
