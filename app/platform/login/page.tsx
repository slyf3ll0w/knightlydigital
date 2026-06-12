"use client";

import { useState, useEffect } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export default function AppLoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Already signed in with a company — go straight to the dashboard.
  // Sessions WITHOUT a company (superadmin, or a deleted test company) must
  // stay here, or login → dashboard → register becomes a bounce loop and the
  // register page's "Sign in" link appears dead.
  useEffect(() => {
    if (status === "authenticated" && session?.user?.companyId) {
      router.replace("/app/dashboard");
    }
  }, [status, session, router]);

  const staleSession = status === "authenticated" && !session?.user?.companyId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Invalid email or password.");
    } else {
      // Full page load so the app layout re-renders with the new session
      // (client-side navigation would reuse the signed-out layout — no sidebar)
      window.location.href = "/app/dashboard";
    }
  }

  return (
    <div className="app-ui min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/streamflaire-hub-logo.png" alt="Streamflaire Hub" className="h-7 w-auto" />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Sign in</h1>
          <p className="text-sm text-gray-500 mb-6">Welcome back to Streamflaire Hub</p>

          {staleSession && (
            <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
              You&apos;re signed in as{" "}
              <span className="font-semibold">{session?.user?.email}</span>, which doesn&apos;t
              have a company workspace.{" "}
              <button
                type="button"
                onClick={() => signOut({ redirect: false })}
                className="font-semibold text-amber-900 underline hover:no-underline"
              >
                Sign out
              </button>{" "}
              or sign in below with another account.
            </div>
          )}

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-semibold text-sm rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Sign in
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/app/register" className="text-green-600 hover:underline font-medium">
            Get started free
          </Link>
        </p>
      </div>
    </div>
  );
}
