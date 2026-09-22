import { prisma } from "@/lib/db";
import { requireSuperadminPage } from "@/lib/superadmin";
import LibraryClient from "./LibraryClient";

export const dynamic = "force-dynamic";

/**
 * Every Library listing (estimate tools shared between businesses), newest
 * first, with the company behind it even when it's shared anonymously.
 * Remove takes a listing off the public Library with a reason the owner
 * sees; Restore puts it back. Copies other companies added are untouched.
 */
export default async function SuperadminLibraryPage() {
  await requireSuperadminPage();
  const listings = await prisma.estimatorListing.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      name: true,
      description: true,
      industry: true,
      anonymous: true,
      byName: true,
      likes: true,
      adds: true,
      status: true,
      removedReason: true,
      removedAt: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { id: true, name: true } },
    },
  });
  return <LibraryClient listings={JSON.parse(JSON.stringify(listings))} />;
}
