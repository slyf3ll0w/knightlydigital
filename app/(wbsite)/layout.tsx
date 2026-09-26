import type { Metadata } from "next";
import WBNav from "@/components/wb/WBNav";
import WBFooter from "@/components/wb/WBFooter";
import WBSiteChat from "@/components/wb/WBSiteChat";
import { siteChatCompanyId } from "@/lib/site-chat";
import { WB_EMAIL, WB_PHONE } from "@/lib/wb-site";
import {
  DISPATCH_MINUTES_INCLUDED,
  DISPATCH_SETUP_CENTS,
  DISPATCH_TEXTS_INCLUDED,
  EXTRA_SEAT_CENTS,
  FREE_PLAN_NAME,
  FULL_SHOP,
  INCLUDED_SEATS,
  PLANS,
  formatCents,
} from "@/lib/plans";

// Escape the agency-site "| Streamflaire Group LLC" title template
export const metadata: Metadata = {
  title: { template: "%s", default: "WorkBench" },
};

// SoftwareApplication structured data — read by search engines and AI
// answer engines that fetch this site to describe what WorkBench is. Kept
// in the marketing layout (not the root layout) since it describes the
// product these pages are marketing, not the app or agency site.
const softwareAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "WorkBench",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Field Service Management Software",
  operatingSystem: "Web, iOS",
  url: "https://workbenchfsm.com",
  description:
    `WorkBench is field service management software for home-service teams: online booking, lead pipeline, scheduling and dispatch, quotes with e-signature, clock-in, team chat, one-click invoicing, built-in card and ACH payments, recurring billing, and a client portal. The core is free with full access for ${INCLUDED_SEATS} users, then ${formatCents(EXTRA_SEAT_CENTS)} per extra user a month. It also includes Atlas, an AI assistant with 10,000 free tokens every month. Optional flat-priced add-ons: ${PLANS.DISPATCH.name} (a business phone line), ${PLANS.SHOP.name} (unlimited users, estimator, routes, automations, agreements, team map, timesheets, QuickBooks, Atlas Full), and ${PLANS.JOBSITE.name} (job photos, coming soon).`,
  offers: [
    {
      "@type": "Offer",
      name: FREE_PLAN_NAME,
      price: "0",
      priceCurrency: "USD",
      description: `The core software (booking, scheduling, quotes, invoicing, payments, client portal, team chat) is free with full access for ${INCLUDED_SEATS} users, not a trial, funded by payment processing: 2.9% + 30¢ per card transaction, 0.75% per ACH transfer — no monthly fees or minimums. Extra users are ${formatCents(EXTRA_SEAT_CENTS)} per user per month. Atlas, the AI assistant, is metered separately: every account gets 10,000 Atlas tokens free each month.`,
    },
    {
      "@type": "Offer",
      name: PLANS.DISPATCH.name,
      price: (PLANS.DISPATCH.monthlyCents / 100).toFixed(2),
      priceCurrency: "USD",
      description: `${PLANS.DISPATCH.tagline} Per company per month; ${formatCents(DISPATCH_SETUP_CENTS)} one-time number setup; ${DISPATCH_TEXTS_INCLUDED} texts and ${DISPATCH_MINUTES_INCLUDED} minutes a month included.`,
    },
    {
      "@type": "Offer",
      name: PLANS.SHOP.name,
      price: (PLANS.SHOP.monthlyCents / 100).toFixed(2),
      priceCurrency: "USD",
      description: `${PLANS.SHOP.tagline} Per company per month: unlimited users, estimator, routes, automations, agreements, team map, timesheets, QuickBooks Online, and Atlas Full.`,
    },
    {
      "@type": "Offer",
      name: FULL_SHOP.name,
      price: (FULL_SHOP.monthlyCents / 100).toFixed(2),
      priceCurrency: "USD",
      description: `${PLANS.DISPATCH.name} and ${PLANS.SHOP.name} together, per company per month; ${PLANS.JOBSITE.name} joins at no extra charge when it ships.`,
    },
  ],
  featureList: [
    "Online booking widget",
    "Lead pipeline",
    "Quotes with e-signature",
    "Scheduling & dispatch",
    "Recurring visit series",
    "Time tracking & timesheets",
    "Team chat",
    "One-click invoicing",
    "Card & ACH payments",
    "Recurring billing",
    "Client portal",
    "Atlas AI assistant",
  ],
  publisher: {
    "@type": "Organization",
    name: "Streamflaire",
    url: "https://streamflaire.com",
    telephone: WB_PHONE.e164,
    email: WB_EMAIL,
  },
  sameAs: ["https://apps.apple.com/app/workbench-fsm/id6789991103"],
};

/**
 * WorkBench marketing site shell (/wb, /pricing, /apply). These pages move
 * to the site root when workbenchfsm.com takes over this app.
 */
export default async function WBSiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const chat = Boolean(await siteChatCompanyId());
  return (
    <div className="wb-site min-h-screen bg-white text-gray-900">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />
      <WBNav />
      <main className="pt-20 sm:pt-24">{children}</main>
      <WBFooter />
      {chat ? <WBSiteChat /> : null}
    </div>
  );
}
