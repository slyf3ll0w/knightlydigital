"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Check, KeyRound, Loader2 } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import { inputCls } from "@/components/Input";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { nativeAppleIdToken, nativeGoogleIdToken } from "@/lib/native-social-signin";
import type { SocialSignIn } from "@/lib/sign-in-options";
import { confirmSheet } from "@/components/ConfirmSheet";
import { saveCredential } from "@/lib/save-credential";
import { AppleMark, GoogleMark, useSocialSignInOffered, type SocialProviderId } from "@/components/SocialSignInButtons";

export type ConnectedIdentity = {
  provider: string;
  email: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

const LABEL: Record<string, string> = { google: "Google", apple: "Apple" };

// Copy for the ?link-error= code the OAuth callback sends back with.
function linkErrorMessage(code: string, provider: string): string {
  const label = LABEL[provider] ?? "That";
  if (code === "identity-taken")
    return `That ${label} account is already connected to a different WorkBench login. Sign out, sign in with ${label}, and you'll land on that one.`;
  return `Couldn't connect ${label} sign-in — please try again.`;
}

/**
 * Settings → My Profile → Sign-in methods: the ways this login opens, as one
 * list — Password, Google, Apple — each with its own set / change / connect
 * / disconnect, the way Google, GitHub and Apple lay theirs out. Every
 * change here goes through "verify it's you" first
 * (components/VerifyIdentity.tsx), so a login opened with Google or Apple
 * and no password can add one right here instead of round-tripping through
 * Forgot password.
 *
 * Connect on the web = a provider round-trip while signed in (the callback
 * binds the identity to THIS account, lib/auth-options.ts — only with a
 * fresh proof). In the native apps the system sheet produces an ID token
 * and POSTs it, which keeps the session exactly where it is.
 */
export default function SignInMethodsCard({
  email,
  hasPassword,
  identities,
  social,
  verify,
  onPasswordSet,
  onIdentities,
}: {
  email: string;
  hasPassword: boolean;
  identities: ConnectedIdentity[];
  /** Which providers can be connected from here, and how (lib/sign-in-options.ts). */
  social: SocialSignIn;
  /** From useVerifyIdentity — resolves true once the person has proved it's them. */
  verify: (what: string) => Promise<boolean>;
  onPasswordSet: () => void;
  onIdentities: (list: ConnectedIdentity[]) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  // In a shell too old for the plugin there is no way to connect from here.
  const connectable = useSocialSignInOffered(social);

  // Read the link round-trip's verdict once, then scrub it so a refresh
  // doesn't resurrect a stale message.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("linked");
    const linkError = params.get("link-error");
    if (!linked && !linkError) return;
    if (linked) setFlash(`${LABEL[linked] ?? linked} sign-in connected.`);
    if (linkError) setError(linkErrorMessage(linkError, params.get("provider") ?? ""));
    params.delete("linked");
    params.delete("link-error");
    params.delete("provider");
    const qs = params.toString();
    router.replace(window.location.pathname + (qs ? `?${qs}` : ""));
  }, [router]);

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

  // ── Google / Apple ─────────────────────────────────────────────────────
  async function connect(provider: SocialProviderId) {
    const label = LABEL[provider];
    setError("");
    setFlash("");
    if (!(await verify(`connect-${provider}`))) return;
    setBusy(true);

    if (social[provider] === "native") {
      const token = provider === "google" ? await nativeGoogleIdToken(social) : await nativeAppleIdToken(social);
      if (!token.ok) {
        setBusy(false);
        // Backing out of the sheet is not a failure to report.
        if (!token.canceled) setError(`Couldn't connect ${label} sign-in — please try again.`);
        return;
      }
      const res = await postJson<{ identities: ConnectedIdentity[] }>("/api/app/profile/identities", {
        provider,
        idToken: token.idToken,
        name: token.name ?? undefined,
      });
      setBusy(false);
      if (!res.ok) return setError(res.data?.error ?? GENERIC_ERROR);
      if (Array.isArray(res.data?.identities)) onIdentities(res.data.identities);
      setFlash(`${label} sign-in connected.`);
      return;
    }

    signIn(provider, { callbackUrl: "/app/settings/profile" }).catch(() => setBusy(false));
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

  const rowBtn =
    "px-4 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors shrink-0 disabled:opacity-50";

  function providerRow(provider: SocialProviderId, mark: React.ReactNode, last: boolean) {
    const connected = identities.find((i) => i.provider === provider);
    const canConnect = connectable[provider];
    return (
      <li className={`flex flex-wrap items-center justify-between gap-3 py-3 ${last ? "last:pb-0" : ""}`}>
        <div className="flex items-center gap-3">
          {mark}
          <div>
            <div className="text-sm font-semibold text-gray-900">{LABEL[provider]}</div>
            <div className="text-xs text-gray-500">
              {connected
                ? `Connected${connected.email ? ` · ${connected.email}` : ""}`
                : canConnect
                  ? "Not connected"
                  : provider === "apple"
                    ? "Not connected · connect from the iPhone app or workbenchfsm.com"
                    : "Not connected"}
            </div>
          </div>
        </div>
        {connected ? (
          <button type="button" onClick={() => void disconnect(provider)} disabled={busy} className={rowBtn}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : "Disconnect"}
          </button>
        ) : canConnect ? (
          <button type="button" onClick={() => void connect(provider)} disabled={busy} className={rowBtn}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : "Connect"}
          </button>
        ) : null}
      </li>
    );
  }

  return (
    <div className="ds-card p-5 mt-5">
      <SectionHeader
        title="Sign-in methods"
        hint="The ways this login opens. Changes here ask you to verify it's you first."
        className="mb-4"
      />

      {error && (
        <div role="alert" className="form-error mb-3">
          {error}
        </div>
      )}
      {flash && !error && (
        <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-[color:var(--ds-good-soft)] px-3 py-2 text-sm text-[color:var(--ds-good)]">
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

        {providerRow("google", <GoogleMark size={20} />, false)}
        {providerRow("apple", <AppleMark size={20} className="text-gray-900" />, true)}
      </ul>
    </div>
  );
}
