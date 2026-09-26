"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, ShieldCheck } from "lucide-react";
import Modal from "@/components/Modal";
import { inputCls } from "@/components/Input";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { nativeAppleIdToken, nativeGoogleIdToken } from "@/lib/native-social-signin";
import type { SocialSignIn } from "@/lib/sign-in-options";
import { AppleMark, GoogleMark, useSocialSignInOffered, type SocialProviderId } from "@/components/SocialSignInButtons";

export { GoogleMark };

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
 * Google or Apple and no password verifies with that provider — nothing
 * sends it through Forgot password any more.
 *
 * On the web a provider verification is a full round-trip (the page comes
 * back with ?reauth=ok); `what` is remembered in sessionStorage so the
 * caller can resume — read `pending` after mount. In the native apps the
 * plugin's sheet produces an ID token in place, no navigation.
 */

export type SignInMethods = {
  hasPassword: boolean;
  /** A Google account is connected to this login. */
  google: boolean;
  /** An Apple ID is connected to this login. */
  apple: boolean;
  /** Which providers this surface can run, and how (lib/sign-in-options.ts). */
  social: SocialSignIn;
};

const PENDING_KEY = "wb-verify-pending";
const LABEL: Record<SocialProviderId, string> = { google: "Google", apple: "Apple" };

export type Flash = { kind: "ok" | "error"; text: string } | null;

export function useVerifyIdentity(methods: SignInMethods, returnTo: string) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<SocialProviderId | "password" | null>(null);
  const [error, setError] = useState("");
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const what = useRef("");
  const runnable = useSocialSignInOffered(methods.social);

  // Coming back from a web provider round-trip, or just loading: is there a
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
        setFlash({ kind: "ok", text: "Verified. You can make changes for the next 10 minutes." });
      } else {
        setFlash({
          kind: "error",
          text: "That account isn't connected to this login, so it can't verify it. Try again with the one you sign in with.",
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
    setBusy(null);
    if (ok) setFresh(true);
    resolver.current?.(ok);
    resolver.current = null;
  }

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy("password");
    setError("");
    const res = await postJson("/api/app/auth/reauth", { method: "password", currentPassword: password });
    if (!res.ok) {
      setBusy(null);
      setError(res.data?.error ?? GENERIC_ERROR);
      return;
    }
    finish(true);
  }

  async function withProvider(provider: SocialProviderId) {
    setBusy(provider);
    setError("");
    if (methods.social[provider] === "native") {
      const token =
        provider === "google" ? await nativeGoogleIdToken(methods.social) : await nativeAppleIdToken(methods.social);
      if (!token.ok) {
        setBusy(null);
        if (!token.canceled) setError(`Couldn't verify with ${LABEL[provider]} — please try again.`);
        return;
      }
      const res = await postJson("/api/app/auth/reauth", { method: provider, idToken: token.idToken });
      if (!res.ok) {
        setBusy(null);
        setError(res.data?.error ?? GENERIC_ERROR);
        return;
      }
      finish(true);
      return;
    }
    // Web: remember what they were doing, then go through the provider. The
    // OAuth callback mints the proof and lands back on returnTo?reauth=ok.
    try {
      sessionStorage.setItem(PENDING_KEY, what.current);
    } catch {}
    const start = await postJson<{ returnTo: string }>("/api/app/auth/reauth", {
      method: provider,
      start: true,
      returnTo,
    });
    if (!start.ok) {
      setBusy(null);
      setError(start.data?.error ?? GENERIC_ERROR);
      return;
    }
    signIn(provider, { callbackUrl: start.data?.returnTo ?? returnTo }).catch(() => setBusy(null));
  }

  const providers = (["google", "apple"] as SocialProviderId[]).filter((p) => methods[p] && runnable[p]);
  const passwordOffered = methods.hasPassword;

  const dialog = (
    <Modal open={open} onClose={() => !busy && finish(false)}>
      <div className="flex items-center gap-2.5 mb-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[color:var(--ds-primary)]">
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
          <button type="submit" disabled={busy !== null || !password} className="btn-primary justify-center">
            {busy === "password" ? <Loader2 size={14} className="animate-spin" /> : null}
            Continue
          </button>
        </form>
      )}

      {passwordOffered && providers.length > 0 && (
        <div className="my-3 flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          or
          <span className="h-px flex-1 bg-gray-200" />
        </div>
      )}

      {providers.length > 0 && (
        <div className="flex flex-col gap-2">
          {providers.map((provider) =>
            provider === "google" ? (
              <button
                key="google"
                type="button"
                onClick={() => void withProvider("google")}
                disabled={busy !== null}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white py-2.5 text-[15px] font-semibold text-gray-800 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60"
              >
                {busy === "google" ? <Loader2 size={18} className="animate-spin text-gray-500" /> : <GoogleMark />}
                Continue with Google
              </button>
            ) : (
              <button
                key="apple"
                type="button"
                onClick={() => void withProvider("apple")}
                disabled={busy !== null}
                className="flex w-full items-center justify-center gap-3 rounded-lg bg-black py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-gray-900 active:bg-gray-800 disabled:opacity-60"
              >
                {busy === "apple" ? <Loader2 size={18} className="animate-spin text-gray-300" /> : <AppleMark />}
                Continue with Apple
              </button>
            )
          )}
        </div>
      )}

      {!passwordOffered && providers.length === 0 && (
        <p className="text-sm text-gray-600">
          This login has no way to verify itself from here. Use{" "}
          <span className="font-medium">Forgot password</span> on the login page to set a password first.
        </p>
      )}

      <button
        type="button"
        onClick={() => finish(false)}
        disabled={busy !== null}
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
