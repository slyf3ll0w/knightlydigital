"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, ShieldCheck } from "lucide-react";
import Modal from "@/components/Modal";
import { inputCls } from "@/components/Input";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { isNativeGoogleAvailable, nativeGoogleIdToken } from "@/lib/native-google-signin";

/**
 * "Verify it's you" — the recent-authentication step in front of every
 * sensitive account change (connect/disconnect a sign-in method, change the
 * sign-in email, set or change the password, delete the account), the way
 * Google, GitHub and Apple gate theirs. Server side: lib/reauth.ts.
 *
 *   const { verify, dialog, flash } = useVerifyIdentity(methods, "/app/settings/profile");
 *   …
 *   if (!(await verify("delete-account"))) return;   // resolves true once proven
 *   …
 *   {dialog}
 *
 * Proof lasts ten minutes, so a run of changes asks once. How they prove it
 * depends on what the login has: the password, and/or a fresh sign-in
 * through a provider already connected to the account. A login opened with
 * Google and no password verifies with Google — nothing sends it through
 * Forgot password any more.
 *
 * On the web a Google verification is a full round-trip (the page comes
 * back with ?reauth=ok); `what` is remembered in sessionStorage so the
 * caller can resume — read `pending` after mount. In the Android shell the
 * plugin's sheet produces an ID token in place, no navigation.
 */

export type SignInMethods = {
  hasPassword: boolean;
  /** A Google account is connected to this login. */
  google: boolean;
  apple: boolean;
  /** The web OAuth path is usable from this browser (not an old shell). */
  googleWebEnabled: boolean;
  /** Android app only — verify through the plugin's sheet instead of a redirect. */
  googleNativeClientId: string | null;
};

const PENDING_KEY = "wb-verify-pending";

export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export type Flash = { kind: "ok" | "error"; text: string } | null;

export function useVerifyIdentity(methods: SignInMethods, returnTo: string) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nativeReady, setNativeReady] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const what = useRef("");

  useEffect(() => {
    if (methods.googleNativeClientId) setNativeReady(isNativeGoogleAvailable());
  }, [methods.googleNativeClientId]);

  // Coming back from a web Google round-trip, or just loading: is there a
  // live proof already?
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("reauth");
    if (outcome) {
      let p: string | null = null;
      try {
        p = sessionStorage.getItem(PENDING_KEY);
        sessionStorage.removeItem(PENDING_KEY);
      } catch {}
      if (outcome === "ok") {
        setFresh(true);
        setPending(p);
        setFlash({ kind: "ok", text: "Verified with Google. You can make changes for the next 10 minutes." });
      } else {
        setFlash({
          kind: "error",
          text: "That Google account isn't connected to this login, so it can't verify it. Try again with the one you sign in with.",
        });
      }
      params.delete("reauth");
      const qs = params.toString();
      router.replace(window.location.pathname + (qs ? `?${qs}` : ""));
      return;
    }
    fetch("/api/app/auth/reauth")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFresh(Boolean(d?.fresh)))
      .catch(() => {});
  }, [router]);

  const verify = useCallback(
    (action: string): Promise<boolean> => {
      if (fresh) return Promise.resolve(true);
      what.current = action;
      setError("");
      setPassword("");
      setOpen(true);
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
      });
    },
    [fresh]
  );

  function finish(ok: boolean) {
    setOpen(false);
    setBusy(false);
    if (ok) setFresh(true);
    resolver.current?.(ok);
    resolver.current = null;
  }

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    const res = await postJson("/api/app/auth/reauth", { method: "password", currentPassword: password });
    if (!res.ok) {
      setBusy(false);
      setError(res.data?.error ?? GENERIC_ERROR);
      return;
    }
    finish(true);
  }

  async function withGoogle() {
    setBusy(true);
    setError("");
    if (methods.googleNativeClientId && nativeReady) {
      const token = await nativeGoogleIdToken(methods.googleNativeClientId);
      if (!token.ok) {
        setBusy(false);
        if (!token.canceled) setError("Couldn't verify with Google — please try again.");
        return;
      }
      const res = await postJson("/api/app/auth/reauth", { method: "google", idToken: token.idToken });
      if (!res.ok) {
        setBusy(false);
        setError(res.data?.error ?? GENERIC_ERROR);
        return;
      }
      finish(true);
      return;
    }
    // Web: remember what they were doing, then go through Google. The OAuth
    // callback mints the proof and lands back on returnTo?reauth=ok.
    try {
      sessionStorage.setItem(PENDING_KEY, what.current);
    } catch {}
    const start = await postJson<{ returnTo: string }>("/api/app/auth/reauth", {
      method: "google",
      start: true,
      returnTo,
    });
    if (!start.ok) {
      setBusy(false);
      setError(start.data?.error ?? GENERIC_ERROR);
      return;
    }
    signIn("google", { callbackUrl: start.data?.returnTo ?? returnTo }).catch(() => setBusy(false));
  }

  const googleOffered = methods.google && (methods.googleNativeClientId ? nativeReady : methods.googleWebEnabled);
  const passwordOffered = methods.hasPassword;

  const dialog = (
    <Modal open={open} onClose={() => !busy && finish(false)}>
      <div className="flex items-center gap-2.5 mb-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[#0B57D8]">
          <ShieldCheck size={16} />
        </span>
        <h2 className="text-base font-semibold text-gray-900">Verify it&apos;s you</h2>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        For your security, confirm it&apos;s really you before making this change.
      </p>

      {error && (
        <div role="alert" className="form-error mb-3">
          {error}
        </div>
      )}

      {passwordOffered && (
        <form onSubmit={withPassword} className="flex flex-col gap-2">
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Your password</span>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </label>
          <button type="submit" disabled={busy || !password} className="btn-primary justify-center">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Continue
          </button>
        </form>
      )}

      {passwordOffered && googleOffered && (
        <div className="my-3 flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          or
          <span className="h-px flex-1 bg-gray-200" />
        </div>
      )}

      {googleOffered && (
        <button
          type="button"
          onClick={() => void withGoogle()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white py-2.5 text-[15px] font-semibold text-gray-800 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60"
        >
          {busy && !passwordOffered ? <Loader2 size={18} className="animate-spin text-gray-500" /> : <GoogleMark />}
          Continue with Google
        </button>
      )}

      {!passwordOffered && !googleOffered && (
        <p className="text-sm text-gray-600">
          This login has no way to verify itself from here. Use{" "}
          <span className="font-medium">Forgot password</span> on the login page to set a password first.
        </p>
      )}

      <button
        type="button"
        onClick={() => finish(false)}
        disabled={busy}
        className="mt-3 w-full text-center text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
      >
        Cancel
      </button>
    </Modal>
  );

  return { verify, fresh, flash, setFlash, pending, clearPending: () => setPending(null), dialog };
}

/** The green/red strip a page shows for the verify outcome. */
export function FlashBanner({ flash, onClose }: { flash: Flash; onClose?: () => void }) {
  if (!flash) return null;
  return flash.kind === "ok" ? (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
      <span className="flex items-center gap-1.5">
        <ShieldCheck size={14} /> {flash.text}
      </span>
      {onClose && (
        <button type="button" onClick={onClose} className="text-xs font-medium text-green-900 hover:underline">
          Dismiss
        </button>
      )}
    </div>
  ) : (
    <div role="alert" className="form-error mb-4">
      {flash.text}
    </div>
  );
}
