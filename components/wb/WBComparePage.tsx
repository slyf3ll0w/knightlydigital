import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBHero from "@/components/wb/WBHero";
import WBCta from "@/components/wb/WBCta";
import WBFaq, { FaqItem } from "./WBFaq";
import WBCompareTable, { CompareRow } from "./WBCompareTable";
import type { FeatureItem } from "@/lib/wb-features";

/**
 * Shared template for /vs/[competitor] pages. The goal is an honest,
 * checkable comparison — not a takedown — so every page keeps the same
 * shape: a factual table, a section that credits what the competitor does
 * well, WorkBench's actual differentiators, then FAQ + CTA.
 */
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
  return (
    <>
      {/* Hero */}
      <WBHero>
          <AnimateIn>
            <span className="wb-label">
              WorkBench vs. {competitorName}
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">{title}</h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600">{intro}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/apply"
                className="wb-pill wb-pill-primary"
              >
                Get started
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
              <Link
                href="/pricing"
                className="wb-pill wb-pill-outline"
              >
                How the pricing works
              </Link>
            </div>
            <p className="mt-5 max-w-2xl text-[12.5px] text-gray-400">
              Pricing and features change over time on both sides — the {competitorName} details
              here are general and public; check their site for current plans. WorkBench's numbers
              are exact and current.
            </p>
          </AnimateIn>
      </WBHero>

      {/* Table */}
      <section className="border-b border-gray-200 bg-[#F6F8FB]">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <AnimateIn>
            <WBCompareTable competitorName={competitorName} rows={rows} />
          </AnimateIn>
        </div>
      </section>

      {/* Fair point */}
      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <div className="rounded-[1.5rem] border border-gray-200 bg-[#F6F8FB] px-6 py-7 sm:px-8">
            <p className="text-[13.5px] font-bold text-gray-500">
              Fair's fair
            </p>
            <h2 className="mt-2 text-[18px] font-extrabold text-gray-900">{fairPoint.title}</h2>
            <div className="mt-3 text-[14.5px] leading-relaxed text-gray-600">{fairPoint.body}</div>
          </div>
        </AnimateIn>
      </section>

      {/* Differentiators */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <AnimateIn>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Where WorkBench is different</h2>
          </AnimateIn>
          <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {differentiators.map(({ icon: Icon, title: t, body }, i) => (
              <AnimateIn key={t} delay={(i % 3) * 90}>
                <div className="flex gap-4">
                  <Icon className="mt-0.5 h-5 w-5 flex-none text-[#0B57D8]" strokeWidth={1.9} />
                  <div>
                    <h3 className="text-[15.5px] font-bold text-gray-900">{t}</h3>
                    <p className="mt-1 text-[14px] leading-relaxed text-gray-600">{body}</p>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <h2 className="text-2xl font-extrabold sm:text-3xl">Questions</h2>
          <div className="mt-8">
            <WBFaq items={faq} />
          </div>
        </AnimateIn>
      </section>

      {/* Related */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <p className="text-[13.5px] font-bold text-gray-500">Also compare</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {["jobber", "housecall-pro", "servicetitan"].map((slug) => (
              <Link
                key={slug}
                href={`/vs/${slug}`}
                className="rounded-full border border-gray-200 px-4 py-2 text-[13.5px] font-semibold text-gray-700 transition-colors hover:border-gray-900"
              >
                vs. {slug === "servicetitan" ? "ServiceTitan" : slug === "housecall-pro" ? "Housecall Pro" : "Jobber"} →
              </Link>
            ))}
          </div>
        </div>
      </section>

      <WBCta
        title="Free software. Pay only when you get paid."
        body="No tiers to climb and no seats to count. Sign up and we onboard your company personally."
        secondary={{ label: "See every feature", href: "/features" }}
      />
    </>
  );
}
