"use client";

import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";

export default function PortalLoginForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      await fetch("/api/public/portal-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email: email.trim() }),
      });
    } catch {
      // same outcome either way — we never reveal whether the email matched
    } finally {
      setBusy(false);
      setDone(true);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="text-sm font-medium text-green-800">Check your email</p>
        <p className="text-xs text-green-700 mt-0.5">
          If {email.trim()} is on file with us, your portal link is on its way. It can take a
          minute or two — check spam if you don&apos;t see it.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Email address</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>
      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 chamfer bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
        Email Me My Portal Link
      </button>
    </form>
  );
}
