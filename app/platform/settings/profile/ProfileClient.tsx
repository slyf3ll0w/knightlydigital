"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, Check, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { PushToggleCard } from "@/components/PushNotifications";
import Avatar from "@/components/Avatar";

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

/** Center-crop to a square and downscale — profile photos ship tiny. */
async function processAvatarFile(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const out = 256;
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image processing failed"))), "image/jpeg", 0.85);
  });
}

export default function ProfileClient({
  userId,
  hasAvatar: initialHasAvatar,
  name: initialName,
  email,
  phone: initialPhone,
  roleLabel,
}: {
  userId: string;
  hasAvatar: boolean;
  name: string;
  email: string;
  phone: string;
  roleLabel: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [hasAvatar, setHasAvatar] = useState(initialHasAvatar);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function uploadAvatar(file: File | null | undefined) {
    if (!file) return;
    setAvatarBusy(true);
    setError("");
    try {
      const blob = await processAvatarFile(file);
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
      if (pickRef.current) pickRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
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

  async function changePassword() {
    setBusy(true);
    setError("");
    setSaved("");
    const { ok, data } = await postJson(
      "/api/app/profile",
      { currentPassword, newPassword },
      "PATCH"
    );
    setBusy(false);
    if (!ok) return setError(data?.error ?? GENERIC_ERROR);
    setCurrentPassword("");
    setNewPassword("");
    setSaved("password");
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <h1 className="numeral-ledger text-2xl font-semibold text-gray-900 mb-1">My Profile</h1>
      <p className="text-sm text-gray-500 mb-6">
        Signed in as {email} · {roleLabel}
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Profile picture */}
      <div className="card-ledger p-5 mb-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
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
              className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {avatarBusy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
              Choose photo
            </button>
            {/* Camera capture — phones only; desktop has no camera flow */}
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={avatarBusy}
              className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 lg:hidden"
            >
              <Camera size={14} />
              Take photo
            </button>
            {hasAvatar && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={avatarBusy}
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 size={14} />
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Shows next to your messages and wherever your name appears. Square photos look best.
        </p>
        <input
          ref={pickRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => uploadAvatar(e.target.files?.[0])}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => uploadAvatar(e.target.files?.[0])}
        />
      </div>

      <div className="card-ledger p-5 mb-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
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
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : saved === "profile" && <Check size={13} />}
          Save
        </button>
      </div>

      <div className="card-ledger p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Change password
        </h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">New password (8+ characters)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <button
          onClick={changePassword}
          disabled={busy || newPassword.length < 8 || !currentPassword}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : saved === "password" && <Check size={13} />}
          Update Password
        </button>
      </div>

      <PushToggleCard />

      <div className="card-ledger p-5 mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Welcome tour
          </h2>
          <p className="text-sm text-gray-600">
            Replay the quick walkthrough of how work flows through the app.
          </p>
        </div>
        <Link
          href="/app/dashboard?tour=1"
          className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded-full hover:bg-gray-50 transition-colors shrink-0"
        >
          Replay the tour
        </Link>
      </div>
    </div>
  );
}
