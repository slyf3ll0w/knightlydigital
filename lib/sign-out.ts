"use client";

import { useCallback, useState } from "react";
import { signOut } from "next-auth/react";
import { rememberVoipToken, rememberedVoipToken } from "@/lib/native-voip";
import { attemptSignOut } from "@/lib/sign-out-core";

/** What to tell the person when the sign-out request never got through. */
export const SIGN_OUT_FAILED = "Couldn't reach WorkBench to sign you out. Check your connection and try again.";

let inFlight: Promise<boolean> | null = null;

/**
 * Sign out from inside the app. Resolves `true` once the session is gone and
 * the page is on its way to `callbackUrl`, `false` when the request could
 * not reach the server and the person is STILL SIGNED IN — show
 * SIGN_OUT_FAILED in that case; a tap that silently does nothing reads as a
 * broken button.
 *
 * next-auth's own signOut() POSTs with a bare fetch, no try/catch, so a
 * dropped request (Safari's "TypeError: Load failed" on an iPhone whose
 * radio was still waking up — Sentry bcc717b4, 2026-10-04) used to escape
 * as an unhandled rejection. The request is now retried once
 * (lib/sign-out-core.ts) and never thrown to the caller.
 *
 * On the iPhone the device's VoIP token is dropped first: a phone that is
 * signed out must not keep ringing for the business line (the push would
 * show a call nobody can answer). It has to go before the session does —
 * the DELETE needs it — so a failed sign-out puts the token back.
 */
export function appSignOut(callbackUrl = "/app/login"): Promise<boolean> {
  // A second tap while the first is in flight joins it rather than starting
  // another request against a page that is about to navigate.
  if (!inFlight) {
    inFlight = run(callbackUrl).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/**
 * A Sign out button's state: `signingOut` while the request runs (and for
 * good once it succeeds — the page is leaving), `failed` when the person is
 * still signed in and the button should carry SIGN_OUT_FAILED under it.
 */
export function useAppSignOut(callbackUrl = "/app/login") {
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const signOut = useCallback(async () => {
    setFailed(false);
    setSigningOut(true);
    if (await appSignOut(callbackUrl)) return;
    setSigningOut(false);
    setFailed(true);
  }, [callbackUrl]);
  return { signingOut, failed, signOut };
}

async function run(callbackUrl: string): Promise<boolean> {
  const token = rememberedVoipToken();
  if (token) {
    await fetch("/api/app/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: token }),
      keepalive: true,
    }).catch(() => {});
    rememberVoipToken(null);
  }

  const url = await attemptSignOut(async () => {
    const res = await signOut({ redirect: false, callbackUrl });
    return res?.url || callbackUrl;
  });

  if (url === null) {
    if (token) {
      // Still signed in, so the phone must keep ringing for the line.
      rememberVoipToken(token);
      void fetch("/api/app/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "ios-voip", token }),
      }).catch(() => {});
    }
    return false;
  }

  // What next-auth does for redirect: true — a full navigation, and a reload
  // when only the hash changed (the browser would not reload on its own).
  window.location.href = url;
  if (url.includes("#")) window.location.reload();
  return true;
}
