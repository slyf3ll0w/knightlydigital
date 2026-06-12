"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

export default function ProfileClient({
  name: initialName,
  email,
  phone: initialPhone,
  roleLabel,
}: {
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
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

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
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
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
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : saved === "password" && <Check size={13} />}
          Update Password
        </button>
      </div>
    </div>
  );
}
