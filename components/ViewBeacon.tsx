"use client";

import { useEffect } from "react";

/**
 * Marks a public client document (quote / invoice / contract / hub) as viewed.
 * Fires once per mount, and only after the tab has been visible for a moment —
 * email link-scanner prefetchers (Outlook SafeLinks, Yahoo) either don't run
 * JS or tear the page down before the delay, so they don't count as opens.
 * The server additionally ignores views from the company's own logged-in
 * session, so staff previews never read as "client viewed".
 */
export default function ViewBeacon({
  kind,
  token,
  disabled,
}: {
  kind: "quote" | "invoice" | "contract" | "hub";
  token: string;
  /** e.g. the quote page's ?preview=1 mode */
  disabled?: boolean;
}) {
  useEffect(() => {
    if (disabled) return;
    let fired = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fire = () => {
      if (fired) return;
      fired = true;
      fetch("/api/public/viewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, token }),
        keepalive: true,
      }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fire, 1500);
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
    };
  }, [kind, token, disabled]);

  return null;
}
