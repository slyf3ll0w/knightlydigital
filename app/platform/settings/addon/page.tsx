import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { addonCheckoutUrl, addonConfigured } from "@/lib/addon";
import AddonClient from "./AddonClient";

export const dynamic = "force-dynamic";

/**
 * Settings → Workbench Plus: the premium add-on upsell, sold through a
 * hosted Livery subscription checkout (lib/addon.ts). Only exists while the
 * company's superadmin visibility switch (addonEnabled) is on — everyone
 * else 404s to Settings as if the page were never built.
 */
export default async function AddonPage() {
  const actor = await requirePageActor((a) => isManager(a.role));

  const [company, user] = await Promise.all([
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { id: true, addonEnabled: true, addonActiveAt: true },
    }),
    prisma.user.findUnique({
      where: { id: actor.id },
      select: { email: true, name: true },
    }),
  ]);
  if (!company || !company.addonEnabled) redirect("/app/settings");

  const checkoutUrl = addonCheckoutUrl({
    companyId: company.id,
    email: user?.email,
    name: user?.name,
  });

  return (
    <AddonClient
      active={Boolean(company.addonActiveAt)}
      activeAt={company.addonActiveAt?.toISOString() ?? null}
      configured={addonConfigured() && Boolean(checkoutUrl)}
      checkoutUrl={checkoutUrl}
      isOwner={actor.role === "OWNER"}
    />
  );
}
