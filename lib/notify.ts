import { prisma } from "@/lib/db";

/**
 * Where company-facing notifications (new requests, etc.) should go.
 * Company.email is a Settings field that many companies never fill in, so
 * fall back to the oldest owner's login email rather than dropping the
 * notification on the floor.
 */
export async function companyNotifyAddress(
  companyId: string,
  companyEmail: string | null | undefined
): Promise<string | null> {
  if (companyEmail) return companyEmail;
  const owner = await prisma.user.findFirst({
    where: { companyId, role: "OWNER", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  return owner?.email ?? null;
}
