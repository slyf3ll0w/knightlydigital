"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { confirmSheet } from "@/components/ConfirmSheet";
import { registerLeaveGuard } from "@/lib/nav-guard";

/**
 * Warn before losing unsaved changes: the browser's native prompt for tab
 * close / hard navigation, a confirm sheet on any in-app link click (capture
 * phase fires before Next's Link handler), and the same sheet for the
 * navigations AppShell drives without a link (phone sheets, shortcuts, the
 * header back arrow) through lib/nav-guard.ts. The sheet is async, so a
 * click is always stopped up front and the navigation replayed if they
 * confirm.
 */
export function useUnsavedWarning(dirty: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!dirty) return;
    const ask = () =>
      confirmSheet({
        title: "Leave without saving?",
        message: "You have unsaved changes — they'll be lost.",
        confirmLabel: "Discard Changes",
        destructive: true,
      });
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClickCapture = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (anchor.target === "_blank" || href.startsWith("#")) return;
      e.preventDefault();
      e.stopPropagation();
      void ask().then((ok) => {
        if (!ok) return;
        if (/^https?:/i.test(href)) {
          // Full navigation — drop the native prompt so it doesn't double-ask
          window.removeEventListener("beforeunload", onBeforeUnload);
          window.location.href = href;
        } else {
          router.push(href);
        }
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    const unregister = registerLeaveGuard(ask);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
      unregister();
    };
  }, [dirty, router]);
}
