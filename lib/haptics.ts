import { getCapacitor } from "@/components/NativeShell";

/**
 * Haptics for the native shell (@capacitor/haptics), reached through the
 * runtime plugin registry like NativeShell does — no @capacitor import, so
 * the web bundle is unaffected and every call is a silent no-op in a browser
 * or in a shell built before the plugin was added.
 *
 * The rule (docs: mobile redesign): haptics mark COMMITMENTS, not taps —
 * tab switches and sheet opens get a tick, money moments get the success
 * buzz. If everything vibrates, nothing does.
 */

function plugin(): any {
  return getCapacitor()?.Plugins?.Haptics ?? null;
}

/** LIGHT = tab switch / send; MEDIUM = opening the Create sheet. */
export function hapticImpact(style: "LIGHT" | "MEDIUM" | "HEAVY" = "LIGHT") {
  try {
    plugin()?.impact?.({ style })?.catch?.(() => {});
  } catch {
    /* not native */
  }
}

/** SUCCESS = payment recorded / quote accepted; WARNING = destructive confirm. */
export function hapticNotify(type: "SUCCESS" | "WARNING" | "ERROR") {
  try {
    plugin()?.notification?.({ type })?.catch?.(() => {});
  } catch {
    /* not native */
  }
}
