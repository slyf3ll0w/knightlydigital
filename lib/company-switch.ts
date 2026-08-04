/**
 * Client-side company switching (multi-company accounts).
 *
 * The JWT is re-pointed at the target membership via NextAuth's update
 * trigger (see lib/auth-options.ts), then we hard-navigate so every layout,
 * RSC payload, and badge re-renders as the new company. The offline snapshot
 * is wiped first — company A's cached pages must never surface inside
 * company B (the service worker only self-wipes on /app/login navigations).
 */

export async function clearOfflineCaches(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Cache wipe is best effort — never block a switch on it.
  }
}

export async function switchToMembership(
  update: (data?: unknown) => Promise<unknown>,
  userId: string
): Promise<void> {
  await update({ switchToUserId: userId });
  await clearOfflineCaches();
  window.location.assign("/app/dashboard");
}
