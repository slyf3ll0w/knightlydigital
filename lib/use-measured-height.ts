"use client";

import { useCallback, useState } from "react";

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
