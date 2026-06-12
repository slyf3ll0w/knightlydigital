"use client";

import { useEffect } from "react";

/**
 * Warn before losing unsaved changes: the browser's native prompt for tab
 * close / hard navigation, plus a confirm() on any in-app link click
 * (capture phase fires before Next's Link handler, so preventDefault stops
 * the navigation).
 */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClickCapture = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (anchor.target === "_blank" || href.startsWith("#")) return;
      if (!confirm("You have unsaved changes — leave without saving them?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty]);
}
