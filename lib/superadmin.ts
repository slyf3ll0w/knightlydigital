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

async function loadSuperadmin(): Promise<SuperadminUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user || !user.isActive || user.role !== "SUPERADMIN") return null;
  return { id: user.id, email: user.email, name: user.name };
}

/** Page-side: redirects non-superadmins away. */
export async function requireSuperadminPage(): Promise<SuperadminUser> {
  const user = await loadSuperadmin();
  if (!user) redirect("/app/dashboard");
  return user;
}

/** API-side: null → caller returns 403. */
export async function getSuperadmin(): Promise<SuperadminUser | null> {
  return loadSuperadmin();
}
