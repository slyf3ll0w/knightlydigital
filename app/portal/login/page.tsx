"use client";

import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    // Fetch session to determine role-based redirect
    const res = await fetch("/api/auth/session");
    const session = await res.json();
    if (session?.user?.role === "ADMIN") {
      router.push("/admin/dashboard");
    } else {
      router.push("/portal/dashboard");
    }
  }

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      {/* Top bar */}
      <div className="bg-primary py-4 px-6 flex items-center justify-between">
        <Link href="/">
          <div className="bg-white inline-block px-3 py-1.5">
            <Image src="/logo.png" alt="Streamflare Media Group" width={160} height={40} className="h-8 w-auto object-contain" />
          </div>
        </Link>
        <Link href="/" className="text-xs text-primary-foreground/60 hover:text-primary-foreground transition-colors uppercase tracking-wider font-bold">
          &larr; Back to Site
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <p className="text-xs tracking-[0.3em] font-bold uppercase text-muted-foreground mb-3">Secure Access</p>
            <h1 className="text-3xl font-black uppercase">Client Portal</h1>
            <p className="text-muted-foreground text-sm mt-3">
              Sign in to manage your services, messages, and orders.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white border border-border p-8 flex flex-col gap-5">
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-accent transition-colors"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-accent transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-accent text-accent-foreground font-bold py-4 text-sm tracking-widest uppercase hover:bg-accent/85 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Not a client yet?{" "}
            <Link href="/contact" className="text-accent font-bold hover:underline">
              Contact Us
            </Link>{" "}
            to get started.
          </p>
        </div>
      </div>
    </div>
  );
}
