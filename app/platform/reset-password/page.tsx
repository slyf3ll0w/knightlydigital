"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle } from "lucide-react";
import { Input } from "@/components/Input";
import { saveCredential } from "@/lib/save-credential";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  // Carried on the reset link purely so the hidden username field below has a
  // value. It never authenticates anything — the token does that — and the
  // link only ever reaches the address it names.
  const email = searchParams.get("email") ?? "";

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
        // This page never navigates — it swaps to a success card in place — so
        // a password manager watching for a form submission sees nothing at
        // all, and the manager is left holding the password the user just
        // replaced. Offer the new one explicitly.
        if (email) await saveCredential(email, password);
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
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <CheckCircle size={22} className="text-green-600" />
        </div>
        <h1 className="mb-1 text-xl font-bold tracking-tight text-gray-900">Password updated</h1>
        <p className="mb-6 text-sm text-gray-500">
          Your password has been changed. You can now log in with your new password.
        </p>
        <Link
          href="/app/login"
          className="inline-block w-full rounded-lg bg-[#0B57D8] py-3 text-[15px] font-bold text-white transition-colors hover:bg-[#0A4CBB] active:bg-[#09429F]"
        >
          Go to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <h1 className="text-center text-[22px] font-bold tracking-tight text-gray-900">
        Choose a new password
      </h1>
      <p className="mb-6 mt-1.5 text-center text-sm text-gray-500">
        Enter and confirm your new password.
      </p>

      {!token && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This reset link is missing its token. Please open the link from your email again, or
          request a new one.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* A change-password form with no identifier leaves password managers
            nothing to file the new password under, so they save nothing and
            the old one stays. Hidden but present, per the WHATWG guidance. */}
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
        <div>
          <label
            htmlFor="new-password"
            className="mb-1 block text-sm font-semibold text-gray-700"
          >
            New password
          </label>
          <Input
            id="new-password"
            name="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full"
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label
            htmlFor="confirm-password"
            className="mb-1 block text-sm font-semibold text-gray-700"
          >
            Confirm password
          </label>
          <Input
            id="confirm-password"
            name="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !token}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D8] py-3 text-[15px] font-bold text-white transition-colors hover:bg-[#0A4CBB] active:bg-[#09429F] disabled:opacity-50"
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
    // Same clean recipe as the login page: flat light ground, one white card
    // with a hairline border, blue accents.
    <div className="app-ui flex min-h-screen flex-col items-center justify-center bg-[#FAFBFD] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/workbench-logo.png" alt="WorkBench" className="h-8 w-auto" />
        </div>
        <Suspense
          fallback={
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
              Loading…
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-gray-500">
          <Link href="/app/login" className="font-semibold text-[#0B57D8] hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
