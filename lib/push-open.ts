/**
 * Where a tapped notification should take the app — shared by the web
 * (public/sw.js → AppShell "wb:open"), the native shell (NativeShell
 * pushNotificationActionPerformed) and the /app/open landing page.
 *
 * lib/push.ts wraps every in-app link as /app/open?u=<membership>&to=<path>
 * so a tap can switch companies first. Most taps don't need that: the
 * membership is the one already signed in. Those should stay inside the
 * running app (router.push) instead of a full page load through /app/open
 * and a second load into the destination — the two cold navigations a
 * resumed phone drops are what landed David on the offline page
 * (2026-10-03). Only a real company switch goes through /app/open.
 *
 * Pure: no window, no React — tested by scripts/test-push-open.ts.
 */

export type PushOpen =
  | { kind: "push"; to: string }
  /** A different membership than the one signed in: /app/open switches first. */
  | { kind: "assign"; url: string }
  | { kind: "ignore" };

/** In-app paths only; anything else collapses to the dashboard (never an open redirect). */
export function safeAppPath(to: string | null | undefined): string {
  const t = (to ?? "").trim();
  if (t === "/app" || t.startsWith("/app/")) return t.replace(/["<>]/g, "");
  return "/app/dashboard";
}

export function resolvePushOpen(rawUrl: string | null | undefined, currentUserId: string | null | undefined): PushOpen {
  const url = (rawUrl ?? "").trim();
  if (!url) return { kind: "ignore" };
  if (!(url === "/app" || url.startsWith("/app/"))) return { kind: "ignore" };

  const q = url.indexOf("?");
  const pathname = q === -1 ? url : url.slice(0, q);
  if (pathname !== "/app/open") return { kind: "push", to: url };

  const params = new URLSearchParams(q === -1 ? "" : url.slice(q + 1));
  const to = safeAppPath(params.get("to"));
  const target = params.get("u");
  if (target && currentUserId && target !== currentUserId) return { kind: "assign", url };
  // No membership named, or it is the one signed in (or we can't tell yet —
  // the switch trigger no-ops for the current user, so staying in-app is safe).
  return { kind: "push", to };
}
