import Link from "next/link";
import { ArrowRight, ClipboardCheck, Minus } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBSplitHero from "@/components/wb/WBSplitHero";
import WBCta from "@/components/wb/WBCta";
import { WBFaqSection } from "@/components/wb/WBFaq";
import WBAgentLink from "@/components/wb/WBAgentLink";
import WBFaqJsonLd from "@/components/wb/WBFaqJsonLd";
import WBTestimonials from "@/components/wb/WBTestimonials";
import { featureByTitle } from "@/lib/wb-features";
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { WB_SHOTS } from "@/lib/wb-site";
import { COMPETITORS } from "@/lib/wb-savings";
import WBOdometer from "@/components/wb/WBOdometer";
import WBVsCost, { typicalSavings } from "./WBVsCost";
import WBVsSwitch from "./WBVsSwitch";
import { ALTERNATIVES, ALTERNATIVES_PATH, type Alternative } from "@/lib/wb-alternatives";
import { EXTRA_SEAT_CENTS, FREE_PLAN_NAME, INCLUDED_SEATS, PLANS, RATES_SHORT, formatCents } from "@/lib/plans";
import { TOOLS_PATH } from "@/lib/wb-tools";

/**
 * Template for /alternatives/<competitor>. Honest by construction: a
 * "what you give up" list on every page, a pricing example computed by
 * lib/wb-savings.ts (which leans in the competitor's favour and fails the
 * build when its figures go stale), and a link to the feature-by-feature
 * vs page. Every WorkBench number comes from lib/plans. Same look as the
 * /vs pages: the year-of-cost bars on a blue band, the coded import.
 */
const H2 = "text-[2.2rem] leading-[1.05] sm:text-[3.2rem]";
const CARD = "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";
const BLUE = "linear-gradient(135deg, #0A45B8 0%, #0B57D8 55%, #2563EB 100%)";

export default function WBAlternativePage({ alt }: { alt: Alternative }) {
  const competitor = alt.savingsId ? COMPETITORS.find((c) => c.id === alt.savingsId) : undefined;
  const kept = competitor ? typicalSavings(competitor.id).keptYearCents : 0;
  const faq = alt.faq;
  const others = ALTERNATIVES.filter((a) => a.slug !== alt.slug);

  return (
    <>
      <WBFaqJsonLd items={faq} />
      <WBSplitHero
        photo={alt.photo}
        phone={WB_SHOTS.jobs}
        chip={{ icon: <ClipboardCheck className="h-[18px] w-[18px] text-[#F86A0A]" strokeWidth={2.2} />, title: "Client list imported", sub: "From a spreadsheet, in minutes" }}
      >
        <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] sm:text-5xl">
          {alt.headline[0]} <span className="text-[#0B57D8]">{alt.headline[1]}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600 lg:mx-0">{alt.intro}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
          <Link href="/apply" className="wb-pill wb-pill-primary">
            Get started free
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <Link href={`/vs/${alt.slug}`} className="wb-pill wb-pill-outline">
            Feature by feature
          </Link>
        </div>
        <p className="mx-auto mt-5 max-w-2xl text-[12.5px] text-gray-400 lg:mx-0">
          {alt.name}&apos;s plans and features change; what is said about them here is general and public. WorkBench&apos;s numbers are exact and current.
        </p>
      </WBSplitHero>

      {/* Why people look */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
          <AnimateIn>
            <h2 className={`max-w-3xl ${H2}`}>
              Why people look for a <span className="text-[#0B57D8]">{alt.name} alternative.</span>
            </h2>
          </AnimateIn>
          <AnimateIn className={`wb-stagger mt-12 grid ${CARD} md:grid-cols-3 md:divide-x divide-y md:divide-y-0 divide-gray-100`}>
            {alt.reasons.map((r) => (
              <div key={r.title} className="p-7">
                <span className="block h-1 w-10 rounded-full bg-[#F86A0A]" aria-hidden />
                <h3 className="mt-5 text-[19px] font-black leading-snug text-[#0A1428]">{r.title}</h3>
                <p className="mt-2 text-[16px] leading-relaxed text-gray-600">{r.body}</p>
              </div>
            ))}
          </AnimateIn>
        </div>
      </section>

      {/* Keep / give up */}
      <section className="bg-[#F5F7FA]">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <AnimateIn>
              <h2 className={H2}>
                What you <span className="text-[#0B57D8]">keep.</span>
              </h2>
              <p className="mt-5 text-[18px] leading-relaxed text-gray-600">All of it in {FREE_PLAN_NAME}, the free plan.</p>
            </AnimateIn>
            <AnimateIn className="wb-stagger mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {alt.keeps.map((title) => {
                const f = featureByTitle(title);
                const Icon = f.icon;
                return (
                  <div key={title} className="flex gap-4">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#0A1428]">
                      <Icon className="h-5 w-5 text-[#FF8B33]" strokeWidth={2} />
                    </span>
                    <div>
                      <p className="text-[16.5px] font-black text-[#0A1428]">{f.title}</p>
                      <p className="mt-1 text-[15px] leading-relaxed text-gray-600">{f.body}</p>
                    </div>
                  </div>
                );
              })}
            </AnimateIn>
          </div>
          <AnimateIn delay={120}>
            <div className={`${CARD} p-7 lg:sticky lg:top-28`}>
              <h2 className="text-[26px] font-black leading-tight">What you give up</h2>
              <p className="mt-1.5 text-[15px] text-gray-500">The honest list, so the switch is not a surprise.</p>
              <ul className="mt-6 divide-y divide-gray-100">
                {alt.gives.map((g) => (
                  <li key={g} className="flex gap-3 py-3.5 text-[15.5px] leading-relaxed text-gray-700">
                    <Minus className="mt-1 h-4 w-4 flex-none text-[#F86A0A]" strokeWidth={2.75} />
                    {g}
                  </li>
                ))}
              </ul>
              <Link href={`/vs/${alt.slug}`} className="mt-5 inline-flex items-center gap-2 text-[15px] font-bold text-[#0B57D8] hover:underline">
                The full comparison
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* What it costs (blue band) */}
      {competitor ? (
        <section className="text-white" style={{ background: BLUE }}>
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[0.9fr_1.1fr]">
            <AnimateIn>
              <h2 className={H2}>What it costs, side by side.</h2>
              <p className="mt-6 max-w-md text-[18px] leading-relaxed text-white/85">
                {FREE_PLAN_NAME} includes {INCLUDED_SEATS} users free; extra users are {formatCents(EXTRA_SEAT_CENTS)} a month each, or unlimited with{" "}
                {PLANS.SHOP.name} at {formatCents(PLANS.SHOP.monthlyCents)} a month. Card payments are {RATES_SHORT}, about what you pay anywhere.
              </p>
              <div className="mt-10 rounded-xl bg-white px-6 py-6 text-[#0A1428] shadow-[0_2px_0_rgba(0,0,0,0.15),0_30px_50px_-28px_rgba(0,0,0,0.55)]">
                <p className="text-[16px] font-bold text-gray-500">A typical three-person shop keeps</p>
                <p className="mt-1 text-[#F86A0A]">
                  <WBOdometer value={kept / 100} money className="text-[3.6rem] font-black leading-none tracking-[-0.04em] sm:text-[4.6rem]" />
                </p>
                <p className="mt-2 text-[16px] font-bold">a year, next to {alt.name}.</p>
              </div>
            </AnimateIn>
            <AnimateIn delay={120}>
              <div className={`${CARD} p-6 text-[#0A1428] sm:p-8`}>
                <WBVsCost only={competitor.id} />
              </div>
            </AnimateIn>
          </div>
        </section>
      ) : (
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
            <AnimateIn>
              <h2 className={H2}>
                What it <span className="text-[#0B57D8]">costs.</span>
              </h2>
              <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-gray-600">
                {alt.name} does not publish a list price, so there is no worked example here. On WorkBench, {FREE_PLAN_NAME} includes{" "}
                {INCLUDED_SEATS} users free; extra users are {formatCents(EXTRA_SEAT_CENTS)} a month each, or unlimited with {PLANS.SHOP.name} at{" "}
                {formatCents(PLANS.SHOP.monthlyCents)} a month. Card payments are {RATES_SHORT}.{" "}
                <Link href="/pricing#savings" className="font-semibold text-[#0B57D8] hover:underline">
                  See the full pricing
                </Link>
                .
              </p>
            </AnimateIn>
          </div>
        </section>
      )}

      <WBVsSwitch from={alt.name} bg={competitor ? "bg-white" : "bg-[#F5F7FA]"} />

      <WBTestimonials />

      <WBFaqSection items={faq} title="Questions, answered" />

      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <p className="text-[18px] font-black text-gray-900">Keep exploring</p>
          <div className="mt-5 grid gap-x-10 border-t-2 border-[#0A1428] sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: `WorkBench vs. ${alt.name}`, href: `/vs/${alt.slug}` },
              ...others.map((o) => ({ label: `${o.name} alternative`, href: `${ALTERNATIVES_PATH}/${o.slug}` })),
              { label: "The free plan", href: FREE_PAGE_PATH },
              { label: "Free invoice and estimate tools", href: TOOLS_PATH },
              { label: "Pricing", href: "/pricing" },
            ].map((r) => (
              <Link key={r.href} href={r.href} className="flex items-center justify-between border-b border-gray-200 py-3.5 text-[15.5px] font-bold text-gray-900 hover:text-[#0B57D8]">
                {r.label} →
              </Link>
            ))}
          </div>
        </div>
      </section>

      <WBAgentLink href={`${ALTERNATIVES_PATH}/${alt.slug}.md`} what="this page" />

      <WBCta title="Free to start. Full access, not a trial." body={<>Your account opens today. Bring your client list, set your prices, and send the first quote this afternoon.</>} />
    </>
  );
}
