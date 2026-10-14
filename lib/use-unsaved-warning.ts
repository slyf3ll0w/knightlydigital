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
export type UnsavedWarningOptions = {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Also the browser's own prompt on refresh / tab close (default on). Off for "you haven't sent this yet"-style nudges. */
  beforeUnload?: boolean;
};

export function useUnsavedWarning(dirty: boolean, options: UnsavedWarningOptions = {}) {
  const router = useRouter();
  const { title, message, confirmLabel, cancelLabel, destructive, beforeUnload } = options;
  useEffect(() => {
    if (!dirty) return;
    const ask = () =>
      confirmSheet({
        title: title ?? "Leave without saving?",
        message: message ?? "You have unsaved changes — they'll be lost.",
        confirmLabel: confirmLabel ?? "Discard changes",
        cancelLabel,
        destructive: destructive ?? true,
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
      // A call, text or email link opens another app and leaves the page as
      // it is — nothing to lose, and router.push("tel:…") would not dial.
      if (/^(tel|sms|mailto|facetime|maps):/i.test(href)) return;
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
    if (beforeUnload !== false) window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    // A confirmed in-app leave (AppShell's back arrow, a phone sheet, Sign
    // out) is the one question; the browser's own prompt must not ask it
    // again when that leave turns out to be a full navigation.
    const unregister = registerLeaveGuard(async () => {
      const ok = await ask();
      if (ok) window.removeEventListener("beforeunload", onBeforeUnload);
      return ok;
    });
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
      unregister();
    };
  }, [dirty, router, title, message, confirmLabel, cancelLabel, destructive, beforeUnload]);
}
