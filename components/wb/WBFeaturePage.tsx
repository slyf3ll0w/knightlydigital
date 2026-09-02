import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBFaq, { FaqItem } from "./WBFaq";
import WBScreenshotFrame from "./WBScreenshotFrame";
import type { FeatureItem } from "@/lib/wb-features";

type Accent = "blue" | "orange";

type Step = { title: string; body: string };

const ACCENT = {
  blue: { hex: "#0B57D8", chip: "bg-blue-50 text-[#0B57D8]", text: "text-[#0B57D8]" },
  orange: { hex: "#F86A0A", chip: "bg-orange-50 text-[#F86A0A]", text: "text-[#F86A0A]" },
} as const;

/**
 * Shared template for the /features/[topic] deep-dive pages: a focused
 * hero, one real screenshot, an optional "how it works" walkthrough, the
 * relevant slice of the feature catalog, an FAQ, and the standard CTA.
 * Keeps six pages visually consistent without six copies of this markup.
 */
export default function WBFeaturePage({
  eyebrow,
  accent,
  title,
  intro,
  screenshot,
  steps,
  features,
  faq,
  related,
}: {
  eyebrow: string;
  accent: Accent;
  title: React.ReactNode;
  intro: string;
  screenshot: { src: string; alt: string; kind?: "desktop" | "mobile"; caption?: string };
  steps?: Step[];
  features: FeatureItem[];
  faq: FaqItem[];
  related: { label: string; href: string }[];
}) {
  const c = ACCENT[accent];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="wb-grid-paper pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pt-16 sm:px-8 sm:pt-24">
          <AnimateIn>
            <span className={`inline-block rounded-full px-3 py-1 text-[12.5px] font-bold ${c.chip}`}>
              {eyebrow}
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">{title}</h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600">{intro}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/apply"
                className="wb-btn-tool inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[15px] font-bold text-white"
                style={{ backgroundColor: c.hex }}
              >
                Get started
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-200 px-6 py-3 text-[15px] font-bold text-gray-700 transition-colors hover:border-gray-400"
              >
                See every feature
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* Screenshot */}
      <section className="mt-14 border-y border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <AnimateIn className={screenshot.kind === "mobile" ? "flex justify-center" : ""}>
            <div className={screenshot.kind === "mobile" ? "" : "mx-auto max-w-4xl"}>
              <WBScreenshotFrame {...screenshot} />
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* How it works */}
      {steps && steps.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <AnimateIn>
            <h2 className="text-2xl font-extrabold sm:text-3xl">How it works</h2>
          </AnimateIn>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {steps.map((s, i) => (
              <AnimateIn key={s.title} delay={i * 90}>
                <div className="flex gap-4">
                  <span
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[13px] font-bold text-white"
                    style={{ backgroundColor: c.hex }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-[15.5px] font-bold text-gray-900">{s.title}</h3>
                    <p className="mt-1 text-[14px] leading-relaxed text-gray-600">{s.body}</p>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>
        </section>
      )}

      {/* Feature grid */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <AnimateIn>
            <h2 className="text-2xl font-extrabold sm:text-3xl">What&apos;s included</h2>
            <p className="mt-2 text-[14.5px] font-semibold text-gray-500">
              All of it is in the free plan, for every seat on your team.
            </p>
          </AnimateIn>
          <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title: t, body }, i) => (
              <AnimateIn key={t} delay={(i % 3) * 90}>
                <div className="flex gap-4">
                  <Icon className={`mt-0.5 h-5 w-5 flex-none ${c.text}`} strokeWidth={1.9} />
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
      {related.length > 0 && (
        <section className="border-t border-gray-200 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Keep exploring</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {related.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="rounded-full border border-gray-200 px-4 py-2 text-[13.5px] font-semibold text-gray-700 transition-colors hover:border-gray-400"
                >
                  {r.label} →
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B2250] via-[#0A1B3D] to-[#0A1428] px-6 py-14 text-center sm:px-12">
            <div className="wb-grid-lines pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative">
              <h2 className="mx-auto max-w-xl text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                All of it, free — for your whole team.
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
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-white/25 px-6 py-3 text-[15px] font-bold text-white transition-colors hover:border-white/60"
                >
                  How the pricing works
                </Link>
              </div>
            </div>
          </div>
        </AnimateIn>
      </section>
    </>
  );
}
