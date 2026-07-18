"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2, X } from "lucide-react";
import { postJson } from "@/lib/safe-fetch";
import { getCapacitor, nativePlatform } from "@/components/NativeShell";

/**
 * Push subscribe/unsubscribe. Two paths behind one hook:
 * - Web: service worker + VAPID. iOS only exposes the Push API inside a
 *   home-screen ("Add to Home Screen") install.
 * - Native shell (Capacitor): the PushNotifications plugin registers the
 *   device with FCM/APNs and we store the device token server-side.
 * Every platform requires the permission prompt to come from a user tap —
 * so this is a button, never an automatic prompt.
 */

type PushState =
  | "loading" // still detecting
  | "unsupported" // browser has no Push API (e.g. iOS Safari outside the installed app)
  | "unconfigured" // server has no VAPID keys
  | "denied" // user blocked notifications at the browser level
  | "off"
  | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const isIos = () =>
  typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true);

const NATIVE_TOKEN_KEY = "sfh-native-push-token";

/**
 * Register this native device and sync its token to the server. Resolves true
 * on success. The token arrives via an event, hence the promise wrapper.
 */
function registerNative(push: any, platform: "ios" | "android"): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const handles: { remove: () => void }[] = [];
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      for (const h of handles) h.remove();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 15_000);

    Promise.all([
      push.addListener("registration", async (t: { value: string }) => {
        clearTimeout(timer);
        const { ok } = await postJson("/api/app/push", { platform, token: t.value });
        if (ok) {
          try {
            localStorage.setItem(NATIVE_TOKEN_KEY, t.value);
          } catch {}
        }
        finish(ok);
      }),
      push.addListener("registrationError", () => {
        clearTimeout(timer);
        finish(false);
      }),
    ])
      .then((hs) => {
        handles.push(...hs);
        return push.register();
      })
      .catch(() => {
        clearTimeout(timer);
        finish(false);
      });
  });
}

export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Native shell: the Capacitor plugin owns registration, not the SW path
      const platform = nativePlatform();
      if (platform) {
        const push = getCapacitor()?.Plugins?.PushNotifications;
        if (!push) return setState("unsupported");
        try {
          const perm = await push.checkPermissions();
          if (cancelled) return;
          if (perm.receive === "denied") return setState("denied");
          if (perm.receive === "granted") {
            // Re-register on every launch: FCM tokens rotate
            await registerNative(push, platform);
            if (!cancelled) setState("on");
          } else {
            setState("off");
          }
        } catch {
          if (!cancelled) setState("unsupported");
        }
        return;
      }

      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      try {
        const [keyRes, reg] = await Promise.all([
          fetch("/api/app/push"),
          navigator.serviceWorker.register("/sw.js"),
        ]);
        const key: string | null = keyRes.ok ? (await keyRes.json()).publicKey : null;
        if (cancelled) return;
        if (!key) return setState("unconfigured");
        if (Notification.permission === "denied") return setState("denied");
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (sub && Notification.permission === "granted") {
          // Re-sync so a pruned/lost server row comes back on next visit
          await postJson("/api/app/push", sub.toJSON());
          setState("on");
        } else {
          setState("off");
        }
      } catch {
        if (!cancelled) setState("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Returns true when notifications ended up enabled. */
  const enable = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const platform = nativePlatform();
      if (platform) {
        const push = getCapacitor()?.Plugins?.PushNotifications;
        if (!push) {
          setState("unsupported");
          return false;
        }
        const perm = await push.requestPermissions();
        if (perm.receive !== "granted") {
          setState(perm.receive === "denied" ? "denied" : "off");
          return false;
        }
        const ok = await registerNative(push, platform);
        setState(ok ? "on" : "off");
        return ok;
      }

      const keyRes = await fetch("/api/app/push");
      const key: string | null = keyRes.ok ? (await keyRes.json()).publicKey : null;
      if (!key) {
        setState("unconfigured");
        return false;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
        }));
      const { ok } = await postJson("/api/app/push", sub.toJSON());
      setState(ok ? "on" : "off");
      return ok;
    } catch {
      setState("off");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      if (nativePlatform()) {
        const push = getCapacitor()?.Plugins?.PushNotifications;
        let token: string | null = null;
        try {
          token = localStorage.getItem(NATIVE_TOKEN_KEY);
        } catch {}
        if (token) {
          await postJson("/api/app/push", { endpoint: token }, "DELETE");
          try {
            localStorage.removeItem(NATIVE_TOKEN_KEY);
          } catch {}
        }
        await push?.unregister?.().catch(() => {});
        setState("off");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await postJson("/api/app/push", { endpoint: sub.endpoint }, "DELETE");
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, enable, disable };
}

/** Profile-page card: the per-user notifications switch for this device. */
export function PushToggleCard() {
  const { state, busy, enable, disable } = usePush();

  const explainer =
    state === "unsupported" && isIos() && !isStandalone()
      ? "On iPhone, notifications need the home-screen app: open workbenchfsm.com in Safari, tap Share, then \"Add to Home Screen\", and turn this on from inside it."
      : state === "unsupported"
        ? "This browser doesn't support push notifications."
        : state === "denied"
          ? "Notifications are blocked for this site in your browser settings — allow them there, then come back."
          : state === "unconfigured"
            ? "Push isn't configured on the server yet."
            : "Get notified on this device about new requests, team chat messages, bookings to approve, and payments.";

  return (
    <div className="card-ledger p-5 mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Notifications on this device
          </h2>
          <p className="text-sm text-gray-600 max-w-md">{explainer}</p>
        </div>
        {(state === "on" || state === "off" || state === "loading") && (
          <button
            onClick={state === "on" ? disable : enable}
            disabled={busy || state === "loading"}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-full transition-colors disabled:opacity-50 shrink-0 ${
              state === "on"
                ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
                : "bg-green-500 hover:bg-green-600 active:bg-green-700 text-white"
            }`}
          >
            {busy || state === "loading" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : state === "on" ? (
              <BellOff size={13} />
            ) : (
              <Bell size={13} />
            )}
            {state === "on" ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>
      {state === "on" && (
        <p className="mt-2 text-xs text-green-700 flex items-center gap-1">
          <BellRing size={12} /> Notifications are on for this device.
        </p>
      )}
    </div>
  );
}

const NUDGE_KEY = "sfh-push-nudge-dismissed";

/**
 * One-time dashboard nudge. Renders nothing when push is on, unsupported,
 * blocked, unconfigured, or previously dismissed on this device.
 */
export function PushNudge() {
  const { state, busy, enable } = usePush();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(NUDGE_KEY) === "1");
    } catch {
      /* storage blocked — keep it hidden rather than nag every load */
    }
  }, []);

  if (dismissed || state !== "off") return null;

  return (
    <div className="card-ledger p-4 mb-6 flex flex-wrap items-center gap-3">
      <Bell size={18} className="text-gray-400 shrink-0" />
      <p className="flex-1 min-w-52 text-sm text-gray-700">
        Turn on notifications to hear about new requests, chat messages, and payments the
        moment they happen.
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={async () => {
            // A failed attempt (e.g. native push not provisioned yet) should
            // not leave the nudge nagging — the profile toggle remains for
            // retries.
            if (!(await enable())) {
              try {
                localStorage.setItem(NUDGE_KEY, "1");
              } catch {}
              setDismissed(true);
            }
          }}
          disabled={busy}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
          Turn on
        </button>
        <button
          onClick={() => {
            try {
              localStorage.setItem(NUDGE_KEY, "1");
            } catch {}
            setDismissed(true);
          }}
          aria-label="Dismiss"
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full transition-colors"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
