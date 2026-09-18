"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Check, KeyRound, Loader2 } from "lucide-react";
import { inputCls } from "@/components/Input";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { isNativeGoogleAvailable, nativeGoogleIdToken } from "@/lib/native-google-signin";
import { confirmSheet } from "@/components/ConfirmSheet";
import { saveCredential } from "@/lib/save-credential";
import { GoogleMark } from "@/components/VerifyIdentity";

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
 * Settings → My Profile → Sign-in methods: the ways this login opens, as one
 * list — Password, Google, Apple (when the iOS build ships) — each with its
 * own set / change / connect / disconnect, the way Google, GitHub and Apple
 * lay theirs out. Every change here goes through "verify it's you" first
 * (components/VerifyIdentity.tsx), so a login opened with Google and no
 * password can add one right here instead of round-tripping through Forgot
 * password.
 *
 * Connect on the web = a Google round-trip while signed in (the callback
 * binds the identity to THIS account, lib/auth-options.ts — only with a
 * fresh proof). In the Android app the native sheet produces an ID token and
 * POSTs it, which keeps the session exactly where it is.
 */
export default function SignInMethodsCard({
  email,
  hasPassword,
  identities,
  googleWebEnabled,
  googleNativeClientId = null,
  verify,
  onPasswordSet,
  onIdentities,
}: {
  email: string;
  hasPassword: boolean;
  identities: ConnectedIdentity[];
  /** Google sign-in configured and usable from this browser (not an old shell). */
  googleWebEnabled: boolean;
  /** Android app only — connect Google through the plugin, not a redirect. */
  googleNativeClientId?: string | null;
  /** From useVerifyIdentity — resolves true once the person has proved it's them. */
  verify: (what: string) => Promise<boolean>;
  onPasswordSet: () => void;
  onIdentities: (list: ConnectedIdentity[]) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [nativeReady, setNativeReady] = useState(false);
  useEffect(() => {
    if (googleNativeClientId) setNativeReady(isNativeGoogleAvailable());
  }, [googleNativeClientId]);

  // Read the link round-trip's verdict once, then scrub it so a refresh
  // doesn't resurrect a stale message.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("linked");
    const linkError = params.get("link-error");
    if (!linked && !linkError) return;
    if (linked) setFlash(`${LABEL[linked] ?? linked} sign-in connected.`);
    if (linkError) setError(linkErrorMessage(linkError));
    params.delete("linked");
    params.delete("link-error");
    const qs = params.toString();
    router.replace(window.location.pathname + (qs ? `?${qs}` : ""));
  }, [router]);

  const google = identities.find((i) => i.provider === "google");

  // ── Password ───────────────────────────────────────────────────────────
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaved, setPwSaved] = useState(false);

  async function openPassword() {
    setError("");
    setFlash("");
    // Setting a first password has no "current" to type — the proof is the
    // verify step. Changing one takes the current password in the form.
    if (!hasPassword && !(await verify("set-password"))) return;
    setPwOpen(true);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(
      "/api/app/profile",
      hasPassword ? { currentPassword, newPassword } : { newPassword },
      "PATCH"
    );
    setBusy(false);
    if (!ok) return setError(data?.error ?? GENERIC_ERROR);
    // Browsers routed here by /.well-known/change-password expect this form
    // to hand the updated credential back — offer it outright.
    await saveCredential(email, newPassword);
    setCurrentPassword("");
    setNewPassword("");
    setPwOpen(false);
    setPwSaved(true);
    setFlash(hasPassword ? "Password updated." : "Password set. You can now sign in with your email and password too.");
    if (!hasPassword) onPasswordSet();
  }

  // ── Google ─────────────────────────────────────────────────────────────
  async function connectGoogle() {
    setError("");
    setFlash("");
    if (!(await verify("connect-google"))) return;
    setBusy(true);

    if (googleNativeClientId && nativeReady) {
      const token = await nativeGoogleIdToken(googleNativeClientId);
      if (!token.ok) {
        setBusy(false);
        // Backing out of the account sheet is not a failure to report.
        if (!token.canceled) setError("Couldn't connect Google sign-in — please try again.");
        return;
      }
      const res = await postJson<{ identities: ConnectedIdentity[] }>("/api/app/profile/identities", {
        provider: "google",
        idToken: token.idToken,
      });
      setBusy(false);
      if (!res.ok) return setError(res.data?.error ?? GENERIC_ERROR);
      if (Array.isArray(res.data?.identities)) onIdentities(res.data.identities);
      setFlash("Google sign-in connected.");
      return;
    }

    signIn("google", { callbackUrl: "/app/settings/profile" }).catch(() => setBusy(false));
  }

  async function disconnect(provider: string) {
    const label = LABEL[provider] ?? provider;
    setError("");
    setFlash("");
    const ok = await confirmSheet({
      title: `Disconnect ${label} sign-in?`,
      message: hasPassword
        ? `You'll sign in with your email and password from now on. You can reconnect ${label} any time.`
        : `This login has no password yet, so ${label} is currently the only way in. Set a password first, then disconnect.`,
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    if (!(await verify(`disconnect-${provider}`))) return;
    setBusy(true);
    const res = await postJson(`/api/app/profile/identities?provider=${provider}`, undefined, "DELETE");
    setBusy(false);
    if (!res.ok) return setError(res.data?.error ?? GENERIC_ERROR);
    onIdentities(identities.filter((i) => i.provider !== provider));
    setFlash(`${label} sign-in disconnected.`);
  }

  // In a shell too old for the plugin there is no way to connect Google.
  const canConnectGoogle = googleWebEnabled || (Boolean(googleNativeClientId) && nativeReady);

  const rowBtn =
    "px-4 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors shrink-0 disabled:opacity-50";

  return (
    <div className="card-ledger p-5 mt-5">
      <h2 className="text-[13px] font-semibold text-gray-500 mb-1">Sign-in methods</h2>
      <p className="text-sm text-gray-600 mb-4">
        The ways this login opens. Changes here ask you to verify it&apos;s you first.
      </p>

      {error && (
        <div role="alert" className="form-error mb-3">
          {error}
        </div>
      )}
      {flash && !error && (
        <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <Check size={13} /> {flash}
        </div>
      )}

      <ul className="divide-y divide-gray-100">
        {/* Password */}
        <li className="py-3 first:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-5 w-5 items-center justify-center text-gray-500">
                <KeyRound size={18} />
              </span>
              <div>
                <div className="text-sm font-semibold text-gray-900">Password</div>
                <div className="text-xs text-gray-500">
                  {hasPassword ? `Set · sign in as ${email}` : "Not set"}
                </div>
              </div>
            </div>
            {!pwOpen && (
              <button type="button" onClick={() => void openPassword()} disabled={busy} className={rowBtn}>
                {hasPassword ? "Change" : "Add password"}
              </button>
            )}
          </div>
          {pwOpen && (
            <form onSubmit={savePassword} className="mt-3 flex flex-col gap-3 sm:ml-8">
              {/* A change-password form needs to name the account it belongs
                  to, or the manager has a new password and nothing to file it
                  under. The field is inert — it exists purely as that label. */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={email}
                readOnly
                hidden
                aria-hidden="true"
                tabIndex={-1}
              />
              <div className="grid sm:grid-cols-2 gap-3">
                {hasPassword && (
                  <div>
                    <label htmlFor="pw-current" className="block text-xs text-gray-500 mb-1">
                      Current password
                    </label>
                    <input
                      id="pw-current"
                      name="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      className={inputCls}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="pw-new" className="block text-xs text-gray-500 mb-1">
                    {hasPassword ? "New password (8+ characters)" : "Password (8+ characters)"}
                  </label>
                  <input
                    id="pw-new"
                    name="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy || newPassword.length < 8 || (hasPassword && !currentPassword)}
                  className="btn-primary"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : pwSaved && <Check size={13} />}
                  {hasPassword ? "Update password" : "Set password"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setPwOpen(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setError("");
                  }}
                  className={rowBtn}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </li>

        {/* Google */}
        <li className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <GoogleMark size={20} />
            <div>
              <div className="text-sm font-semibold text-gray-900">Google</div>
              <div className="text-xs text-gray-500">
                {google ? `Connected${google.email ? ` · ${google.email}` : ""}` : "Not connected"}
              </div>
            </div>
          </div>
          {google ? (
            <button type="button" onClick={() => void disconnect("google")} disabled={busy} className={rowBtn}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : "Disconnect"}
            </button>
          ) : canConnectGoogle ? (
            <button type="button" onClick={() => void connectGoogle()} disabled={busy} className={rowBtn}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : "Connect"}
            </button>
          ) : null}
        </li>

        {/* Apple — lands with the iOS build (docs/plans/social-login-2026-09-14.md) */}
        <li className="flex flex-wrap items-center justify-between gap-3 py-3 last:pb-0">
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="text-gray-900">
              <path
                fill="currentColor"
                d="M16.365 1.43c0 1.14-.417 2.2-1.245 3.06-.9.97-2.03 1.53-3.13 1.44a3.1 3.1 0 0 1-.03-.42c0-1.1.47-2.24 1.29-3.08.41-.45.93-.82 1.55-1.1.63-.28 1.22-.43 1.78-.46.02.19.03.38.03.56Zm3.56 16.53c-.36.83-.79 1.6-1.29 2.3-.68.96-1.24 1.63-1.67 2-.66.6-1.37.91-2.13.93-.55 0-1.21-.16-1.98-.47-.77-.32-1.48-.47-2.13-.47-.68 0-1.41.16-2.19.47-.78.32-1.41.48-1.89.5-.73.03-1.46-.29-2.17-.96-.47-.4-1.05-1.09-1.75-2.08-.75-1.05-1.36-2.27-1.84-3.66C.62 15.05.36 13.6.36 12.2c0-1.6.35-2.98 1.04-4.14a6.1 6.1 0 0 1 2.18-2.2 5.87 5.87 0 0 1 2.95-.83c.58 0 1.34.18 2.29.53.94.35 1.55.53 1.81.53.2 0 .87-.21 2.01-.62 1.08-.38 1.99-.54 2.73-.48 2.02.16 3.53.96 4.54 2.39-1.8 1.09-2.69 2.62-2.67 4.58.02 1.53.57 2.8 1.66 3.81.49.47 1.04.83 1.65 1.09-.13.39-.27.76-.43 1.11Z"
              />
            </svg>
            <div>
              <div className="text-sm font-semibold text-gray-900">Apple</div>
              <div className="text-xs text-gray-500">Coming with the iPhone app</div>
            </div>
          </div>
        </li>
      </ul>
    </div>
  );
}
