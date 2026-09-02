import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
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
      <section className="relative overflow-hidden">
        <div className="wb-grid-paper pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pt-16 sm:px-8 sm:pt-24">
          <AnimateIn>
            <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-[12.5px] font-bold text-[#0B57D8]">
              WorkBench vs. {competitorName}
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">{title}</h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600">{intro}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/apply"
                className="wb-btn-tool inline-flex items-center gap-2 rounded-lg bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white"
              >
                Get started
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-200 px-6 py-3 text-[15px] font-bold text-gray-700 transition-colors hover:border-gray-400"
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
        </div>
      </section>

      {/* Table */}
      <section className="border-y border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <AnimateIn>
            <WBCompareTable competitorName={competitorName} rows={rows} />
          </AnimateIn>
        </div>
      </section>

      {/* Fair point */}
      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-6 py-7 sm:px-8">
            <p className="text-[12.5px] font-bold uppercase tracking-wide text-gray-400">
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
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Also compare</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {["jobber", "housecall-pro", "servicetitan"].map((slug) => (
              <Link
                key={slug}
                href={`/vs/${slug}`}
                className="rounded-full border border-gray-200 px-4 py-2 text-[13.5px] font-semibold text-gray-700 transition-colors hover:border-gray-400"
              >
                vs. {slug === "servicetitan" ? "ServiceTitan" : slug === "housecall-pro" ? "Housecall Pro" : "Jobber"} →
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B2250] via-[#0A1B3D] to-[#0A1428] px-6 py-14 text-center sm:px-12">
            <div className="wb-grid-lines pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative">
              <h2 className="mx-auto max-w-xl text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                Free software. Pay only when you get paid.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-blue-100/85">
                No tiers to climb and no seats to count. Apply, and we&apos;ll
                onboard your company personally.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/apply"
                  className="wb-btn-tool inline-flex items-center gap-2 rounded-lg bg-[#F86A0A] px-7 py-3 text-[15px] font-bold text-white"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </Link>
                <Link
                  href="/features"
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-white/25 px-6 py-3 text-[15px] font-bold text-white transition-colors hover:border-white/60"
                >
                  See every feature
                </Link>
              </div>
            </div>
          </div>
        </AnimateIn>
      </section>
    </>
  );
}
