import Link from "next/link";
import { ArrowRight, ClipboardCheck, Scale } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBSplitHero, { WB_SHOTS } from "@/components/wb/WBSplitHero";
import WBScribble from "@/components/wb/WBScribble";
import WBTestimonials from "@/components/wb/WBTestimonials";
import WBOdometer from "@/components/wb/WBOdometer";
import { WB_TRADE_PHOTOS } from "@/lib/wb-site";
import WBCta from "@/components/wb/WBCta";
import WBAgentLink from "@/components/wb/WBAgentLink";
import { VS_LIST } from "@/lib/wb-vs";
import { COMPETITORS } from "@/lib/wb-savings";
import { WBFaqSection, type FaqItem } from "./WBFaq";
import WBCompareTable, { type CompareRow } from "./WBCompareTable";
import WBVsCost, { typicalSavings } from "./WBVsCost";
import WBVsSwitch from "./WBVsSwitch";
import type { FeatureItem } from "@/lib/wb-features";
import { EXTRA_SEAT_CENTS, INCLUDED_SEATS, formatCents } from "@/lib/plans";

/**
 * Shared template for /vs/[competitor] pages. The goal is an honest,
 * checkable comparison — not a takedown — so every page keeps the same
 * shape: a year of cost (when the competitor publishes prices; computed by
 * lib/wb-savings.ts), the factual table, a card that credits what the
 * competitor does well, WorkBench's actual differentiators, the switch,
 * then FAQ + CTA. The hero is the home page's split hero.
 */

const PHOTO: Record<string, { src: string; alt: string }> = {
  Jobber: WB_TRADE_PHOTOS.lawn,
  "Housecall Pro": WB_TRADE_PHOTOS.plumbing,
  ServiceTitan: WB_TRADE_PHOTOS.hvac,
};
const H2 = "text-[2.2rem] leading-[1.05] sm:text-[3.2rem]";
const CARD = "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";
const BLUE = "linear-gradient(135deg, #0A45B8 0%, #0B57D8 55%, #2563EB 100%)";

export default function WBComparePage({
  competitorName,
  title,
  intro,
  rows,
  fairPoint,
  differentiators,
  faq,
}: {
  competitorName: string;
  title: React.ReactNode;
  intro: string;
  rows: CompareRow[];
  fairPoint: { title: string; body: React.ReactNode };
  differentiators: FeatureItem[];
  faq: FaqItem[];
}) {
  const vs = VS_LIST.find((v) => v.name === competitorName);
  const priced = COMPETITORS.find((c) => c.name === competitorName);
  const kept = priced ? typicalSavings(priced.id).keptYearCents : 0;
  return (
    <>
      {/* Hero */}
      <WBSplitHero
        photo={PHOTO[competitorName] ?? WB_TRADE_PHOTOS.electrical}
        phone={WB_SHOTS.jobs}
        chip={{
          icon: <ClipboardCheck className="h-[18px] w-[18px] text-[#F86A0A]" strokeWidth={2.2} />,
          title: "Client list imported",
          sub: "From a spreadsheet, in minutes",
        }}
      >
        <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] sm:text-5xl">{title}</h1>
        <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600 lg:mx-0">{intro}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
          <Link href="/apply" className="wb-pill wb-pill-primary">
            Get started
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <Link href="/pricing" className="wb-pill wb-pill-outline">
            How the pricing works
          </Link>
        </div>
        <p className="mx-auto mt-5 max-w-2xl text-[12.5px] text-gray-400 lg:mx-0">
          Pricing and features change over time on both sides — the {competitorName} details
          here are general and public; check their site for current plans. WorkBench&apos;s numbers
          are exact and current.
        </p>
      </WBSplitHero>

      {/* A year of cost — only where the competitor publishes a price */}
      {priced && (
        <section className="bg-white">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[0.9fr_1.1fr]">
            <AnimateIn>
              <h2 className={H2}>
                Same card fees. <span className="text-[#0B57D8]">No subscription on top.</span>
              </h2>
              <p className="mt-6 max-w-md text-[18px] leading-relaxed text-gray-600">
                A card payment costs about the same on either one. The difference is the monthly bill {competitorName} adds for the
                software; on WorkBench the core is free.
              </p>
              <div className="mt-10">
                <p className="text-[16px] font-bold text-gray-500">A typical three-person shop keeps</p>
                <p className="mt-1 text-[#F86A0A]">
                  <WBOdometer value={kept / 100} money className="text-[4rem] font-black leading-none tracking-[-0.04em] sm:text-[5.2rem]" />
                </p>
                <p className="mt-2 text-[16px] font-bold text-[#0A1428]">a year on WorkBench.</p>
              </div>
            </AnimateIn>
            <AnimateIn delay={120}>
              <div className={`${CARD} p-6 sm:p-8`}>
                <WBVsCost only={priced.id} />
              </div>
            </AnimateIn>
          </div>
        </section>
      )}

      {/* Table */}
      <section className={priced ? "bg-[#F5F7FA]" : "bg-white"}>
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
          <div className="relative">
            <AnimateIn>
              <h2 className={H2}>
                Side by side, <span className="text-[#0B57D8]">topic by topic.</span>
              </h2>
            </AnimateIn>
            <div className="absolute -top-4 right-2 hidden items-end gap-1 lg:flex" aria-hidden>
              <p className="pb-1 text-right text-[15px] font-extrabold leading-snug text-[#10244A]">
                No fine
                <br />
                print
              </p>
              <WBScribble variant="droop" delay={0.4} className="h-[80px] w-[62px] flex-none" />
            </div>
          </div>
          <div className="mt-12">
            <WBCompareTable competitorName={competitorName} rows={rows} />
          </div>
        </div>
      </section>

      {/* Fair point (blue band) */}
      <section className="text-white" style={{ background: BLUE }}>
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[0.8fr_1.2fr]">
          <AnimateIn>
            <h2 className={H2}>
              Fair&apos;s fair.
            </h2>
            <p className="mt-6 max-w-sm text-[18px] leading-relaxed text-white/85">
              Where {competitorName} is strong, we say so. Pick the one that fits the way you work.
            </p>
          </AnimateIn>
          <AnimateIn delay={120}>
            <div className={`${CARD} p-7 text-[#0A1428] sm:p-9`}>
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-[#0A1428]">
                  <Scale className="h-6 w-6 text-[#FF8B33]" strokeWidth={2} />
                </span>
                <h3 className="pt-1 text-[22px] font-black leading-snug sm:text-[24px]">{fairPoint.title}</h3>
              </div>
              <div className="mt-5 text-[17px] leading-relaxed text-gray-600">{fairPoint.body}</div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* Differentiators */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[0.8fr_1.2fr]">
          <AnimateIn>
            <h2 className={`${H2} lg:sticky lg:top-28`}>
              Where WorkBench <span className="text-[#F86A0A]">is different.</span>
            </h2>
          </AnimateIn>
          <AnimateIn className={`wb-stagger ${CARD} divide-y divide-gray-100`}>
            {differentiators.map(({ icon: Icon, title: t, body }) => (
              <div key={t} className="flex gap-5 p-6 sm:p-7">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-[#0A1428]">
                  <Icon className="h-5 w-5 text-[#FF8B33]" strokeWidth={2} />
                </span>
                <div>
                  <h3 className="text-[18px] font-black text-[#0A1428]">{t}</h3>
                  <p className="mt-1.5 text-[16px] leading-relaxed text-gray-600">{body}</p>
                </div>
              </div>
            ))}
          </AnimateIn>
        </div>
      </section>

      <WBVsSwitch from={competitorName} />

      <WBTestimonials />

      <WBFaqSection items={faq} title="Questions, answered" />

      {/* Related */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <p className="text-[18px] font-black text-gray-900">Also compare</p>
          <div className="mt-5 grid gap-x-10 border-t-2 border-[#0A1428] sm:grid-cols-2 lg:grid-cols-3">
            {["jobber", "housecall-pro", "servicetitan"].map((slug) => (
              <Link
                key={slug}
                href={`/vs/${slug}`}
                className="flex items-center justify-between border-b border-gray-200 py-3.5 text-[15.5px] font-bold text-gray-900 hover:text-[#0B57D8]"
              >
                vs. {slug === "servicetitan" ? "ServiceTitan" : slug === "housecall-pro" ? "Housecall Pro" : "Jobber"} →
              </Link>
            ))}
          </div>
        </div>
      </section>

      {vs && <WBAgentLink href={`/vs/${vs.slug}.md`} what="this comparison" />}

      <WBCta
        title="Free to start. Pay as the crew grows."
        body={`Free for ${INCLUDED_SEATS} users, ${formatCents(EXTRA_SEAT_CENTS)} a month per extra user, no contract. Sign up and we onboard your company personally.`}
        secondary={{ label: "See every feature", href: "/features" }}
      />
    </>
  );
}
