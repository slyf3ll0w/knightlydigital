"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";

/** Ends the console cookie session only — a tenant login in this browser stays. */
export default function SignOutButton() {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await fetch("/api/superadmin/session", { method: "DELETE" });
    } catch {
      // Cookie may already be gone; the login redirect below sorts it out.
    }
    window.location.href = "/superadmin/login";
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 transition-colors hover:text-gray-900 disabled:opacity-50"
      title="Sign out of the console"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
      Sign out
    </button>
  );
}
