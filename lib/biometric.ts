import { getCapacitor } from "@/components/NativeShell";

/**
 * Biometric auth for the native shell (@aparajita/capacitor-biometric-auth),
 * reached through the runtime plugin registry like lib/haptics.ts — no
 * @capacitor import, so the web bundle is unaffected and everything no-ops in
 * a browser or in a shell built before the plugin was added.
 *
 * Used by components/AppLock.tsx for the per-device "require Face ID to open
 * the app" lock. The flag lives in localStorage — it's a device setting, not
 * an account setting, exactly like the push toggle.
 */

function plugin(): any {
  return getCapacitor()?.Plugins?.BiometricAuthNative ?? null;
}

export type BiometryInfo = {
  /** Something usable is enrolled — biometry, or at least a device passcode. */
  available: boolean;
  /** What to call it in UI: "Face ID", "Touch ID", or a generic fallback. */
  label: string;
};

// Plugin's BiometryType enum comes over the bridge as numbers:
// 1 = Touch ID, 2 = Face ID, 3/4/5 = Android fingerprint/face/iris.
function biometryLabel(type: number | undefined): string {
  if (type === 2) return "Face ID";
  if (type === 1) return "Touch ID";
  return "Biometric unlock";
}

/** null when not in the shell (or the shell predates the plugin). */
export async function checkBiometry(): Promise<BiometryInfo | null> {
  const p = plugin();
  if (!p?.checkBiometry) return null;
  try {
    const r = await p.checkBiometry();
    // deviceIsSecure counts: authenticate() falls back to the passcode/PIN
    // via allowDeviceCredential, so the lock still works without biometry.
    return {
      available: !!(r?.isAvailable || r?.deviceIsSecure),
      label: r?.isAvailable ? biometryLabel(r?.biometryType) : "Device passcode",
    };
  } catch {
    return null;
  }
}

/** Presents the native prompt; resolves true only on success. */
export async function biometricAuthenticate(reason: string): Promise<boolean> {
  const p = plugin();
  if (!p?.internalAuthenticate) return false;
  try {
    // internalAuthenticate is the native method behind the package's
    // authenticate() wrapper (the wrapper only re-types errors, which we
    // reduce to a boolean anyway).
    await p.internalAuthenticate({
      reason,
      allowDeviceCredential: true,
      iosFallbackTitle: "Use Passcode",
      androidTitle: "Unlock WorkBench",
      cancelTitle: "Cancel",
    });
    return true;
  } catch {
    return false; // cancelled, failed, or lockout — caller shows the retry UI
  }
}

const LOCK_KEY = "wb-app-lock";

export function appLockEnabled(): boolean {
  try {
    return localStorage.getItem(LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAppLockEnabled(on: boolean) {
  try {
    if (on) localStorage.setItem(LOCK_KEY, "1");
    else localStorage.removeItem(LOCK_KEY);
    // Either way the user has made an explicit choice — the post-sign-in
    // offer sheet shouldn't ask again on this device.
    localStorage.setItem(OFFER_KEY, "1");
  } catch {
    // storage blocked — the toggle just won't stick
  }
}

// One-shot "enable Face ID?" offer after sign-in (AppLock's offer sheet).
// Per-device like the lock flag itself; My Profile remains the way back in.
const OFFER_KEY = "wb-app-lock-offered";

export function appLockOfferSeen(): boolean {
  try {
    return localStorage.getItem(OFFER_KEY) === "1";
  } catch {
    return true; // storage blocked — never nag
  }
}

export function markAppLockOfferSeen() {
  try {
    localStorage.setItem(OFFER_KEY, "1");
  } catch {
    // storage blocked
  }
}
