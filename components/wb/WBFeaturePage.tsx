import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBSplitHero from "@/components/wb/WBSplitHero";
import WBScribble from "@/components/wb/WBScribble";
import WBTestimonials from "@/components/wb/WBTestimonials";
import WBCta from "@/components/wb/WBCta";
import WBFaq, { FaqItem } from "./WBFaq";
import WBScreenshotFrame from "./WBScreenshotFrame";
import type { FeatureItem } from "@/lib/wb-features";
import { FREE_PLAN_NAME, PLANS } from "@/lib/plans";

type Accent = "blue" | "orange";

type Step = { title: string; body: string };

const ACCENT = {
  blue: { hex: "#0B57D8", chip: "bg-blue-50 text-[#0B57D8]", text: "text-[#0B57D8]" },
  orange: { hex: "#F86A0A", chip: "bg-orange-50 text-[#F86A0A]", text: "text-[#F86A0A]" },
} as const;

/**
 * Shared template for the /features/[topic] deep-dive pages: the home
 * page's split hero (job-site photo + the real phone screenshot with a
 * magnified close-up), the desktop screenshot when there is one, an optional "how it works" walkthrough, the
 * relevant slice of the feature catalog, an FAQ, and the standard CTA.
 * Keeps six pages visually consistent without six copies of this markup.
 */
export default function WBFeaturePage({
  eyebrow,
  accent,
  title,
  intro,
  screenshot,
  photo,
  phone,
  chip,
  steps,
  features,
  faq,
  related,
  ctaTitle = "Free to start. Full access, not a trial.",
  ctaBody = (
    <>
      Two users included, flat-priced add-ons when the crew needs more.
      Apply, and we&apos;ll onboard your company personally.
    </>
  ),
}: {
  eyebrow: string;
  accent: Accent;
  title: React.ReactNode;
  intro: string;
  screenshot: { src: string; alt: string; kind?: "desktop" | "mobile"; caption?: string };
  /** Job-site photo behind the phone in the hero. */
  photo: { src: string; alt: string };
  /** Real phone screenshot for the hero (see WB_SHOTS in WBSplitHero). */
  phone: React.ComponentProps<typeof WBSplitHero>["phone"];
  chip?: React.ComponentProps<typeof WBSplitHero>["chip"];
  steps?: Step[];
  features: FeatureItem[];
  faq: FaqItem[];
  related: { label: string; href: string }[];
  ctaTitle?: React.ReactNode;
  ctaBody?: React.ReactNode;
}) {
  const c = ACCENT[accent];

  return (
    <>
      {/* Hero */}
      <WBSplitHero photo={photo} phone={phone} chip={chip}>
        <span className={`inline-block rounded-full px-3 py-1 text-[12.5px] font-bold ${c.chip}`}>{eyebrow}</span>
        <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] sm:text-5xl">{title}</h1>
        <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600 lg:mx-0">{intro}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
          <Link href="/apply" className="wb-pill text-white" style={{ backgroundColor: c.hex }}>
            Get started
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <Link href="/features" className="wb-pill wb-pill-outline">
            See every feature
          </Link>
        </div>
      </WBSplitHero>

      {/* Screenshot (desktop; the phone view is already in the hero) */}
      {screenshot.kind !== "mobile" && (
        <section className="border-b border-gray-200 bg-[#F6F8FB]">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <AnimateIn className="relative">
              <div className="absolute -top-9 right-0 hidden items-end gap-1 lg:flex" aria-hidden>
                <p className="pb-1 text-right text-[14.5px] font-extrabold leading-snug text-[#10244A]">
                  The real screen,
                  <br />
                  not a mockup
                </p>
                <WBScribble variant="loop" delay={0.4} className="h-[56px] w-[88px] rotate-[64deg]" />
              </div>
              <div className="mx-auto max-w-4xl">
                <WBScreenshotFrame {...screenshot} />
              </div>
            </AnimateIn>
          </div>
        </section>
      )}

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
              {features.some((f) => f.plan)
                ? `In ${FREE_PLAN_NAME}, the free plan, unless marked with an add-on.`
                : `All of it is in ${FREE_PLAN_NAME}, the free plan.`}
            </p>
          </AnimateIn>
          <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title: t, body, plan }, i) => (
              <AnimateIn key={t} delay={(i % 3) * 90}>
                <div className="flex gap-4">
                  <Icon className={`mt-0.5 h-5 w-5 flex-none ${c.text}`} strokeWidth={1.9} />
                  <div>
                    <h3 className="flex flex-wrap items-center gap-2 text-[15.5px] font-bold text-gray-900">
                      {t}
                      {plan && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#0B57D8]">
                          {PLANS[plan].name}
                        </span>
                      )}
                    </h3>
                    <p className="mt-1 text-[14px] leading-relaxed text-gray-600">{body}</p>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      <WBTestimonials />

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
            <p className="text-[13.5px] font-bold text-gray-500">Keep exploring</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {related.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="rounded-full border border-gray-200 px-4 py-2 text-[13.5px] font-semibold text-gray-700 transition-colors hover:border-gray-900"
                >
                  {r.label} →
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <WBCta title={ctaTitle} body={ctaBody} />
    </>
  );
}
