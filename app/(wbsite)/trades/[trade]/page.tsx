import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WBTradePage from "@/components/wb/WBTradePage";
import { TRADE_TEMPLATES } from "@/lib/wb-tools";
import WBFaqJsonLd from "@/components/wb/WBFaqJsonLd";
import { featureByTitle } from "@/lib/wb-features";
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { TRADES, freePlanFaq, tradeBySlug } from "@/lib/wb-trades";
import { tradeStory } from "@/lib/wb-trade-story";

/**
 * /trades/<slug>: one landing page per trade, laid out by its family and
 * its signature section (lib/wb-trade-story.ts → components/wb/WBTradePage.tsx,
 * David 2026-11-20). Everything with a number (seats, prices, rates) comes
 * from lib/plans.ts or the trade's price-book template; the trade copy itself
 * is number-free by rule (scripts/test-wb-site.ts).
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
  const faq = [...t.faq, freePlanFaq(t)];
  const others = [1, 2, 3].map((k) => TRADES[(index + k) % TRADES.length]);

  return (
    <>
      <WBFaqJsonLd items={faq} />
      <WBTradePage
        trade={t}
        story={tradeStory(t.slug)}
        template={TRADE_TEMPLATES[t.slug]}
        index={index}
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
