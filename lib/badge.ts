import { getCapacitor } from "@/components/NativeShell";

/**
 * Home-screen app icon badge for the native shell (@capawesome/capacitor-badge),
 * reached through the runtime plugin registry like lib/haptics.ts — silent
 * no-op on the web and in shells built before the plugin was added.
 *
 * The count mirrors what actually needs a human: new requests + unread team
 * chat + unread client messages (the same numbers AppShell's nav badges show).
 * Past-due invoices and leads are statuses, not unreads — putting them on the
 * icon would leave a number that never clears, which trains people to ignore
 * the badge entirely.
 *
 * iOS only displays the badge once notification permission is granted (the
 * push toggle's prompt covers that); until then set() fails quietly.
 */
export function syncAppBadge(count: number) {
  const badge = getCapacitor()?.Plugins?.Badge;
  if (!badge) return;
  try {
    if (count > 0) badge.set?.({ count })?.catch?.(() => {});
    else badge.clear?.()?.catch?.(() => {});
  } catch {
    // not native
  }
}
