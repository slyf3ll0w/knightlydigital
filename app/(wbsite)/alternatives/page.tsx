import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBCta from "@/components/wb/WBCta";
import WBFaq from "@/components/wb/WBFaq";
import WBFaqJsonLd from "@/components/wb/WBFaqJsonLd";
import { FREE_PLAN_NAME, INCLUDED_SEATS } from "@/lib/plans";
import { ALTERNATIVES, ALTERNATIVES_PATH } from "@/lib/wb-alternatives";
import { FREE_PAGE_PATH } from "@/lib/wb-free";

export const metadata: Metadata = {
  title: "Free alternatives to Jobber, Housecall Pro and ServiceTitan",
  description:
    "Looking for a free alternative to Jobber, Housecall Pro or ServiceTitan? WorkBench FSM is free field service management software for home-service companies: booking, scheduling, quotes with e-signature, invoicing, card and ACH payments and a client portal. Honest page-by-page comparisons.",
  alternates: { canonical: `https://workbenchfsm.com${ALTERNATIVES_PATH}` },
};

const faq = [
  {
    q: "Is there really free field service software?",
    a: `Yes. WorkBench FSM's ${FREE_PLAN_NAME} plan is the full product for ${INCLUDED_SEATS} users, not a trial, with no card and no clock. It is funded by a flat processing fee when a client pays through it, and by optional flat-priced add-ons.`,
  },
  {
    q: "What is the catch?",
    a: "The honest answer is on each page under \"What you give up\": a smaller integration catalog than the platforms that have been at it for a decade, no automated importers, and the ops tools (routes, timesheets, automations, QuickBooks) on a paid add-on rather than the free core.",
  },
  {
    q: "Which is the best Jobber alternative?",
    a: "It depends on the size of the company. For a one-to-ten-person home-service shop that wants booking, scheduling, quotes, invoicing and payments without a per-user subscription, WorkBench fits. For a large multi-location operation, ServiceTitan or Jobber's higher tiers may fit better. Each page here says who it is for and who it is not.",
  },
];

export default function AlternativesPage() {
  return (
    <>
      <WBFaqJsonLd items={faq} />
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-4 sm:px-8 sm:pt-6">
        <AnimateIn>
          <span className="wb-label">Alternatives</span>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">A free alternative to the subscription platforms.</h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-gray-600">
            WorkBench FSM covers what most home-service companies use Jobber, Housecall Pro or ServiceTitan for, and the core plan is free for a small team. Each page below says why people switch, what they keep, what they give up, and what it costs side by side.
          </p>
        </AnimateIn>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {ALTERNATIVES.map((a, i) => (
            <AnimateIn key={a.slug} delay={i * 90}>
              <Link href={`${ALTERNATIVES_PATH}/${a.slug}`} className="group flex h-full flex-col rounded-[1.25rem] border border-gray-200 bg-white p-6 transition-colors hover:border-gray-900">
                <h2 className="text-[20px] font-extrabold text-gray-900">
                  {a.headline[0]} <span className="text-[#0B57D8]">{a.headline[1]}</span>
                </h2>
                <p className="mt-2 flex-1 text-[14.5px] leading-relaxed text-gray-600">{a.reasons[0].body}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-[14px] font-bold text-[#0B57D8]">
                  Read the comparison
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                </span>
              </Link>
            </AnimateIn>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <h2 className="text-2xl font-extrabold sm:text-3xl">Questions</h2>
          <div className="mt-8">
            <WBFaq items={faq} />
          </div>
          <p className="mt-6 text-[14.5px] text-gray-600">
            What &quot;free, not a trial&quot; means, line by line:{" "}
            <Link href={FREE_PAGE_PATH} className="font-semibold text-[#0B57D8] hover:underline">
              the free plan
            </Link>
            .
          </p>
        </AnimateIn>
      </section>

      <WBCta />
    </>
  );
}
