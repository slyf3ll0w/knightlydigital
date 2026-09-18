"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Check, Loader2 } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { isNativeGoogleAvailable, nativeGoogleIdToken } from "@/lib/native-google-signin";
import { confirmSheet } from "@/components/ConfirmSheet";

export type ConnectedIdentity = {
  provider: string;
  email: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

const LABEL: Record<string, string> = { google: "Google", apple: "Apple" };

// Copy for the ?link-error= code the OAuth callback sends back with.
function linkErrorMessage(code: string): string {
  if (code === "identity-taken")
    return "That Google account is already connected to a different WorkBench login. Sign out, sign in with Google, and you'll land on that one.";
  return "Couldn't connect Google sign-in — please try again.";
}

/**
 * Settings → My Profile: which third-party sign-ins open this login.
 *
 * Connect on the web = a normal Google round-trip while signed in (the
 * callback binds the identity to THIS account, lib/auth-options.ts). In the
 * Android app there is no redirect to come back from, so the native sheet
 * produces an ID token and POSTs it — which also keeps the session exactly
 * where it is, instead of re-minting it onto whichever company the resolver
 * would have picked.
 *
 * Disconnect = DELETE, refused server-side when it would leave no way in.
 */
export default function ConnectedSignInsCard({
  googleEnabled,
  googleNativeClientId = null,
  hasPassword,
  initialIdentities,
}: {
  googleEnabled: boolean;
  /** Android app only — connect through the plugin instead of a redirect. */
  googleNativeClientId?: string | null;
  hasPassword: boolean;
  initialIdentities: ConnectedIdentity[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [identities, setIdentities] = useState(initialIdentities);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  // Only true in a shell that actually ships the plugin; versionCode 3 is
  // live on Play without it and loads this same code.
  const [nativeReady, setNativeReady] = useState(false);
  useEffect(() => {
    if (googleNativeClientId) setNativeReady(isNativeGoogleAvailable());
  }, [googleNativeClientId]);

  // Read the callback's verdict once, then scrub it so a refresh doesn't
  // resurrect a stale message.
  useEffect(() => {
    const linked = params.get("linked");
    const linkError = params.get("link-error");
    if (!linked && !linkError) return;
    if (linked) setFlash(`${LABEL[linked] ?? linked} sign-in connected.`);
    if (linkError) setError(linkErrorMessage(linkError));
    router.replace("/app/settings/profile");
  }, [params, router]);

  const google = identities.find((i) => i.provider === "google");

  // Connecting is a way in that outlives a password reset, so a login with a
  // password re-enters it first — the same proof the email and password
  // changes take. Password-less logins have nothing to re-enter.
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");

  function startConnect() {
    setError("");
    setFlash("");
    if (hasPassword) {
      setConfirming(true);
      return;
    }
    void connectGoogle();
  }

  async function connectGoogle() {
    setBusy(true);
    setError("");

    if (googleNativeClientId && nativeReady) {
      const token = await nativeGoogleIdToken(googleNativeClientId);
      if (!token.ok) {
        setBusy(false);
        // Backing out of the account sheet is not a failure to report.
        if (!token.canceled) setError("Couldn't connect Google sign-in — please try again.");
        return;
      }
      const res = await postJson<{ identities: ConnectedIdentity[] }>(
        "/api/app/profile/identities",
        {
          provider: "google",
          idToken: token.idToken,
          currentPassword: password,
        }
      );
      setBusy(false);
      if (!res.ok) return setError(res.data?.error ?? GENERIC_ERROR);
      // The route returns the fresh list, so the card updates without a
      // reload — there was no navigation to piggyback on.
      if (Array.isArray(res.data?.identities)) setIdentities(res.data.identities);
      setConfirming(false);
      setPassword("");
      setFlash("Google sign-in connected.");
      return;
    }

    // Web: the password can't ride along on Google's redirect, so it mints
    // a short-lived grant cookie the OAuth callback checks before linking.
    if (hasPassword) {
      const grant = await postJson("/api/app/profile/identities/grant", { currentPassword: password });
      if (!grant.ok) {
        setBusy(false);
        return setError(grant.data?.error ?? GENERIC_ERROR);
      }
    }
    signIn("google", { callbackUrl: "/app/settings/profile" }).catch(() => setBusy(false));
  }

  async function disconnect(provider: string) {
    const label = LABEL[provider] ?? provider;
    const ok = await confirmSheet({
      title: `Disconnect ${label} sign-in?`,
      message: hasPassword
        ? `You'll sign in with your email and password from now on. You can reconnect ${label} any time.`
        : `This login has no password yet, so ${label} is currently the only way in. Set a password first (Forgot password on the login page), then disconnect.`,
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    const res = await postJson(`/api/app/profile/identities?provider=${provider}`, undefined, "DELETE");
    setBusy(false);
    if (!res.ok) return setError(res.data?.error ?? GENERIC_ERROR);
    setIdentities((list) => list.filter((i) => i.provider !== provider));
    setFlash(`${label} sign-in disconnected.`);
  }

  // In a shell too old for the plugin there is no way to connect, so the
  // card is only worth showing if something is already connected.
  const canConnect = googleEnabled && (!googleNativeClientId || nativeReady);
  if (!canConnect && identities.length === 0) return null;

  return (
    <div className="card-ledger p-5 mt-5">
      <h2 className="text-[13px] font-semibold text-gray-500 mb-1">Connected sign-ins</h2>
      <p className="text-sm text-gray-600 mb-4">
        Other ways to open this login besides your password.
        {!hasPassword && (
          <>
            {" "}
            This login has no password yet — use <span className="font-medium">Forgot password</span> on
            the login page to add one.
          </>
        )}
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {flash && !error && (
        <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <Check size={13} /> {flash}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          <div>
            <div className="text-sm font-semibold text-gray-900">Google</div>
            <div className="text-xs text-gray-500">
              {google
                ? `Connected${google.email ? ` · ${google.email}` : ""}`
                : "Not connected"}
            </div>
          </div>
        </div>
        {google ? (
          <button
            type="button"
            onClick={() => disconnect("google")}
            disabled={busy}
            className="px-4 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors shrink-0 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : "Disconnect"}
          </button>
        ) : canConnect && !confirming ? (
          <button
            type="button"
            onClick={startConnect}
            disabled={busy}
            className="px-4 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors shrink-0 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : "Connect Google"}
          </button>
        ) : null}
      </div>

      {confirming && !google && (
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void connectGoogle();
          }}
        >
          <label className="flex-1">
            <span className="block text-xs font-medium text-gray-600 mb-1">
              Confirm your password to connect Google
            </span>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !password}
              className="px-4 py-2 rounded-[10px] bg-[#0B57D8] text-sm font-semibold text-white hover:bg-[#0A4CBB] transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : "Continue"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setPassword("");
                setError("");
              }}
              className="px-4 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
