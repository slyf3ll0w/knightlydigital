import { PROCESSING_RATES, RATES, RATES_SENTENCE } from "@/lib/plans";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import WBAtlasCards from "@/components/wb/WBAtlasCards";
import { WBAtlasVoiceSection } from "@/components/wb/WBAtlasVoice";
import WBCta from "@/components/wb/WBCta";
import WBDayOnTheJob from "@/components/wb/WBDayOnTheJob";
import { WBFaqSection } from "@/components/wb/WBFaq";
import WBInAction from "@/components/wb/WBInAction";
import WBPhoneShowcase from "@/components/wb/WBPhoneShowcase";
import WBTestimonials from "@/components/wb/WBTestimonials";
import WBScribble from "@/components/wb/WBScribble";
import WBBento from "@/components/wb/WBBento";
import WBCountUp from "@/components/wb/WBCountUp";
import WBCycleWord from "@/components/wb/WBCycleWord";
import WBIntegrations from "@/components/wb/WBIntegrations";
import WBLiveApp from "@/components/wb/WBLiveApp";
import WBNote from "@/components/wb/WBNote";
import WBRibbon from "@/components/wb/WBRibbon";
import { TRADES } from "@/lib/wb-trades";
import { ATLAS_FREE_TOKENS } from "@/lib/atlas-pricing";
import WBTradeCards from "@/components/wb/WBTradeCards";
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { APP_STORE_URL, PLAY_STORE_URL, WB_PHONE } from "@/lib/wb-site";
import { EXTRA_SEAT_CENTS, FREE_PLAN_NAME, INCLUDED_SEATS, PLANS, formatCents } from "@/lib/plans";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Check,
  Smartphone,
  WifiOff,
} from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "WorkBench FSM — Free field service management software" },
  alternates: { canonical: "https://workbenchfsm.com/" },
  description:
    `WorkBench FSM is field service management software for home-service companies: scheduling, quoting, invoicing, and payments. Online booking, dispatch, a client portal, team chat, Atlas (an AI assistant you can talk to hands-free), and native iPhone and Android apps. The ${FREE_PLAN_NAME} plan is free for ${INCLUDED_SEATS} users with full access, not a trial; extra users are ${formatCents(EXTRA_SEAT_CENTS)} a month, and optional add-ons cover a phone line, unlimited users, and job photos.`,
};

const rateRows = [
  { label: "The software", value: `${FREE_PLAN_NAME} plan, free` },
  { label: "Users", value: `${INCLUDED_SEATS} included, ${formatCents(EXTRA_SEAT_CENTS)} each after` },
  { label: "Monthly fee", value: `$0 on ${FREE_PLAN_NAME}` },
  { label: "Card payments", value: `${RATES.companyPaid.card} company-paid` },
  { label: "ACH bank transfers", value: `${RATES.companyPaid.achShort} company-paid` },
  { label: "Client service fee option", value: `${RATES.serviceFee.card} card · ${RATES.serviceFee.achShort} ACH` },
  { label: "Atlas tokens", value: "10,000 free a month" },
  { label: "Add-ons", value: `From ${formatCents(PLANS.DISPATCH.monthlyCents)} a month` },
];

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

export default function WBHomePage() {
  return (
    <>
      {/* ── Hero (Stripe-style): big centered type with a cycling word over a
           flowing brand ribbon, then the live app with hand-drawn notes. ── */}
      <section className="relative overflow-hidden bg-white">
        <WBRibbon id="hero-r" className="right-0 top-0 h-[220px] w-[80%] opacity-60 sm:h-[380px] sm:w-[50%] sm:opacity-80 lg:h-[540px] lg:w-[40%] lg:opacity-95" />
        <WBRibbon id="hero-l" className="left-0 top-0 hidden h-[460px] w-[32%] -scale-x-100 opacity-35 lg:block" />
        <div className="relative mx-auto max-w-6xl px-5 pt-14 text-center sm:px-8 sm:pt-20 lg:pt-24">
          <AnimateIn>
            <p className="wb-label">Field service management software</p>
            <h1 className="mx-auto mt-5 max-w-5xl text-[2.6rem] font-extrabold leading-[1.04] tracking-[-0.03em] text-gray-900 sm:text-[4.2rem] xl:text-[5rem]">
              The one place to run <br className="hidden sm:block" />
              your{" "}
              <WBCycleWord
                label="whole business."
                words={["quotes.", "schedule.", "crew.", "invoices.", "payments.", "whole business."]}
                wordClassName="bg-gradient-to-r from-[#0B57D8] via-[#7A5CF0] to-[#F86A0A] bg-clip-text pb-[0.08em] text-transparent"
              />
            </h1>
          </AnimateIn>
          <AnimateIn delay={120}>
            <p className="mx-auto mt-7 max-w-2xl text-[17px] leading-relaxed text-gray-600 sm:text-[19px]">
              Scheduling, quotes, invoicing and payments for home-service companies, plus Atlas, an
              assistant you can talk to hands-free. The {FREE_PLAN_NAME} plan is free for your first {INCLUDED_SEATS} users.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/apply" className="wb-pill wb-pill-orange">
                Get started free
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
              <Link href="/book-a-call" className="wb-pill wb-pill-outline">
                <CalendarDays className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.25} aria-hidden />
                Book a call
              </Link>
            </div>
          </AnimateIn>

          {/* The live app, with notes pointing at what just happened */}
          <AnimateIn delay={160} className="relative mx-auto mt-16 max-w-5xl pb-16 sm:mt-20 sm:pb-24">
            <WBLiveApp />
            <WBNote arrow="right" delay={1.4} className="absolute -left-[10.5rem] top-[33%] hidden w-[10rem] xl:flex" arrowClassName="rotate-[14deg]">
              Bookings land
              <br />
              on their own
            </WBNote>
            <WBNote arrow="left" delay={1.8} className="absolute -right-[10.5rem] top-[22%] hidden w-[10rem] xl:flex" arrowClassName="-rotate-[10deg]">
              Paid, and counted
              <br />
              for you
            </WBNote>
          </AnimateIn>
        </div>
      </section>

      {/* ── By the numbers: counts up as it scrolls in ── */}
      <section className="border-y border-gray-200 bg-[#F5F7FA]">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 px-5 sm:px-8 lg:grid-cols-4">
          {[
            { v: <WBCountUp value={INCLUDED_SEATS} />, k: "users free on Core, for good" },
            { v: <WBCountUp value={PROCESSING_RATES.companyPaid.cardBps / 100} decimals={2} suffix="%" />, k: `per card payment, + ${PROCESSING_RATES.companyPaid.cardFixedCents}¢. Nothing monthly` },
            { v: <WBCountUp value={ATLAS_FREE_TOKENS} />, k: "Atlas tokens free every month" },
            { v: <WBCountUp value={TRADES.length} />, k: "trades it is built for" },
          ].map((s, i) => (
            <div key={i} className={`py-8 sm:py-10 ${i % 2 === 1 ? "pl-6" : "pr-6"} lg:px-8 lg:first:pl-0 ${i > 0 ? "lg:border-l lg:border-gray-200" : ""} ${i >= 2 ? "border-t border-gray-200 lg:border-t-0" : ""}`}>
              <dt className="sr-only">{s.k}</dt>
              <dd>
                <span className="block text-[2.6rem] font-extrabold leading-none text-gray-900 sm:text-[3.2rem]">{s.v}</span>
                <span className="mt-2 block text-[14.5px] font-semibold text-gray-500">{s.k}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── What WorkBench does: the bento of real screens ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <AnimateIn className="relative max-w-3xl">
            <h2 className="text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              One system from the first call to the paid invoice.{" "}
              <span className="text-gray-400">Nothing to bolt on, nothing to stitch together.</span>
            </h2>
            <WBNote arrow="down" delay={0.7} className="absolute -bottom-20 right-[-16rem] hidden xl:flex">
              Real screens.
              <br />
              Tap one.
            </WBNote>
          </AnimateIn>
          <div className="mt-12">
            <WBBento />
          </div>
          <p className="mt-8 text-[15px] text-gray-600">
            Also included: recurring plans, review requests, a team map, contracts, and one-click refunds.{" "}
            <Link href="/features" className="font-bold text-[#0B57D8] hover:underline">
              See every feature
            </Link>
          </p>
        </div>
      </section>

      {/* ── Atlas ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <AnimateIn className="max-w-3xl">
            <p className="wb-label">Atlas, the built-in assistant</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Just say it. Atlas gets it done.{" "}
              <span className="text-gray-400">Out loud or typed, it asks before anything reaches a client.</span>
            </h2>
            <p className="mt-5 text-[17px] leading-relaxed text-gray-600">
              Tap the mic and talk to Atlas the way you&rsquo;d talk to an office
              manager. It answers in a natural voice within a beat, moves the
              schedule, drafts the quote, finds who owes you, and reads anything
              client-facing back to you before it goes out.
            </p>
          </AnimateIn>
          <AnimateIn delay={120} className="mt-12">
            <WBAtlasVoiceSection />
          </AnimateIn>
          <AnimateIn delay={120} className="mt-16">
            <p className="wb-label">Or type it</p>
            <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-gray-600">
              The chat works the same way. Every change is a card you can read before you approve it.
            </p>
            <div className="mt-8">
              <WBAtlasCards />
            </div>
          </AnimateIn>
          <div className="mt-8">
            <Link href="/features/atlas" className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-[#0B57D8] hover:underline">
              More about Atlas
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-gray-600">
              Already use Claude or ChatGPT? Connect it to WorkBench and ask it about your business.{" "}
              <Link href="/help/connect-an-ai-app" className="font-semibold text-[#0B57D8] hover:underline">
                See how
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Built for the trades ── */}
      <section className="bg-[#F6F8FB]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <AnimateIn className="relative max-w-3xl">
            <WBNote arrow="down" delay={0.6} className="absolute -bottom-24 right-[-14rem] hidden xl:flex">
              Point at
              <br />
              your trade
            </WBNote>
            <p className="wb-label">Built for the trades</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Made for companies that send people to a customer&rsquo;s home.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-gray-600">
              Quotes are priced by the job, schedules are built around drive
              time, and invoices are sent from the driveway. If your trade is on
              this list, it fits. Pick yours to see how a day runs.
            </p>
          </AnimateIn>
          <WBTradeCards featured={8} />
        </div>
      </section>

      {/* ── A day on the job ── */}
      <WBDayOnTheJob />

      {/* ── Mobile apps ── */}
      <section className="wb-dark text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <AnimateIn>
            <p className="wb-label wb-label-light">The mobile app</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Take the office into the field.
            </h2>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-blue-100/80">
              The native iPhone and Android apps carry the whole system: schedule, jobs,
              chat, invoices, and Atlas. Techs never need a laptop between the
              truck and the crawl space.
            </p>
            <ul className="mt-9 grid gap-6">
              {[
                {
                  icon: Smartphone,
                  title: "Notifications that matter",
                  body: "New requests, bookings, chat messages, and payments land on the phone the moment they happen.",
                },
                {
                  icon: WifiOff,
                  title: "Works offline",
                  body: "Today's schedule and job details stay viewable with no signal, basements and dead zones included.",
                },
                {
                  icon: CalendarClock,
                  title: "Field work, start to finish",
                  body: "Clock in on the job, add photos and notes, message the office, and send the invoice before leaving the driveway.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white/10">
                    <Icon className="h-[18px] w-[18px] text-[#FF8B33]" strokeWidth={2} />
                  </span>
                  <div>
                    <p className="text-[15.5px] font-bold text-white">{title}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-blue-100/75">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-9 flex items-end gap-2 text-[14px] font-bold text-white/90" aria-hidden>
              Free to download on both
              <WBScribble variant="swoop" tone="chalk" delay={0.4} className="-mb-3 h-[40px] w-[76px] rotate-[28deg]" />
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener"
                aria-label="Download WorkBench on the App Store"
                className="inline-block transition-opacity hover:opacity-80"
              >
                <Image
                  src="/app-store-badge.svg"
                  alt="Download on the App Store"
                  width={120}
                  height={40}
                  unoptimized
                  className="h-[44px] w-auto"
                />
              </a>
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener"
                aria-label="Get WorkBench on Google Play"
                className="inline-block transition-opacity hover:opacity-80"
              >
                <Image
                  src="/google-play-badge.svg"
                  alt="Get it on Google Play"
                  width={180}
                  height={53}
                  unoptimized
                  className="h-[44px] w-auto"
                />
              </a>
            </div>
          </AnimateIn>
          <AnimateIn delay={150}>
            <WBPhoneShowcase tone="dark" />
          </AnimateIn>
        </div>
      </section>

      {/* ── Testimonials (drafts: preview only until the customers approve) ── */}
      <WBTestimonials />

      {/* ── Works with: one sliding row; add to INTEGRATIONS in WBIntegrations ── */}
      <section className="border-t border-gray-200 bg-white py-20 sm:py-24">
        <AnimateIn className="relative mx-auto max-w-6xl px-5 sm:px-8">
          <p className="wb-label">Works with</p>
          <h2 className="mt-4 max-w-2xl text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
            Plugs into what you already use. <span className="text-gray-400">More on the way.</span>
          </h2>
          <WBNote arrow="down" delay={0.6} className="absolute bottom-[-4.5rem] right-10 hidden lg:flex">
            Keeps
            <br />
            growing
          </WBNote>
        </AnimateIn>
        <div className="mt-12">
          <WBIntegrations />
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <AnimateIn>
            <p className="wb-label">Pricing</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Free to start.{" "}
              <span className="text-gray-400">We earn when the job gets paid.</span>
            </h2>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-gray-600">
              The core software is free for {INCLUDED_SEATS} users, with full
              access and no trial clock. Three optional add-ons cover a business
              phone line, unlimited users with the ops tools, and job photos.
              The rest is funded by built-in payment processing at one flat rate, about what
              you pay for card payments anywhere, without a subscription underneath it.
            </p>
            <ul className="mt-7 grid gap-3">
              {[
                `Full access on ${FREE_PLAN_NAME}, not a trial`,
                `Add-ons priced flat per company, from ${formatCents(PLANS.DISPATCH.monthlyCents)} a month`,
                "Card fees you'd pay any processor; the software on top is free",
                "Cash and check invoices stay free too",
                "No contracts. Your data exports any time",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3 text-[15px] text-gray-800">
                  <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-blue-50">
                    <Check className="h-3 w-3 text-[#0B57D8]" strokeWidth={3} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/pricing" className="wb-pill wb-pill-outline">
                How the pricing works
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
              <Link href="/pricing#savings" className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-[#0B57D8] hover:underline">
                See what you keep vs. Jobber and Housecall Pro
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
            </div>
          </AnimateIn>
          <AnimateIn delay={120} className="relative">
            <div className="absolute -top-14 right-2 hidden items-end gap-1 lg:flex" aria-hidden>
              <p className="pb-2 text-right text-[14.5px] font-extrabold leading-snug text-[#10244A]">
                The whole bill.
                <br />
                Nothing hidden.
              </p>
              <WBScribble variant="loop" delay={0.4} className="h-[58px] w-[90px] rotate-[62deg]" />
            </div>
            <div className="rounded-[1.5rem] bg-[#F6F8FB] p-4 sm:p-5">
              <div className="wb-frag overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                  <p className="text-[15px] font-bold text-gray-900">What WorkBench costs</p>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[12px] font-bold text-[#0B57D8]">The {FREE_PLAN_NAME} plan</span>
                </div>
                <dl>
                  {rateRows.map((r) => (
                    <div key={r.label} className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 last:border-b-0">
                      <dt className="text-[14px] text-gray-600">{r.label}</dt>
                      <dd className="text-[14.5px] font-bold tabular-nums text-gray-900">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <p className="px-2 pb-1 pt-4 text-[13px] leading-relaxed text-gray-500">
                No monthly fee on {FREE_PLAN_NAME}, no minimums, no charge on failed payments.{" "}
                {PLANS.DISPATCH.name}, {PLANS.SHOP.name}, and {PLANS.JOBSITE.name} are
                optional add-ons and cancel any time.
              </p>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── WorkBench in action: short silent clips (list in lib/wb-videos.ts) ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <AnimateIn className="mx-auto max-w-3xl text-center">
            <p className="wb-label justify-center">WorkBench in action</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Watch it work.{" "}
              <span className="text-gray-400">Short clips, no sound needed.</span>
            </h2>
          </AnimateIn>
          <div className="mt-14">
            <WBInAction />
          </div>
          <p className="mt-12 text-center text-[14.5px] text-gray-600">
            That&apos;s just a few of the things WorkBench can do.{" "}
            <Link href="/contact" className="font-bold text-[#0B57D8] hover:underline">
              Contact us to learn more
            </Link>
          </p>
        </div>
      </section>

      <WBFaqSection items={faqItems} title="Questions, answered" />

      <WBCta />
    </>
  );
}
