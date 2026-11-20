import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBSplitHero from "@/components/wb/WBSplitHero";
import WBScribble from "@/components/wb/WBScribble";
import WBTestimonials from "@/components/wb/WBTestimonials";
import WBCta from "@/components/wb/WBCta";
import { WBFaqSection, type FaqItem } from "./WBFaq";
import WBScreenshotFrame from "./WBScreenshotFrame";
import type { FeatureItem } from "@/lib/wb-features";
import { FREE_PLAN_NAME, INCLUDED_SEATS, PLANS } from "@/lib/plans";

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
  extra,
  features,
  faq,
  related,
  ctaTitle = "Free to start. Full access, not a trial.",
  ctaBody = (
    <>
      {INCLUDED_SEATS} users included, flat-priced add-ons when the crew needs more.
      Your account opens the day you sign up.
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
  /** A page-specific band between "How it works" and the feature grid. */
  extra?: React.ReactNode;
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
        <h1 className="mt-4 text-[2.7rem] leading-[1.0] tracking-[-0.04em] sm:text-[3.8rem]">{title}</h1>
        <p className="mx-auto mt-6 max-w-2xl text-[18px] leading-relaxed text-gray-600 lg:mx-0">{intro}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
          <Link href="/apply" className="wb-pill wb-pill-orange !px-7 !py-4 !text-[16px]">
            Get started free
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <Link href="/features" className="wb-pill wb-pill-outline !px-7 !py-4 !text-[16px]">
            See every feature
          </Link>
        </div>
      </WBSplitHero>

      {/* The real screen (desktop or phone) right under the hero */}
      {(
        <section className="border-b border-gray-200 bg-[#F6F8FB]">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <AnimateIn className="relative">
              <div className="absolute -top-9 right-0 hidden items-end gap-1 lg:flex" aria-hidden>
                <p className="pb-1 text-right text-[14.5px] font-extrabold leading-snug text-[#10244A]">
                  The real screen,
                  <br />
                  not a mockup
                </p>
                <WBScribble variant="droop" delay={0.4} className="h-[80px] w-[62px] flex-none" />
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
        <section className="bg-[#F5F7FA]">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <AnimateIn>
              <h2 className="text-[2.2rem] leading-[1.05] sm:text-[3.2rem]">
                How it <span className="text-[#0B57D8]">works.</span>
              </h2>
            </AnimateIn>
            <AnimateIn className="wb-stagger mt-12 grid gap-4 md:grid-cols-3">
              {steps.map((s, i) => (
                <div key={s.title} className="rounded-xl bg-white p-7 shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F86A0A] text-[15px] font-black text-white">{i + 1}</span>
                  <h3 className="mt-5 text-[19px] font-extrabold text-gray-900">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{s.body}</p>
                </div>
              ))}
            </AnimateIn>
          </div>
        </section>
      )}

      {extra}

      {/* Feature grid */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <AnimateIn>
            <h2 className="text-[2.2rem] leading-[1.05] sm:text-[3.2rem]">
              What&apos;s <span className="text-[#F86A0A]">included.</span>
            </h2>
            <p className="mt-4 text-[16px] font-semibold text-gray-500">
              {features.some((f) => f.plan)
                ? `In ${FREE_PLAN_NAME}, the free plan, unless marked with an add-on.`
                : `All of it is in ${FREE_PLAN_NAME}, the free plan.`}
            </p>
          </AnimateIn>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title: t, body, plan }, i) => (
              <AnimateIn key={t} delay={(i % 3) * 90} className="h-full">
                <div className="flex h-full gap-4 rounded-xl bg-white p-6 shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#0A1428]">
                    <Icon className="h-5 w-5 text-[#FF8B33]" strokeWidth={2} />
                  </span>
                  <div>
                    <h3 className="flex flex-wrap items-center gap-2 text-[17px] font-extrabold text-gray-900">
                      {t}
                      {plan && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#0B57D8]">
                          {PLANS[plan].name}
                        </span>
                      )}
                    </h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-gray-600">{body}</p>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      <WBTestimonials />

      <WBFaqSection items={faq} title="Questions, answered" />

      {/* Related */}
      {related.length > 0 && (
        <section className="border-t border-gray-200 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
            <p className="text-[18px] font-black text-gray-900">Keep exploring</p>
            <ul className="mt-5 grid gap-x-10 border-t-2 border-[#0A1428] sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <li key={r.href} className="border-b border-gray-200">
                  <Link href={r.href} className="flex items-center justify-between py-3.5 text-[15.5px] font-bold text-gray-900 hover:text-[#0B57D8]">
                    {r.label}
                    <ArrowRight className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.5} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <WBCta title={ctaTitle} body={ctaBody} />
    </>
  );
}
