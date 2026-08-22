"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { Input } from "@/components/Input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/public/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setSent(true);
      else if (res.status === 429)
        setError("Too many requests. Please wait a bit and try again.");
      else setError("Something went wrong. Please try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setLoading(false);
  }

  return (
    // Same clean recipe as the login page: flat light ground, one white card
    // with a hairline border, blue accents.
    <div className="app-ui flex min-h-screen flex-col items-center justify-center bg-[#FAFBFD] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/workbench-logo.png" alt="WorkBench" className="h-8 w-auto" />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <MailCheck size={22} className="text-green-600" />
              </div>
              <h1 className="mb-1 text-xl font-bold tracking-tight text-gray-900">
                Check your email
              </h1>
              <p className="text-sm text-gray-500">
                If an account exists for <span className="font-medium">{email}</span>, we&apos;ve
                sent a link to reset your password. It expires in 1 hour.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-center text-[22px] font-bold tracking-tight text-gray-900">
                Reset your password
              </h1>
              <p className="mb-6 mt-1.5 text-center text-sm text-gray-500">
                Enter your account email and we&apos;ll send you a reset link.
              </p>

              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="mb-1 block text-sm font-semibold text-gray-700"
                  >
                    Email
                  </label>
                  <Input
                    id="forgot-email"
                    name="username"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                    className="w-full"
                    placeholder="you@company.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D8] py-3 text-[15px] font-bold text-white transition-colors hover:bg-[#0A4CBB] active:bg-[#09429F] disabled:opacity-50"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  Send reset link
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          <Link href="/app/login" className="font-semibold text-[#0B57D8] hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
