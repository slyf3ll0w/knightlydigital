import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import { Card } from "@/components/ds";
import { requirePageActor, isManager } from "@/lib/permissions";
import { addonCheckoutUrl, addonConfigured } from "@/lib/addon";
import AddonClient from "./AddonClient";

export const dynamic = "force-dynamic";

/**
 * Settings → Voice: the business-line plan upsell, sold through a
 * hosted Livery subscription checkout (lib/addon.ts). The pitch only exists
 * while the company's superadmin visibility switch (addonEnabled) is on —
 * everyone else gets a small "not switched on yet" card (links from the
 * Phone & texting card, Calls and Messages are hidden for them, but a typed
 * URL used to bounce silently to Settings).
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
  if (!company) redirect("/app/settings");
  if (!company.addonEnabled) {
    return (
      <div className="p-4 lg:p-8 max-w-3xl mx-auto">
        <div className="flex items-start gap-3 mb-6">
          <BackLink href="/app/settings" className="mt-1.5" />
          <PageTitle info="Your own business phone line inside WorkBench, billed monthly.">Voice</PageTitle>
        </div>
        <Card className="p-6">
          <p className="ds-body">
            The Voice plan isn&apos;t switched on for your account yet. Message us from{" "}
            <Link href="/app/help" className="ds-link">
              Help Center
            </Link>{" "}
            and we&apos;ll turn it on.
          </p>
        </Card>
      </div>
    );
  }

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
