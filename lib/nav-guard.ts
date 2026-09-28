/**
 * A page with unsaved changes registers a guard here (lib/use-unsaved-warning.ts
 * does it); the navigations that don't go through an <a> — the phone sheets,
 * keyboard shortcuts and the header back arrow in AppShell, which call
 * `router.push` / `router.back` directly — ask `confirmLeave()` first, the
 * same sheet a link click gets. Client-only; no-op on the server.
 */

type Guard = () => Promise<boolean>;

const guards = new Set<Guard>();

/** Register a "may we leave?" check; returns the unregister function. */
export function registerLeaveGuard(guard: Guard): () => void {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

/** True when nothing on the page objects to leaving (every guard confirmed, or none are registered). */
export async function confirmLeave(): Promise<boolean> {
  for (const g of Array.from(guards)) {
    if (!(await g())) return false;
  }
  return true;
}

/** Anything registered right now? (cheap check before an async round trip) */
export function hasLeaveGuards(): boolean {
  return guards.size > 0;
}
