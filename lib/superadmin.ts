import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SUPERADMIN_COOKIE, readSuperadminSessionToken } from "@/lib/superadmin-session";

/**
 * Platform-owner auth. The console rides its own signed cookie
 * (lib/superadmin-session.ts), completely separate from the tenant NextAuth
 * session — staff can be signed into both at once, and a tenant session never
 * grants console access. These are the only entry points for /superadmin
 * pages and /api/superadmin routes. middleware.ts already gates the routes by
 * cookie signature; this re-checks against the DB, so a demoted/deactivated
 * superadmin dies with the next request, not the next sign-in.
 */

export type SuperadminUser = { id: string; email: string; name: string };

async function loadSuperadmin(): Promise<SuperadminUser | null> {
  const token = (await cookies()).get(SUPERADMIN_COOKIE)?.value;
  if (!token) return null;
  const session = await readSuperadminSessionToken(token);
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true, account: { select: { passwordChangedAt: true } } },
  });
  if (!user || !user.isActive || user.role !== "SUPERADMIN") return null;
  // A password change ends every console session minted before it, the way
  // it ends tenant sessions: a copied console cookie must not outlive the
  // reset that was meant to lock its holder out (2026-11-23 security review).
  const changedAt = user.account?.passwordChangedAt?.getTime() ?? 0;
  if (changedAt && session.issuedAt < changedAt - 5_000) return null;
  return { id: user.id, email: user.email, name: user.name };
}

/** Page-side: anyone without a console session goes to the console login. */
export async function requireSuperadminPage(): Promise<SuperadminUser> {
  const user = await loadSuperadmin();
  if (!user) redirect("/superadmin/login");
  return user;
}

/** API-side: null → caller returns 403. */
export async function getSuperadmin(): Promise<SuperadminUser | null> {
  return loadSuperadmin();
}
