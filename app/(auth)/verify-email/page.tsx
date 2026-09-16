"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Loader2, Mail } from "lucide-react";

/**
 * Landing page for the "confirm your new email" link. The confirm happens on
 * a button press rather than on page load, so a mail client prefetching the
 * link can't spend the one-time token before the owner ever sees it.
 */
function VerifyEmailForm() {
  const token = useSearchParams().get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function confirm() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/public/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.email) setDone(data.email);
      else setError(data?.error ?? "Something went wrong. Please try again.");
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
        <h1 className="text-xl font-bold text-gray-900 mb-1">Email updated</h1>
        <p className="text-sm text-gray-500 mb-6">
          You now sign in with <span className="font-semibold text-gray-700">{done}</span>. Sign in
          again to pick up the change.
        </p>
        <Link
          href="/app/login"
          className="inline-block w-full py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold text-sm rounded-[10px] btn-tool transition-colors"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="card-ledger p-8 shadow-sm">
      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Mail size={20} className="text-green-600" />
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-1 text-center">Confirm your new email</h1>
      <p className="text-sm text-gray-500 mb-6 text-center">
        Confirming makes this the address you sign in with.
      </p>

      {!token && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          This link is missing its token. Open the link from your email again, or request the
          change again from My Profile.
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={confirm}
        disabled={loading || !token}
        className="w-full py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-semibold text-sm rounded-[10px] btn-tool transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        Confirm email
      </button>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="app-ui min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/workbench-logo.png" alt="WorkBench" className="h-7 w-auto" />
        </div>
        <Suspense
          fallback={
            <div className="card-ledger p-8 shadow-sm text-center">
              <Loader2 size={20} className="animate-spin text-gray-400 mx-auto" />
            </div>
          }
        >
          <VerifyEmailForm />
        </Suspense>
      </div>
    </div>
  );
}
