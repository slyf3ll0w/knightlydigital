"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetch the current page's server data when the app returns to the
 * foreground. Mounted once in the platform layout (signed-in branch).
 *
 * Without this, a phone that sat in a pocket keeps showing whatever was on
 * screen when it was put away — a refund issued from a desktop, a teammate's
 * payment, a status change — until the user happens to navigate. The server
 * re-validates every action anyway, so stale screens were never dangerous,
 * just wrong; this keeps them honest.
 *
 * router.refresh() re-renders server components in place: scroll position and
 * client component state (half-typed forms, open dialogs) survive, so it's
 * safe to fire mid-anything. Skipped while offline — the RSC fetch would just
 * die, and OfflineSupport owns that experience.
 */
const STALE_AFTER_MS = 15_000;

export default function ForegroundRefresh() {
  const router = useRouter();
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      // Only refresh after a real absence — flipping between apps for a
      // second shouldn't cost a round of server work.
      const away = hiddenAt.current == null ? 0 : Date.now() - hiddenAt.current;
      hiddenAt.current = null;
      if (away >= STALE_AFTER_MS && navigator.onLine) router.refresh();
    };
    // Safari restoring a page from the back/forward cache resurrects it
    // exactly as it was, however old — always refresh those.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && navigator.onLine) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
