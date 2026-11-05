import WBFeaturePage from "@/components/wb/WBFeaturePage";
import WBFaqJsonLd from "@/components/wb/WBFaqJsonLd";
import { FREE_PLAN_NAME, INCLUDED_SEATS } from "@/lib/plans";
import { featureByTitle } from "@/lib/wb-features";
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { WB_SHOTS } from "@/lib/wb-site";
import type { FreePage } from "@/lib/wb-free-pages";
import { CalendarDays, FileText } from "lucide-react";

/** /free-invoicing-software and /free-scheduling-software on the feature-page template. */
export default function WBFreeSoftwarePage({ page }: { page: FreePage }) {
  const Icon = page.shot === "invoices" ? FileText : CalendarDays;
  const faq = [
    ...page.faq,
    {
      q: `What is in ${FREE_PLAN_NAME}, the free plan?`,
      a: `Clients, online booking, scheduling, quotes with e-signature, invoicing, card and bank payments, a client portal, team chat and Atlas, with full access for ${INCLUDED_SEATS} users and no trial clock. The free plan page lists every line and the three optional things that cost money.`,
    },
  ];
  return (
    <>
      <WBFaqJsonLd items={faq} />
      <WBFeaturePage
        eyebrow={page.eyebrow}
        accent="blue"
        title={
          <>
            {page.headline[0]} <span style={{ color: "#0B57D8" }}>{page.headline[1]}</span>
          </>
        }
        intro={page.intro}
        photo={page.photo}
        phone={WB_SHOTS[page.shot]}
        chip={{ icon: <Icon className="h-[18px] w-[18px] text-[#0B57D8]" strokeWidth={2.2} />, title: page.chip.title, sub: page.chip.sub }}
        screenshot={{ src: WB_SHOTS[page.shot].src, alt: WB_SHOTS[page.shot].alt, kind: "mobile" }}
        steps={page.steps}
        features={page.features.map(featureByTitle)}
        faq={faq}
        related={[...page.related, { label: "The free plan", href: FREE_PAGE_PATH }, { label: "See every feature", href: "/features" }]}
        ctaTitle="Free to start. Full access, not a trial."
        ctaBody={<>{INCLUDED_SEATS} users included, flat-priced add-ons when the crew needs more. Your account opens today.</>}
      />
    </>
  );
}
