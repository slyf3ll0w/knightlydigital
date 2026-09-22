"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { inputCls } from "@/components/Input";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, Check, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { PushToggleCard } from "@/components/PushNotifications";
import { AppLockToggleCard } from "@/components/AppLock";
import CalendarSyncCard from "@/components/CalendarSyncCard";
import SoftphoneToggleCard from "@/components/SoftphoneToggleCard";
import Avatar from "@/components/Avatar";
import AvatarCropModal from "@/components/AvatarCropModal";
import SignInMethodsCard, { type ConnectedIdentity } from "@/components/SignInMethodsCard";
import { FlashBanner, useVerifyIdentity } from "@/components/VerifyIdentity";


export default function ProfileClient({
  userId,
  hasAvatar: initialHasAvatar,
  name: initialName,
  email,
  phone: initialPhone,
  roleLabel,
  emailSignature: initialSignature,
  defaultSignature,
  pendingEmail: initialPendingEmail,
  hasPassword: initialHasPassword,
  identities: initialIdentities,
  googleEnabled,
  googleNativeClientId = null,
  softphoneEnabled = null,
}: {
  userId: string;
  hasAvatar: boolean;
  name: string;
  email: string;
  phone: string;
  roleLabel: string;
  emailSignature: string;
  defaultSignature: string;
  /** An email change already sent and waiting on the new address, if any. */
  pendingEmail: string | null;
  /** False for a Google-only login that never set a password. */
  hasPassword: boolean;
  /** Third-party sign-ins connected to this login. */
  identities: ConnectedIdentity[];
  /** Google sign-in configured and usable from this browser (not the native shell). */
  googleEnabled: boolean;
  /** Android app only — connect Google through the plugin, not a redirect. */
  googleNativeClientId?: string | null;
  /** Business-line calls in the browser (lib/softphone.ts): the saved switch, or null when the line isn't on the voice app. */
  softphoneEnabled?: boolean | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [signature, setSignature] = useState(initialSignature);
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState(initialPendingEmail);
  // The login's sign-in methods — the card below edits them, and they decide
  // how "verify it's you" can be answered.
  const [hasPassword, setHasPassword] = useState(initialHasPassword);
  const [identities, setIdentities] = useState(initialIdentities);
  const { verify, flash, setFlash, dialog } = useVerifyIdentity(
    {
      hasPassword,
      google: identities.some((i) => i.provider === "google"),
      apple: identities.some((i) => i.provider === "apple"),
      googleWebEnabled: googleEnabled,
      googleNativeClientId,
    },
    "/app/settings/profile"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [hasAvatar, setHasAvatar] = useState(initialHasAvatar);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  // iOS: the capture attribute's direct-camera path crashes installed
  // PWAs/webviews — its regular photo picker already offers "Take Photo",
  // so route the camera button through that instead.
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(
      /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }, []);

  // Picking a photo opens the crop dialog; the upload happens on Save there.
  const [cropFile, setCropFile] = useState<File | null>(null);

  function pickAvatar(file: File | null | undefined) {
    if (!file) return;
    setError("");
    setCropFile(file);
    if (pickRef.current) pickRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  async function uploadAvatar(blob: Blob) {
    setAvatarBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/app/profile/avatar", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? GENERIC_ERROR);
        return;
      }
      setHasAvatar(true);
      setAvatarVersion(Date.now());
      router.refresh();
    } catch {
      setError("Couldn't read that image — try a different one.");
    } finally {
      setAvatarBusy(false);
      setCropFile(null);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    await fetch("/api/app/profile/avatar", { method: "DELETE" }).catch(() => {});
    setAvatarBusy(false);
    setHasAvatar(false);
    setAvatarVersion(Date.now());
    router.refresh();
  }

  async function saveProfile() {
    setBusy(true);
    setError("");
    setSaved("");
    const { ok, data } = await postJson("/api/app/profile", { name, phone }, "PATCH");
    setBusy(false);
    if (!ok) return setError(data?.error ?? GENERIC_ERROR);
    setSaved("profile");
    router.refresh();
  }

  async function saveSignature() {
    setBusy(true);
    setError("");
    setSaved("");
    const { ok, data } = await postJson(
      "/api/app/profile",
      { emailSignature: signature },
      "PATCH"
    );
    setBusy(false);
    if (!ok) return setError(data?.error ?? GENERIC_ERROR);
    setSaved("signature");
  }

  async function changeEmail() {
    setError("");
    setSaved("");
    // A borrowed session must not be able to walk the login off to another
    // inbox — verify first (password, or Google for a login with none).
    if (!(await verify("change-email"))) return;
    setBusy(true);
    const { ok, data } = await postJson<{ sentTo: string; error?: string }>(
      "/api/app/profile/email",
      { newEmail }
    );
    setBusy(false);
    if (!ok || !data?.sentTo) return setError(data?.error ?? GENERIC_ERROR);
    // The address isn't ours yet — it's pending until that inbox confirms.
    setPendingEmail(data.sentTo);
    setNewEmail("");
    setSaved("email");
  }

  async function cancelEmailChange() {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson("/api/app/profile/email", undefined, "DELETE");
    setBusy(false);
    if (!ok) return setError(data?.error ?? GENERIC_ERROR);
    setPendingEmail(null);
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <h1 className="numeral-ledger text-2xl font-semibold text-gray-900 mb-1">My Profile</h1>
      <p className="text-sm text-gray-500 mb-6">
        Signed in as {email} · {roleLabel}
      </p>

      {error && (
        <div role="alert" className="form-error mb-4">
          {error}
        </div>
      )}
      <FlashBanner flash={flash} onClose={() => setFlash(null)} />

      {/* Profile picture */}
      <div className="card-ledger p-5 mb-5">
        <h2 className="text-[13px] font-semibold text-gray-500 mb-4">
          Profile picture
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar
            name={name}
            userId={hasAvatar ? userId : undefined}
            version={avatarVersion || undefined}
            size={72}
            className="ring-2 ring-gray-100"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => pickRef.current?.click()}
              disabled={avatarBusy}
              className="flex items-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {avatarBusy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
              Choose photo
            </button>
            {/* Camera capture — phones only; desktop has no camera flow */}
            <button
              type="button"
              onClick={() => (isIOS ? pickRef : cameraRef).current?.click()}
              disabled={avatarBusy}
              className="flex items-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 lg:hidden"
            >
              <Camera size={14} />
              Take photo
            </button>
            {hasAvatar && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={avatarBusy}
                className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 size={14} />
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Shows next to your messages and wherever your name appears. Square photos look best.
        </p>
        <input
          ref={pickRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => pickAvatar(e.target.files?.[0])}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => pickAvatar(e.target.files?.[0])}
        />
        {cropFile && (
          <AvatarCropModal
            file={cropFile}
            busy={avatarBusy}
            onCancel={() => !avatarBusy && setCropFile(null)}
            onSave={uploadAvatar}
          />
        )}
      </div>

      <div className="card-ledger p-5 mb-5">
        <h2 className="text-[13px] font-semibold text-gray-500 mb-4">
          Your info
        </h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
        </div>
        <button
          onClick={saveProfile}
          disabled={busy || !name.trim()}
          className="btn-primary"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : saved === "profile" && <Check size={13} />}
          Save
        </button>
      </div>

      {/* Email signature — appended to client email messages */}
      <div className="card-ledger p-5 mb-5">
        <h2 className="text-[13px] font-semibold text-gray-500 mb-1">
          Email signature
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Added to the bottom of emails you send to clients from their page.
        </p>
        <textarea
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder={defaultSignature}
          className={`${inputCls} resize-y font-normal`}
        />
        <p className="text-xs text-gray-500 mt-1 mb-3">
          Plain text, one line per row. Leave blank to use the default shown above.
        </p>
        <button
          onClick={saveSignature}
          disabled={busy}
          className="btn-primary"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : saved === "signature" && <Check size={13} />}
          Save Signature
        </button>
      </div>

      {/* Change email — nothing moves until the new address confirms it, so a
          typo can't lock someone out of their own account. */}
      <div className="card-ledger p-5">
        <h2 className="text-[13px] font-semibold text-gray-500 mb-1">Sign-in email</h2>
        <p className="text-xs text-gray-500 mb-4">
          Currently <span className="font-medium text-gray-700">{email}</span>. Changing it sends a
          confirmation link to the new address — it only takes effect once you open that link.
        </p>

        {pendingEmail ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-sm text-amber-800">
              Waiting for <span className="font-semibold">{pendingEmail}</span> to confirm. Check
              that inbox — the link expires an hour after it was sent.
            </p>
            <button
              onClick={cancelEmailChange}
              disabled={busy}
              className="mt-1.5 text-xs font-medium text-amber-900 underline hover:no-underline disabled:opacity-50"
            >
              Cancel this change
            </button>
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">New email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  autoComplete="off"
                  className={inputCls}
                  placeholder="you@company.com"
                />
              </div>
            </div>
            <button
              onClick={changeEmail}
              disabled={busy || !newEmail.trim()}
              className="btn-primary"
            >
              {busy ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                saved === "email" && <Check size={13} />
              )}
              Send Confirmation Link
            </button>
          </>
        )}
      </div>

      {/* Password · Google · Apple — set, change, connect, disconnect, each
          behind "verify it's you". */}
      <SignInMethodsCard
        email={email}
        hasPassword={hasPassword}
        identities={identities}
        googleWebEnabled={googleEnabled}
        googleNativeClientId={googleNativeClientId}
        verify={verify}
        onPasswordSet={() => setHasPassword(true)}
        onIdentities={setIdentities}
      />
      {dialog}

      <PushToggleCard />

      {softphoneEnabled !== null && <SoftphoneToggleCard initial={softphoneEnabled} />}

      <AppLockToggleCard />

      {/* useSearchParams inside → Suspense keeps the static shell happy */}
      <Suspense fallback={null}>
        <CalendarSyncCard />
      </Suspense>

      <div className="card-ledger p-5 mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-gray-500 mb-1">
            Welcome tour
          </h2>
          <p className="text-sm text-gray-600">
            Replay the quick walkthrough of how work flows through the app.
          </p>
        </div>
        <Link
          href="/app/dashboard?tour=1"
          className="px-4 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors shrink-0"
        >
          Replay the tour
        </Link>
      </div>
    </div>
  );
}
