"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle } from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/public/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setLoading(false);
  }

  if (done) {
    return (
      <div className="card-ledger p-8 shadow-sm text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={22} className="text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Password updated</h1>
        <p className="text-sm text-gray-500 mb-6">
          Your password has been changed. You can now sign in with your new password.
        </p>
        <Link
          href="/app/login"
          className="inline-block w-full py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold text-sm rounded-full transition-colors"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="card-ledger p-8 shadow-sm">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Choose a new password</h1>
      <p className="text-sm text-gray-500 mb-6">Enter and confirm your new password.</p>

      {!token && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          This reset link is missing its token. Please open the link from your email again, or
          request a new one.
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !token}
          className="w-full py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-semibold text-sm rounded-full transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          Update password
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="app-ui min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/workbench-logo.png" alt="WorkBench" className="h-7 w-auto" />
        </div>
        <Suspense fallback={<div className="card-ledger p-8 shadow-sm text-center text-sm text-gray-500">Loading…</div>}>
          <ResetPasswordForm />
        </Suspense>
        <p className="text-center text-sm text-gray-500 mt-6">
          <Link href="/app/login" className="text-green-600 hover:underline font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
