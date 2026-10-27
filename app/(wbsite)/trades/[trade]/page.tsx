import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WBFeaturePage from "@/components/wb/WBFeaturePage";
import WBFaqJsonLd from "@/components/wb/WBFaqJsonLd";
import { WB_SHOTS } from "@/lib/wb-site";
import { featureByTitle } from "@/lib/wb-features";
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { TRADES, freePlanFaq, tradeBySlug } from "@/lib/wb-trades";

/**
 * /trades/<slug>: one landing page per trade, on the feature-page template.
 * Everything with a number (seats, prices, rates, tokens) comes through the
 * template from lib/plans.ts; the trade copy itself is number-free by rule
 * (scripts/test-wb-site.ts).
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return TRADES.map((t) => ({ trade: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ trade: string }> }): Promise<Metadata> {
  const { trade } = await params;
  const t = tradeBySlug(trade);
  if (!t) return {};
  return {
    title: `${t.name} software, free to start`,
    description: t.description,
    alternates: { canonical: `https://workbenchfsm.com/trades/${t.slug}` },
  };
}

export default async function TradePage({ params }: { params: Promise<{ trade: string }> }) {
  const { trade } = await params;
  const t = tradeBySlug(trade);
  if (!t) notFound();

  const index = TRADES.indexOf(t);
  const accent = index % 2 === 0 ? "blue" : "orange";
  const accentHex = accent === "blue" ? "#0B57D8" : "#F86A0A";
  const Icon = t.icon;
  const faq = [...t.faq, freePlanFaq(t)];
  const others = [1, 2, 3].map((k) => TRADES[(index + k) % TRADES.length]);

  return (
    <>
      <WBFaqJsonLd items={faq} />
      <WBFeaturePage
        eyebrow={t.eyebrow}
        accent={accent}
        title={
          <>
            {t.headline[0]} <span style={{ color: accentHex }}>{t.headline[1]}</span>
          </>
        }
        intro={t.intro}
        photo={t.photo}
        phone={WB_SHOTS[t.shot]}
        chip={{ icon: <Icon className="h-[18px] w-[18px]" style={{ color: accentHex }} strokeWidth={2.2} />, title: t.chip.title, sub: t.chip.sub }}
        screenshot={{ src: WB_SHOTS[t.shot].src, alt: WB_SHOTS[t.shot].alt, kind: "mobile" }}
        steps={t.steps}
        features={t.features.map(featureByTitle)}
        faq={faq}
        related={[
          ...others.map((o) => ({ label: o.name, href: `/trades/${o.slug}` })),
          { label: "Every trade", href: "/trades" },
          { label: "See every feature", href: "/features" },
          { label: "The free plan", href: FREE_PAGE_PATH },
        ]}
      />
    </>
  );
}
