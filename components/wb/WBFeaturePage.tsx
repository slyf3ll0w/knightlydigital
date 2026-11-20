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
  demo,
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
  /** A live, animated coded copy of the app shown in place of the screenshot
   *  (2026-11-19: WBAppJourney with this page's steps or trade's job,
   *  WBAtlasDemo…). Falls back to the screenshot. */
  demo?: React.ReactNode;
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
              <div className={`absolute -top-9 right-0 hidden items-end gap-1 ${demo ? "" : "lg:flex"}`} aria-hidden>
                <p className="pb-1 text-right text-[14.5px] font-extrabold leading-snug text-[#10244A]">
                  {demo ? "The real app," : "The real screen,"}
                  <br />
                  {demo ? "doing the job" : "not a mockup"}
                </p>
                <WBScribble variant="droop" delay={0.4} className="h-[80px] w-[62px] flex-none" />
              </div>
              {demo ? <div className="mx-auto max-w-5xl">{demo}</div> : (
                <div className="mx-auto max-w-4xl">
                  <WBScreenshotFrame {...screenshot} />
                </div>
              )}
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

      {/* What's included: a spec sheet — the title holds still on the left,
          the features rise in as a ruled list on the right (2026-11-19: the
          9-card icon grid read as AI-made). */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[340px_1fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <h2 className="text-[2.2rem] leading-[1.05] sm:text-[3.2rem]">
              What&apos;s <span className="text-[#F86A0A]">included.</span>
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-gray-600">
              {features.some((f) => f.plan)
                ? `In ${FREE_PLAN_NAME}, the free plan, unless it says otherwise.`
                : `All of it is in ${FREE_PLAN_NAME}, the free plan.`}
            </p>
            <Link href="/apply" className="wb-pill wb-pill-orange mt-8 !px-6 !py-3.5">
              Get started free
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </div>
          <AnimateIn className="wb-stagger grid border-t-2 border-[#0A1428] sm:grid-cols-2 sm:gap-x-10">
            {features.map(({ icon: Icon, title: t, body, plan }) => (
              <div key={t} className="flex gap-4 border-b border-gray-200 py-6">
                <Icon className="mt-1 h-5 w-5 flex-none text-[#F86A0A]" strokeWidth={2.2} />
                <div>
                  <h3 className="flex flex-wrap items-baseline gap-x-2 text-[17.5px] font-extrabold text-gray-900">
                    {t}
                    {plan && <span className="text-[13px] font-bold text-[#0B57D8]">with {PLANS[plan].name}</span>}
                  </h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-gray-600">{body}</p>
                </div>
              </div>
            ))}
          </AnimateIn>
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
