import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

/**
 * Platform-owner auth. Superadmins have no companyId, so getActor() (which
 * requires one) deliberately rejects them — these are the only entry points
 * for /superadmin pages and /api/superadmin routes. middleware.ts already
 * gates the routes by JWT role; this re-checks against the DB like getActor
 * does, so a demoted/deactivated superadmin dies with the next request, not
 * the next sign-in.
 */

export type SuperadminUser = { id: string; email: string; name: string };

async function loadSuperadmin(): Promise<{ signedIn: boolean; user: SuperadminUser | null }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { signedIn: false, user: null };
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user || !user.isActive || user.role !== "SUPERADMIN") return { signedIn: true, user: null };
  return { signedIn: true, user: { id: user.id, email: user.email, name: user.name } };
}

/** Page-side: signed-out visitors go to the console login, tenants to their app. */
export async function requireSuperadminPage(): Promise<SuperadminUser> {
  const { signedIn, user } = await loadSuperadmin();
  if (!user) redirect(signedIn ? "/app/dashboard" : "/superadmin/login");
  return user;
}

/** API-side: null → caller returns 403. */
export async function getSuperadmin(): Promise<SuperadminUser | null> {
  return (await loadSuperadmin()).user;
}
