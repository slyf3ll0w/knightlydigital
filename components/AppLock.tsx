"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Lock, ScanFace, ShieldCheck } from "lucide-react";
import { getCapacitor, nativePlatform } from "@/components/NativeShell";
import {
  appLockEnabled,
  setAppLockEnabled,
  biometricAuthenticate,
  checkBiometry,
  type BiometryInfo,
} from "@/lib/biometric";

/**
 * Face ID / Touch ID app lock for the native shell. Two pieces:
 *
 * - <AppLock/> — mounted in the platform layout. When the per-device flag is
 *   on, it covers the app with an opaque overlay on cold start and whenever
 *   the app comes back from the background, until the native auth prompt
 *   succeeds. Renders nothing on the web or when the flag is off.
 * - <AppLockToggleCard/> — the My Profile card that turns the flag on/off.
 *   Only appears inside the shell on devices with biometry or a passcode.
 *
 * The lock is a privacy screen, not a security boundary — the session cookie
 * is what authenticates; this keeps a picked-up phone from browsing jobs,
 * clients, and money.
 */

// Quick app switches (maps, a text, the camera roll) shouldn't re-prompt;
// anything longer than this in the background does.
const RELOCK_AFTER_MS = 30_000;

export default function AppLock() {
  const [locked, setLocked] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const authBusy = useRef(false);
  const hiddenAt = useRef<number | null>(null);

  const tryUnlock = useCallback(async () => {
    if (authBusy.current) return;
    authBusy.current = true;
    setPrompting(true);
    const ok = await biometricAuthenticate("Unlock WorkBench");
    authBusy.current = false;
    setPrompting(false);
    if (ok) setLocked(false);
  }, []);

  useEffect(() => {
    if (!nativePlatform() || !appLockEnabled()) return;

    // Cold start: lock immediately, prompt once the webview has settled —
    // firing the native sheet mid-launch can drop it behind the splash.
    setLocked(true);
    const t = setTimeout(() => void tryUnlock(), 400);

    // Same promise/sync normalization as NativeShell's listen()
    type Handle = { remove: () => void };
    let handle: Handle | undefined;
    const res = getCapacitor()?.Plugins?.App?.addListener?.(
      "appStateChange",
      ({ isActive }: { isActive: boolean }) => {
        if (!appLockEnabled()) return;
        if (!isActive) {
          // The native auth sheet itself briefly backgrounds the webview on
          // some OS versions — don't treat that as leaving the app.
          if (!authBusy.current && hiddenAt.current === null) hiddenAt.current = Date.now();
          return;
        }
        const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
        hiddenAt.current = null;
        if (away > RELOCK_AFTER_MS) {
          setLocked(true);
          void tryUnlock();
        }
      }
    );
    if (res && typeof res.then === "function") res.then((h: Handle) => (handle = h)).catch(() => {});
    else if (res) handle = res as Handle;

    return () => {
      clearTimeout(t);
      handle?.remove();
    };
  }, [tryUnlock]);

  if (!locked) return null;

  return (
    <div
      className="fixed inset-0 z-[500] flex flex-col items-center justify-center gap-4 bg-white [[data-mode=dark]_&]:bg-[#0B1120]"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="w-16 h-16 rounded-full bg-gray-100 [[data-mode=dark]_&]:bg-white/10 flex items-center justify-center">
        <Lock size={26} className="text-gray-500 [[data-mode=dark]_&]:text-gray-300" />
      </div>
      <p className="text-sm font-semibold text-gray-700 [[data-mode=dark]_&]:text-gray-200">
        WorkBench is locked
      </p>
      <button
        onClick={() => void tryUnlock()}
        disabled={prompting}
        className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-50"
      >
        {prompting ? <Loader2 size={14} className="animate-spin" /> : <ScanFace size={14} />}
        Unlock
      </button>
    </div>
  );
}

/** My Profile card: per-device app-lock switch (native shell only). */
export function AppLockToggleCard() {
  const [info, setInfo] = useState<BiometryInfo | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!nativePlatform()) return;
    setOn(appLockEnabled());
    void checkBiometry().then((i) => setInfo(i));
  }, []);

  // Web, no biometry/passcode, or a shell built before the plugin: no card.
  if (!info?.available) return null;

  const toggle = async () => {
    if (on) {
      setAppLockEnabled(false);
      setOn(false);
      return;
    }
    // Prove the prompt works before trusting it as the way back in
    setBusy(true);
    const ok = await biometricAuthenticate("Turn on app lock");
    setBusy(false);
    if (ok) {
      setAppLockEnabled(true);
      setOn(true);
    }
  };

  return (
    <div className="card-ledger p-5 mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-gray-500 mb-1">App lock</h2>
          <p className="text-sm text-gray-600 max-w-md">
            Require {info.label} to open WorkBench on this device.
          </p>
        </div>
        <button
          onClick={() => void toggle()}
          disabled={busy}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-50 shrink-0 ${
            on
              ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
              : "bg-green-500 hover:bg-green-600 active:bg-green-700 text-white"
          }`}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ScanFace size={13} />}
          {on ? "Turn off" : "Turn on"}
        </button>
      </div>
      {on && (
        <p className="mt-2 text-xs text-green-700 flex items-center gap-1">
          <ShieldCheck size={12} /> {info.label} is required to open the app on this device.
        </p>
      )}
    </div>
  );
}
