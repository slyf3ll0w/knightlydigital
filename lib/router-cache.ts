import { getCurrentAppRouterState } from "next/dist/client/components/app-router-instance";

/**
 * Forget every page the Next.js client router is holding, so the next
 * navigation fetches fresh.
 *
 * Why: next.config.ts keeps visited pages for 30 s (experimental.staleTimes)
 * so Back and tab hops are instant. But a page cached before a save is
 * wrong after it (a job list still showing the job just deleted). Calling
 * router.refresh() is not enough: a navigation that follows it discards it
 * (Next's action queue lets navigations jump the line), and the stale entry
 * wins the race. Clearing the cache map itself is synchronous, so a purge
 * in the fetch wrapper's `.then` (components/AppShell.tsx
 * hookNavRecountOnSave) lands before the component's own continuation
 * pushes anywhere.
 *
 * This reaches into Next internals (getCurrentAppRouterState is exported but
 * not documented); scripts/test-loading-moments.ts fails loudly if an
 * upgrade moves it, and at runtime a miss just means the 30 s cache behaves
 * as stock Next would.
 */
export function purgeRouterCache(): boolean {
  try {
    const state = getCurrentAppRouterState();
    const cache = state?.prefetchCache;
    if (!cache || typeof cache.clear !== "function") return false;
    cache.clear();
    return true;
  } catch {
    return false;
  }
}
