import { NextRequest, NextResponse } from "next/server";

/**
 * Clears the NextAuth session cookies and lands on the sign-in page.
 *
 * Sessions are JWTs — deleting a User from the superadmin console can't
 * revoke a cookie a browser already holds, and that stale cookie traps the
 * browser in a login → dashboard → register redirect loop (requirePageActor
 * finds no user while the login page still sees a "signed-in" session).
 * Server code that detects a session pointing at a missing user redirects
 * here. Idempotent and unauthenticated on purpose: its whole job is to fix
 * broken sessions.
 */
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/app/login", req.url), 303);
  const gone = { value: "", maxAge: 0, path: "/", httpOnly: true, sameSite: "lax" as const };
  // Both the plain (http/localhost) and prefixed (https) NextAuth v4 cookie
  // names — browsers ignore misapplied Secure-prefixed sets, so clearing all
  // of them unconditionally is safe on either scheme.
  res.cookies.set({ name: "next-auth.session-token", ...gone });
  res.cookies.set({ name: "next-auth.callback-url", ...gone });
  res.cookies.set({ name: "next-auth.csrf-token", ...gone });
  res.cookies.set({ name: "__Secure-next-auth.session-token", ...gone, secure: true });
  res.cookies.set({ name: "__Secure-next-auth.callback-url", ...gone, secure: true });
  res.cookies.set({ name: "__Host-next-auth.csrf-token", ...gone, secure: true });
  return res;
}
