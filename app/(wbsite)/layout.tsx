import type { Metadata } from "next";
import WBNav from "@/components/wb/WBNav";
import WBFooter from "@/components/wb/WBFooter";

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
    "WorkBench is free field service management software for home-service teams: online booking, lead pipeline, scheduling and dispatch, quotes with e-signature, time tracking, team chat, one-click invoicing, built-in card and ACH payments, recurring billing, and a client portal. It also includes Atlas, an AI assistant with 10,000 free tokens every month and a $20/month plan for 150,000.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description:
      "The core software (booking, scheduling, quotes, invoicing, payments, client portal, team chat) is free for every seat, funded by payment processing: 2.9% + 30¢ per card transaction, 0.75% per ACH transfer — no monthly fees or minimums. Atlas, the AI assistant, is metered separately: every account gets 10,000 Atlas tokens free each month, and Atlas Full is $20/month for 150,000 tokens.",
  },
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
  },
  sameAs: ["https://apps.apple.com/app/workbench-fsm/id6789991103"],
};

/**
 * WorkBench marketing site shell (/wb, /pricing, /apply). These pages move
 * to the site root when workbenchfsm.com takes over this app.
 */
export default function WBSiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="wb-site min-h-screen bg-[#FAFBFD] text-gray-900">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />
      <WBNav />
      <main>{children}</main>
      <WBFooter />
    </div>
  );
}
