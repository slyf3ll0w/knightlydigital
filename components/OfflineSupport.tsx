"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw, WifiOff, X } from "lucide-react";

/**
 * Offline mode, phase 1 (read-only snapshot). Mounted once in the platform
 * layout for signed-in users. Four jobs:
 *
 * 1. Register /sw.js (also owns web-push; see public/sw.js) so pages the user
 *    visits get cached and can be re-served without a connection.
 * 2. Warm the cache: ask /api/app/offline which pages matter (dashboard,
 *    jobs list, schedule, today's + tomorrow's job details) and have the
 *    service worker fetch them in the background. Runs on load, on
 *    reconnect, and when the app returns to the foreground — throttled.
 * 3. While offline, show a "saved data" pill (with the snapshot's age) and
 *    convert in-app link taps to full-page navigations: Next's client-side
 *    router fetches an RSC payload that dies without a network, but a full
 *    navigation hits the service worker and gets the cached HTML.
 * 4. On reconnect, offer a one-tap refresh instead of yanking the (possibly
 *    mid-scroll) page out from under the user.
 *
 * In the native shell this only works once the store build ships with
 * WKAppBoundDomains (iOS) — until then navigator.serviceWorker is undefined
 * in WKWebView and everything here quietly no-ops.
 */

const PREFETCH_AT_KEY = "sfh-offline-prefetch-at";
const PREFETCH_MIN_MS = 15 * 60_000;

/** Ask the service worker something over a MessageChannel; null on timeout/no SW. */
function swMessage<T>(msg: Record<string, unknown>): Promise<T | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return resolve(null);
    const timer = setTimeout(() => resolve(null), 2000);
    navigator.serviceWorker.ready
      .then((reg) => {
        if (!reg.active) {
          clearTimeout(timer);
          return resolve(null);
        }
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => {
          clearTimeout(timer);
          resolve(e.data as T);
        };
        reg.active.postMessage(msg, [channel.port2]);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

export default function OfflineSupport() {
  const pathname = usePathname();
  const [offline, setOffline] = useState(false);
  const [backOnline, setBackOnline] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const wasOffline = useRef(false);

  // Registration + cache warming (production only — a caching SW during
  // next dev serves stale bundles and makes development miserable)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {});

    const warm = async () => {
      if (!navigator.onLine) return;
      try {
        const last = Number(localStorage.getItem(PREFETCH_AT_KEY)) || 0;
        if (Date.now() - last < PREFETCH_MIN_MS) return;
        localStorage.setItem(PREFETCH_AT_KEY, String(Date.now()));
      } catch {
        /* storage blocked — warm anyway, the SW dedupes by URL */
      }
      try {
        const res = await fetch("/api/app/offline");
        if (!res.ok) return;
        const { urls } = (await res.json()) as { urls: string[] };
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: "PREFETCH", urls });
      } catch {
        /* offline or SW missing — next trigger retries */
      }
    };

    // Idle so warming never competes with the page the user is actually on
    const idle: (cb: () => void) => void =
      (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ??
      ((cb) => void setTimeout(cb, 3000));
    idle(() => void warm());

    const onOnline = () => void warm();
    const onVisible = () => {
      if (document.visibilityState === "visible") void warm();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Track connectivity
  useEffect(() => {
    const goOffline = () => {
      wasOffline.current = true;
      setBackOnline(false);
      setOffline(true);
    };
    const goOnline = () => {
      setOffline(false);
      if (wasOffline.current) setBackOnline(true);
    };
    if (!navigator.onLine) goOffline();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // While offline, show when the current page's snapshot was saved
  useEffect(() => {
    if (!offline) {
      setCachedAt(null);
      return;
    }
    let cancelled = false;
    swMessage<{ cachedAt: number | null }>({ type: "CACHED_AT", url: window.location.href }).then(
      (r) => {
        if (!cancelled) setCachedAt(r?.cachedAt ?? null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [offline, pathname]);

  // While offline, force full-page navigations for in-app links (capture
  // phase, same pattern as NativeShell's external-link interceptor)
  useEffect(() => {
    if (!offline) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const anchor = (e.target as HTMLElement | null)?.closest?.(
        "a[href]"
      ) as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (!(url.pathname === "/app" || url.pathname.startsWith("/app/"))) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.assign(url.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [offline]);

  // The reconnect pill excuses itself after a while
  useEffect(() => {
    if (!backOnline) return;
    const t = setTimeout(() => setBackOnline(false), 10_000);
    return () => clearTimeout(t);
  }, [backOnline]);

  if (!offline && !backOnline) return null;

  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 z-[200] max-w-[calc(100vw-24px)]"
      style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
    >
      {offline ? (
        <div className="flex items-center gap-2 rounded-full bg-amber-400 text-black text-xs font-semibold px-3.5 py-2 shadow-lg whitespace-nowrap">
          <WifiOff size={13} className="shrink-0" />
          <span className="truncate">
            Offline — saved data
            {cachedAt
              ? ` from ${new Date(cachedAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : ""}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-full bg-green-600 text-white text-xs font-semibold pl-3.5 pr-1.5 py-1.5 shadow-lg whitespace-nowrap">
          <span>Back online</span>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1 rounded-full bg-white/15 hover:bg-white/25 px-2.5 py-1 transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            onClick={() => setBackOnline(false)}
            aria-label="Dismiss"
            className="p-1 rounded-full hover:bg-white/15 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
