import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mic } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBAtlasVoice from "@/components/wb/WBAtlasVoice";
import WBFeatureTabs from "@/components/wb/WBFeatureTabs";
import WBCta from "@/components/wb/WBCta";
import WBCycleWord from "@/components/wb/WBCycleWord";
import WBMarker from "@/components/wb/WBMarker";
import WBScribble from "@/components/wb/WBScribble";
import WBTilt from "@/components/wb/WBTilt";
import { WBFaqSection } from "@/components/wb/WBFaq";
import WBIntegrations from "@/components/wb/WBIntegrations";
import WBLiveApp from "@/components/wb/WBLiveApp";
import WBNote from "@/components/wb/WBNote";
import WBRibbon from "@/components/wb/WBRibbon";
import WBTestimonials from "@/components/wb/WBTestimonials";
import WBTradeStrip from "@/components/wb/WBTradeStrip";
import WBTryIt from "@/components/wb/WBTryIt";
import { emptyDoc } from "@/lib/tool-doc";
import { DEMO_BOOKING_PATH, DEMO_HUB_PATH } from "@/lib/demo-company-shared";
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { APP_STORE_URL, PLAY_STORE_URL, WB_PHONE } from "@/lib/wb-site";
import { EXTRA_SEAT_CENTS, FREE_PLAN_NAME, INCLUDED_SEATS, PLANS, PROCESSING_RATES, RATES_SENTENCE, formatCents } from "@/lib/plans";

export const metadata: Metadata = {
  title: { absolute: "WorkBench FSM — Free field service management software" },
  alternates: { canonical: "https://workbenchfsm.com/" },
  description:
    `WorkBench FSM is field service management software for home-service companies: scheduling, quoting, invoicing, and payments. Online booking, dispatch, a client portal, team chat, Atlas (an AI assistant you can talk to hands-free), and native iPhone and Android apps. The ${FREE_PLAN_NAME} plan is free for ${INCLUDED_SEATS} users with full access, not a trial; extra users are ${formatCents(EXTRA_SEAT_CENTS)} a month, and optional add-ons cover a phone line, unlimited users, and job photos.`,
};


const faqItems = [
  {
    q: "Is WorkBench really free?",
    a: (
      <p>
        The {FREE_PLAN_NAME} plan is. Every essential feature for{" "}
        {INCLUDED_SEATS} users, with full access, no trial clock, and no credit
        card required. Extra users are{" "}
        {formatCents(EXTRA_SEAT_CENTS)} a month each, and three optional add-ons
        (a business phone line, unlimited users with the ops tools, and job
        photos) are priced flat per company. The core is funded by built-in
        payment processing: when a client pays an invoice through WorkBench, a
        small slice of the flat processing fee is what keeps the lights on. The
        full story is on the{" "}
        <Link href={FREE_PAGE_PATH} className="font-semibold text-[#0B57D8] hover:underline">
          free plan page
        </Link>{" "}
        and the full breakdown is on the{" "}
        <Link href="/pricing" className="font-semibold text-[#0B57D8] hover:underline">
          pricing page
        </Link>
        .
      </p>
    ),
  },
  {
    q: "What does payment processing cost?",
    a: (
      <p>
        {RATES_SENTENCE}
      </p>
    ),
  },
  {
    q: "Do I have to take card payments through WorkBench?",
    a: (
      <p>
        No. Cash and check payments can be recorded on any invoice, and the{" "}
        {FREE_PLAN_NAME} plan stays free either way. Card and ACH are built in for when you
        want them, on invoices, quotes with deposits, and online bookings.
      </p>
    ),
  },
  {
    q: "How does getting started work?",
    a: (
      <p>
        Create your account, then set up getting paid: pick who pays the card
        fee and connect your Square account (Square runs the same KYC check
        every payments provider does, and creating an account there takes a
        few minutes if you have none). The app opens the moment it is
        connected, and most companies are quoting and scheduling the same day
        they sign up. If you would rather talk first, call{" "}
        <a href={WB_PHONE.href} className="font-semibold text-[#0B57D8] hover:underline">
          {WB_PHONE.display}
        </a>
        .
      </p>
    ),
  },
  {
    q: "Is there a mobile app?",
    a: (
      <p>
        Yes. Native apps for iPhone on the{" "}
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener"
          className="font-semibold text-[#0B57D8] hover:underline"
        >
          App Store
        </a>{" "}
        and Android on{" "}
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener"
          className="font-semibold text-[#0B57D8] hover:underline"
        >
          Google Play
        </a>
        , with push notifications for requests, bookings, chat, and payments,
        plus offline viewing of the schedule when a job site has no signal. The
        web app works on any device.
      </p>
    ),
  },
  {
    q: "Will features I use ever move behind a paywall?",
    a: (
      <p>
        No. The features on your plan stay on your plan. If our pricing or
        packaging ever changes, existing customers are grandfathered in on
        everything they already use.
      </p>
    ),
  },
  {
    q: "What does FSM stand for?",
    a: (
      <p>
        Field service management. WorkBench FSM is the full name of the
        product, and it is how the app is listed on the App Store and Google
        Play. On this site we usually just say WorkBench. It is not related to
        any other software called Workbench.
      </p>
    ),
  },
  {
    q: "Can I talk to Atlas instead of typing?",
    a: (
      <p>
        Yes. Tap the microphone in the app and talk the way you&rsquo;d talk to
        an office manager: &ldquo;who still owes me money?&rdquo;, &ldquo;move
        Tuesday&rsquo;s jobs to Friday.&rdquo; Atlas answers out loud within a
        beat, you can interrupt it, and anything that goes to a client is read
        back to you before it is sent. Pick from several voices and accents.
        Voice is on every account and uses a few Atlas tokens a minute. See{" "}
        <Link href="/features/atlas" className="font-semibold text-[#0B57D8] hover:underline">
          Atlas
        </Link>
        .
      </p>
    ),
  },
  {
    q: "Can I get my data out?",
    a: (
      <p>
        Any time. There are no contracts, and your clients, jobs, quotes, and
        invoices export whenever you want them.
      </p>
    ),
  },
];

/**
 * The home page, round 4 (David 2026-11-18: "quite confusing, needs to be
 * simplified"). Eight stops, one idea each:
 *   1. hero (the promise + the live app)  2. what it does (WBFeatureTabs)
 *   3. Atlas  4. the trades  5. from the field (video)
 *   6. pricing, three numbers  7. works with (slider)  8. FAQ, then the CTA.
 */
export default function WBHomePage() {
  const card = PROCESSING_RATES.companyPaid;
  return (
    <>
      {/* ── 1. Hero: big centered type, a cycling word, the brand ribbons, then
           the live app with two notes pointing at what just happened. ── */}
      <section className="relative overflow-hidden bg-white">
        <WBRibbon id="hero-r" className="right-0 top-0 h-[220px] w-[80%] opacity-60 sm:h-[380px] sm:w-[50%] sm:opacity-80 lg:h-[540px] lg:w-[40%] lg:opacity-95" />
        <WBRibbon id="hero-l" className="left-0 top-0 hidden h-[540px] w-[40%] -scale-x-100 opacity-95 lg:block" />
        <div className="relative mx-auto max-w-6xl px-5 pt-[8.5rem] text-center sm:px-8 sm:pt-[11rem]">
          <AnimateIn>
            <h1 className="mx-auto max-w-5xl text-[2.6rem] font-extrabold leading-[1.04] tracking-[-0.03em] text-gray-900 sm:text-[4.2rem] xl:text-[5rem]">
              The one place to run <br className="hidden sm:block" />
              your{" "}
              <WBCycleWord
                label="whole business."
                words={["quotes.", "schedule.", "crew.", "invoices.", "payments.", "whole business."]}
                wordClassName="text-[#0B57D8] underline decoration-[#F86A0A] decoration-[0.09em] underline-offset-[0.14em]"
              />
            </h1>
          </AnimateIn>
          <AnimateIn delay={120}>
            <p className="mx-auto mt-7 max-w-2xl text-[17px] leading-relaxed text-gray-600 sm:text-[19px]">
              Scheduling, quotes, invoicing and payments for home-service companies. Free for your
              first {INCLUDED_SEATS} users.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/apply" className="wb-pill wb-pill-orange">
                Get started free
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
              <Link href="/book-a-call" className="wb-pill wb-pill-outline">
                Book a call
              </Link>
            </div>
          </AnimateIn>

          <AnimateIn delay={160} className="relative mx-auto mt-16 max-w-5xl pb-16 sm:mt-20 sm:pb-24">
            <WBTilt>
              <WBLiveApp />
            </WBTilt>
            <WBNote side="left" delay={1.2} length={260} className="absolute right-[calc(100%-13rem)] top-[392px] z-20 hidden xl:flex">
              New bookings
              <br />
              show up here
            </WBNote>
            <WBNote side="right" delay={1.6} length={130} className="absolute left-[calc(100%-4.5rem)] top-[290px] z-20 hidden xl:flex">
              Paid. No
              <br />
              chasing.
            </WBNote>
          </AnimateIn>
        </div>
      </section>

      {/* ── 2. What it does ── */}
      <section className="border-t border-gray-200 bg-[#F5F7FA]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <AnimateIn className="relative max-w-3xl">
            <h2 className="text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Everything from the first call to the <WBMarker>paid invoice.</WBMarker>
            </h2>
          </AnimateIn>
          <AnimateIn delay={120} className="relative mt-12">
            <div className="absolute -top-[5.5rem] right-6 z-20 hidden items-end gap-1 xl:flex" aria-hidden>
              <p className="pb-3 text-right text-[15px] font-extrabold leading-snug text-[#10244A]">
                The real screens,
                <br />
                not mockups
              </p>
              <WBScribble variant="droop" delay={0.6} className="h-[78px] w-[60px] flex-none" />
            </div>
            <WBFeatureTabs />
          </AnimateIn>
          <p className="mt-8 text-[15px] text-gray-600">
            Plus recurring plans, review requests, a team map, contracts and refunds.{" "}
            <Link href="/features" className="font-bold text-[#0B57D8] hover:underline">
              See every feature
            </Link>
          </p>
        </div>
      </section>

      {/* ── 2b. Try the real thing (Brightwire Electric demo; lib/demo-company.ts) ── */}
      <section id="try-it" className="scroll-mt-24 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <AnimateIn className="relative max-w-3xl">
            <h2 className="text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Don&apos;t take our word for it. <span className="text-gray-400">Try the <WBMarker>real thing.</WBMarker></span>
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-gray-600">
              These are working parts of WorkBench, not pictures of them. Make a real quote and send it, or book a visit with Brightwire Electric, a made-up company we run for demos.
            </p>
            <div className="absolute -bottom-20 right-[-15rem] z-20 hidden items-end gap-1 xl:flex" aria-hidden>
              <p className="pb-3 text-right text-[15px] font-extrabold leading-snug text-[#10244A]">
                Go ahead,
                <br />
                click around
              </p>
              <WBScribble variant="droop" delay={0.5} className="h-[80px] w-[62px] flex-none" />
            </div>
          </AnimateIn>
          <AnimateIn delay={120} className="mt-10">
            <WBTryIt initialQuote={emptyDoc("estimate")} bookingPath={DEMO_BOOKING_PATH} hubPath={DEMO_HUB_PATH} />
          </AnimateIn>
        </div>
      </section>

      {/* ── 3. Atlas: one navy band ── */}
      <section className="wb-dark text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1fr_420px] lg:gap-16">
          <AnimateIn>
            <h2 className="text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Just say it. <span className="text-[#FF8B33]">Atlas gets it done.</span>
            </h2>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-blue-100/85">
              Atlas is the assistant built into WorkBench. Talk to it like an office manager and it
              moves the schedule, drafts the quote and finds who owes you. Anything that goes to a
              client is read back to you first.
            </p>
            <ul className="mt-8 space-y-3">
              {["Who still owes me money?", "Move Tuesday's jobs to Friday.", "Send the Hendersons their quote."].map((s) => (
                <li key={s} className="flex items-center gap-3 text-[16.5px] font-bold text-white">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#0B57D8]">
                    <Mic className="h-4 w-4" strokeWidth={2.25} />
                  </span>
                  &ldquo;{s}&rdquo;
                </li>
              ))}
            </ul>
            <Link href="/features/atlas" className="mt-9 inline-flex items-center gap-1.5 text-[15px] font-bold text-[#FFB27A] hover:text-white">
              More about Atlas
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </AnimateIn>
          <AnimateIn delay={120} className="relative">
            <div className="absolute right-[calc(100%+0.5rem)] top-6 z-20 hidden items-start gap-1 xl:flex" aria-hidden>
              <p className="pt-1 text-right text-[15px] font-extrabold leading-snug text-white">
                Talk,
                <br />
                don&apos;t type
              </p>
              <WBScribble variant="swoop" tone="chalk" delay={0.6} className="mt-6 h-[46px] w-[92px] flex-none" />
            </div>
            <WBAtlasVoice className="mx-auto w-full max-w-[420px]" />
          </AnimateIn>
        </div>
      </section>

      {/* ── 4. The trades ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 pt-20 sm:px-8 sm:pt-28">
          <AnimateIn className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="max-w-2xl text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Built for the trades that <WBMarker>come to the house.</WBMarker>
            </h2>
            <Link href="/trades" className="inline-flex items-center gap-1.5 text-[15px] font-bold text-[#0B57D8] hover:underline">
              Every trade
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </AnimateIn>
        </div>
        <AnimateIn delay={120} className="relative -mt-8 pb-20 sm:pb-28">
          <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
            <div className="absolute -top-[4.5rem] left-[38%] z-20 hidden items-end gap-1 xl:flex" aria-hidden>
              <p className="pb-3 text-[15px] font-extrabold leading-snug text-[#10244A]">
                Find yours.
                <br />
                Hover to stop it.
              </p>
              <WBScribble variant="droop" delay={0.5} className="h-[78px] w-[60px] flex-none" />
            </div>
          </div>
          <div className="mt-14">
            <WBTradeStrip />
          </div>
        </AnimateIn>
      </section>

      {/* ── 5. From the field ── */}
      <WBTestimonials />

      {/* ── 6. Pricing: three numbers ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <AnimateIn className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">Simple pricing.</h2>
            <p className="mx-auto mt-4 max-w-lg text-[17px] leading-relaxed text-gray-600">
              The software is free. You pay a normal card fee when a client pays you, and add-ons only if you want them.
            </p>
          </AnimateIn>
          <AnimateIn className="relative">
            <div className="absolute -top-[5.5rem] -right-8 z-20 hidden items-end gap-1 xl:flex" aria-hidden>
              <p className="pb-2 text-right text-[15px] font-extrabold leading-snug text-[#10244A]">
                The whole bill.
                <br />
                Nothing hidden.
              </p>
              <WBScribble variant="droop" delay={0.4} className="h-[80px] w-[62px] flex-none" />
            </div>
          </AnimateIn>
          <AnimateIn delay={100}>
            <div className="mt-12 grid overflow-hidden rounded-xl bg-white wb-raised md:grid-cols-3 md:divide-x md:divide-gray-200 max-md:divide-y max-md:divide-gray-200">
              {[
                {
                  head: `${FREE_PLAN_NAME} plan`,
                  big: <span className="mr-1.5"><WBMarker shape="circle" delay={0.7}>$0</WBMarker></span>,
                  unit: "a month",
                  body: `Everything you need, free for ${INCLUDED_SEATS} users. Not a trial. Extra users are ${formatCents(EXTRA_SEAT_CENTS)} a month each.`,
                },
                {
                  head: "When a client pays by card",
                  big: `${(card.cardBps / 100).toFixed(2)}%`,
                  unit: `+ ${card.cardFixedCents}¢`,
                  body: "Only when you get paid. Or turn on a service fee and your client covers it.",
                },
                {
                  head: "Add-ons, if you want them",
                  big: `$${PLANS.DISPATCH.monthlyCents / 100}`,
                  unit: "and up, a month",
                  body: "A business phone line, unlimited users, job photos. Turn one on when you need it.",
                },
              ].map((c) => (
                <div key={c.head} className="flex flex-col p-7 sm:p-8">
                  <p className="text-[15px] font-bold text-gray-600">{c.head}</p>
                  <p className="mt-3 flex items-baseline gap-2.5">
                    <span className="text-[3rem] font-extrabold leading-none tracking-[-0.02em] text-gray-900">{c.big}</span>
                    <span className="text-[15px] font-bold text-gray-500">{c.unit}</span>
                  </p>
                  <p className="mt-4 text-[15px] leading-relaxed text-gray-600">{c.body}</p>
                </div>
              ))}
            </div>
          </AnimateIn>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <Link href="/apply" className="wb-pill wb-pill-orange">
              Get started free
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
            <Link href="/pricing" className="wb-pill wb-pill-outline">
              See full pricing
            </Link>
          </div>
        </div>
      </section>

      {/* ── 7. Works with: one sliding row; add to INTEGRATIONS in WBIntegrations ── */}
      <section className="border-t border-gray-200 bg-[#F5F7FA] py-16 sm:py-20">
        <AnimateIn className="mx-auto max-w-6xl px-5 text-center sm:px-8">
          <h2 className="text-2xl font-extrabold sm:text-[2rem]">Works with the tools you already use.</h2>
        </AnimateIn>
        <div className="mt-10">
          <WBIntegrations />
        </div>
      </section>

      {/* ── 8. FAQ, then the closing band ── */}
      <WBFaqSection items={faqItems} title="Questions, answered" />

      <WBCta />
    </>
  );
}
