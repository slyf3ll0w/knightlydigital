"use client";

import { useEffect } from "react";

/**
 * Native-shell integration for the Capacitor mobile app. The webview loads the
 * live site, and the Capacitor runtime injects `window.Capacitor` with the
 * plugins installed in the native project — nothing here imports @capacitor/*
 * so the web bundle is unaffected. On a regular browser this renders nothing
 * and does nothing.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, any>;
};

export function getCapacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const cap = (window as any).Capacitor as CapacitorGlobal | undefined;
  return cap?.isNativePlatform?.() ? cap : null;
}

/** "ios" | "android" when inside the native shell, null on the web. */
export function nativePlatform(): "ios" | "android" | null {
  const cap = getCapacitor();
  const p = cap?.getPlatform?.();
  return p === "ios" || p === "android" ? p : null;
}

// The shell is ONLY the job-manager app. Everything else — the marketing
// site, client-facing pages (/hub /quote /pay /book /contract /portal), and
// external domains — opens in the system browser so users can never wander
// into the wrong context inside the app (also a store UX rule).
const SHELL_PATH_PREFIXES = ["/app", "/superadmin"];

function shouldOpenExternally(url: URL): boolean {
  if (url.origin !== window.location.origin) return true;
  return !SHELL_PATH_PREFIXES.some(
    (p) => url.pathname === p || url.pathname.startsWith(p + "/")
  );
}

export default function NativeShell() {
  useEffect(() => {
    const cap = getCapacitor();
    if (!cap?.Plugins) return;

    const { StatusBar, App: CapApp, Browser, PushNotifications } = cap.Plugins;

    // Match the dark rail. Style DARK = light text on dark background.
    StatusBar?.setStyle?.({ style: "DARK" }).catch(() => {});
    if (cap.getPlatform?.() === "android") {
      StatusBar?.setBackgroundColor?.({ color: "#0C0F0C" }).catch(() => {});
    }

    // Android hardware back: walk history, minimize at the root instead of
    // killing the webview.
    let backHandle: { remove: () => void } | undefined;
    CapApp?.addListener?.("backButton", ({ canGoBack }: { canGoBack: boolean }) => {
      if (canGoBack) window.history.back();
      else CapApp?.minimizeApp?.();
    }).then((h: { remove: () => void }) => {
      backHandle = h;
    });

    // Tapping a notification opens the path the server put in data.url
    // (mirrors sw.js notificationclick on the web).
    let tapHandle: { remove: () => void } | undefined;
    PushNotifications?.addListener?.(
      "pushNotificationActionPerformed",
      (action: { notification?: { data?: { url?: string } } }) => {
        const url = action?.notification?.data?.url;
        if (url && (url === "/app" || url.startsWith("/app/"))) window.location.assign(url);
      }
    ).then((h: { remove: () => void }) => {
      tapHandle = h;
    });

    // Intercept clicks on links that must leave the shell.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return; // OS handles these
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (!/^https?:$/.test(url.protocol)) return;
      if (shouldOpenExternally(url)) {
        e.preventDefault();
        Browser?.open?.({ url: url.href }).catch(() => {
          window.open(url.href, "_blank");
        });
      }
    };
    document.addEventListener("click", onClick, true);

    return () => {
      backHandle?.remove();
      tapHandle?.remove();
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
