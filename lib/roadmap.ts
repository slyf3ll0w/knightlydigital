import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * The public Upcoming Features board (/roadmap) is readable by anyone but
 * writable only by these pre-existing accounts. Deliberately email-based
 * (not role-based): editors are the product's people, whatever role they
 * hold in whatever company.
 */
export const ROADMAP_EDITORS = ["davidalessly@gmail.com", "emailforedan@gmail.com"];

export async function isRoadmapEditor(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  return !!email && ROADMAP_EDITORS.includes(email);
}

export const ROADMAP_CATEGORIES = ["FEATURE", "BUG", "QOL"] as const;
