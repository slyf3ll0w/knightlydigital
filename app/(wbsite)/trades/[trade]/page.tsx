import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WBFeaturePage from "@/components/wb/WBFeaturePage";
import WBAppJourney, { type JourneyJob } from "@/components/wb/WBAppJourney";
import { TRADE_TEMPLATES } from "@/lib/wb-tools";
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
  // The journey follows this trade's kind of job: its two biggest typical
  // line items (lib/wb-tools.ts TRADE_TEMPLATES), for a demo client.
  const tpl = TRADE_TEMPLATES[t.slug];
  const lines = tpl ? [...tpl.lines].filter((l) => !l.optional).sort((a, b) => b.unitPrice * b.quantity - a.unitPrice * a.quantity).slice(0, 2) : [];
  const DEMO_CLIENTS = ["Grace Kim", "Maria Hernandez", "Derek Olsen", "Olivia Park", "Hannah Brooks", "Marcus Bell"];
  const job: JourneyJob | undefined = lines.length
    ? {
        client: DEMO_CLIENTS[index % DEMO_CLIENTS.length],
        title: lines[0].name,
        short: lines[0].name,
        lines: lines.map((l) => ({ name: l.name, qty: l.quantity, unit: l.unitPrice })),
      }
    : undefined;

  return (
    <>
      <WBFaqJsonLd items={faq} />
      <WBFeaturePage
        demo={<WBAppJourney job={job} />}
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
