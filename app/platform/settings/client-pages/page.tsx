import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { pageDesignerOpen, PLAN_HOLDER_SELECT, featureAllowed } from "@/lib/plans";
import { getThemeState, themeStateJson } from "@/lib/client-theme-store";
import { themeContextFor } from "@/lib/client-theme-load";
import { themeBookingItems } from "@/lib/client-theme-route";
import PlanRequired from "@/components/PlanRequired";
import { DsPage, PageHeader } from "@/components/ds";
import ClientPagesClient from "./ClientPagesClient";

export const dynamic = "force-dynamic";

/**
 * Settings → Brand & client pages → Client pages: the AI page designer (Pro, page_designer;
 * docs/plans/ai-portal-designer-2026-11-20.md → "In-app UI"). The look of
 * the portal sign-in, the client portal, the booking page and its forms —
 * edited here, by Atlas, or by a connected AI app, always as a draft that
 * goes live only on Publish. Owners and admins only.
 *
 * Off Pro: today's look stays (colors + logo from Branding) and the page
 * shows the upsell over a preview of the booking page as it is.
 */
export default async function ClientPagesPage() {
  if (!pageDesignerOpen()) notFound(); // archived 2026-11-20 (lib/plans.ts pageDesignerOpen())
  const actor = await requirePageActor((a) => isManager(a.role));
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { ...PLAN_HOLDER_SELECT, name: true, slug: true },
  });
  if (!company) return null;

  if (!featureAllowed(company, "page_designer")) {
    return (
      <DsPage open>
        <PageHeader eyebrow="Settings" title="Client pages" info="The look of your portal sign-in, client portal, booking page and forms. Without Pro they use your logo and colors from Branding." />
        <div className="mt-6">
          <PlanRequired compact feature="page_designer" back={{ href: "/app/settings?s=brand", label: "Brand & client pages" }} />
        </div>
        <div className="mx-auto mt-6 hidden max-w-4xl lg:block">
          <iframe src={`/book/${company.slug}?preview=1&thumb=1`} title="Your booking page today" className="ds-card h-[620px] w-full" />
        </div>
      </DsPage>
    );
  }

  const [state, items, ctx] = await Promise.all([getThemeState(actor.companyId), themeBookingItems(actor.companyId), themeContextFor(actor.companyId)]);
  return (
    <ClientPagesClient
      initial={themeStateJson(state)}
      items={items.filter((i) => i.isActive)}
      ctx={{ bookingItemIds: [...ctx.bookingItemIds], assetIds: [...ctx.assetIds], defaultBand: ctx.defaultBand }}
      companyName={company.name}
      slug={company.slug}
    />
  );
}
