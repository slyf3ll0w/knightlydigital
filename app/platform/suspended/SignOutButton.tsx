"use client";

import { useAppSignOut } from "@/lib/sign-out";

/**
 * Sign out from the Suspended page. A plain link to /api/auth/signout left
 * the phone app signed in: the shell hands links outside /app to the outside
 * browser, which has no session to end.
 */
export default function SignOutButton() {
  const { signingOut, failed, signOut } = useAppSignOut();
  return (
    <>
      <button type="button" onClick={signOut} disabled={signingOut} className="ds-btn ds-btn-primary mt-6 disabled:opacity-60">
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
      {failed && <p className="mt-2 text-xs text-red-600">Couldn&apos;t sign out. Check your connection and try again.</p>}
    </>
  );
}
