import { RATES, RATES_SENTENCE } from "@/lib/plans";
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
import WBSystemTabs from "@/components/wb/WBSystemTabs";
import WBTradeCards from "@/components/wb/WBTradeCards";
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { APP_STORE_URL, PLAY_STORE_URL, WB_PHONE } from "@/lib/wb-site";
import { EXTRA_SEAT_CENTS, FREE_PLAN_NAME, INCLUDED_SEATS, PLANS, formatCents } from "@/lib/plans";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Check,
  Landmark,
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
      {/* ── Hero: the promise, then the real desktop app on a navy band ── */}
      <section className="relative overflow-hidden">
        <div className="wb-bloom absolute inset-x-0 top-0 h-[78%]" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-[22%] bg-[#0A1428] sm:h-[34%]" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pt-12 sm:px-8 sm:pt-16 lg:pt-20">
          <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-end lg:gap-16">
            <div>
              <p className="wb-label">Field service management software</p>
              <h1 className="mt-4 text-[2.6rem] font-extrabold leading-[1.02] text-gray-900 sm:text-[3.6rem] xl:text-[4.1rem]">
                Run the entire job from <span className="text-[#0B57D8]">one place</span>.
              </h1>
            </div>
            <div className="lg:pb-2">
              <p className="text-[17px] leading-relaxed text-gray-600 sm:text-[18px]">
                Scheduling, quotes, invoicing and payments for home-service
                companies, plus Atlas, an assistant you can talk to hands-free.
                The {FREE_PLAN_NAME} plan is free for your first {INCLUDED_SEATS} users.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/apply" className="wb-pill wb-pill-primary">
                  Get started free
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </Link>
                <Link href="/book-a-call" className="wb-pill wb-pill-outline">
                  <CalendarDays className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.25} aria-hidden />
                  Book a call
                </Link>
              </div>
            </div>
          </div>

          <ul className="mt-9 flex flex-wrap gap-x-7 gap-y-2.5 text-[14.5px] font-semibold text-gray-700">
            {["No credit card", "No trial clock", "iPhone and Android apps", "A person answers the phone"].map((t) => (
              <li key={t} className="inline-flex items-center gap-2">
                <Check className="h-4 w-4 text-[#F86A0A]" strokeWidth={3} aria-hidden />
                {t}
              </li>
            ))}
          </ul>

          {/* The real desktop app, one clean frame, nothing floating on it */}
          <div className="relative mt-12 sm:mt-14">
            <div className="overflow-hidden rounded-t-xl border border-b-0 border-gray-300 bg-white shadow-[0_-6px_60px_-20px_rgba(10,20,40,0.35)] sm:rounded-xl sm:border-b">
              <div className="flex items-center gap-3 border-b border-gray-200 bg-[#F1F3F6] px-4 py-2.5">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                </span>
                <span className="mx-auto hidden rounded-md bg-white px-10 py-1 text-[11.5px] font-semibold text-gray-400 ring-1 ring-inset ring-gray-200 sm:block">
                  workbenchfsm.com/app
                </span>
                <span className="w-[42px]" aria-hidden />
              </div>
              <div className="relative aspect-[1512/791]">
                <Image
                  src="/screens/desktop-dashboard.jpg"
                  alt="The WorkBench dashboard: money collected and outstanding, the Needs-you list, and today's schedule"
                  fill
                  priority
                  sizes="(min-width: 1152px) 1088px, 100vw"
                  className="object-cover object-top"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Three facts, on the navy ── */}
      <section className="bg-[#0A1428] text-white">
        <div className="mx-auto grid max-w-6xl gap-px px-5 pb-14 pt-10 sm:px-8 md:grid-cols-3 md:gap-0">
          {[
            { k: "01", title: `Free for your first ${INCLUDED_SEATS} users`, body: `The ${FREE_PLAN_NAME} plan is full access, not a trial. Extra users are ${formatCents(EXTRA_SEAT_CENTS)} a month each.` },
            { k: "02", title: "Two ways to pay for processing", body: `${RATES.companyPaid.card} per card transaction when you pay the fee, or a service fee your client pays at checkout. Nothing monthly.` },
            { k: "03", title: "iPhone and Android apps", body: "Push notifications, an offline schedule, and invoices sent from the driveway." },
          ].map((f) => (
            <div key={f.title} className="border-t border-white/15 py-6 md:border-l md:border-t-0 md:px-8 md:py-2 md:first:border-l-0 md:first:pl-0">
              <p className="text-[13px] font-extrabold tracking-[0.12em] text-[#FF8B33]">{f.k}</p>
              <p className="mt-2 text-[17px] font-extrabold text-white">{f.title}</p>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-blue-100/75">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The 30-second intro (silent loop; the full cut with music is on YouTube).
           Rendered from ~/workbench-intro (Remotion) — scripts/render.sh writes the web cut. ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-5 pt-20 sm:px-8 sm:pt-28">
          <AnimateIn className="mx-auto max-w-3xl text-center">
            <p className="wb-label justify-center">See it in action</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              WorkBench in 30 seconds.
            </h2>
          </AnimateIn>
          <AnimateIn delay={120} className="mt-10">
            <div className="wb-frame-hero overflow-hidden rounded-2xl bg-[#0A1428]">
              <video
                className="block aspect-video w-full"
                src="/video/workbench-intro.mp4"
                poster="/video/workbench-intro-poster.jpg"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="WorkBench FSM in 30 seconds: a quote approved from a phone, jobs dragged onto the schedule, an invoice paid in the driveway, and Atlas sending payment reminders"
              />
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── One system, four tabs ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <AnimateIn className="mx-auto max-w-3xl text-center">
            <p className="wb-label justify-center">What WorkBench does</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              One system from the first call to the paid invoice.{" "}
              <span className="text-gray-400">Nothing to bolt on.</span>
            </h2>
          </AnimateIn>
          <AnimateIn delay={120} className="mt-10">
            <WBSystemTabs />
          </AnimateIn>
          <p className="mt-8 text-center text-[14.5px] text-gray-600">
            Also included: recurring plans, review requests, a team map, contracts, and one-click refunds.{" "}
            <Link href="/features" className="font-bold text-[#0B57D8] hover:underline">
              See every feature
            </Link>
          </p>
          <div className="mt-10 flex flex-col items-center gap-4">
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-gray-400">Works with</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {[
                { src: "/brand/quickbooks.svg", label: "QuickBooks Online" },
                { src: "/brand/google-calendar.svg", label: "Google Calendar" },
              ].map((i) => (
                <span
                  key={i.label}
                  className="inline-flex items-center gap-2.5 rounded-full bg-white px-4 py-2 text-[14px] font-bold text-gray-900 ring-1 ring-inset ring-gray-200"
                >
                  <Image src={i.src} alt="" width={22} height={22} unoptimized className="h-[22px] w-[22px]" />
                  {i.label}
                </span>
              ))}
            </div>
            <ul
              aria-label="Accepts Visa, Mastercard, American Express, Discover, and ACH bank transfers"
              className="flex flex-wrap items-center justify-center gap-2"
            >
              {[
                { src: "/brand/visa.svg", alt: "Visa", w: 30 },
                { src: "/brand/mastercard.svg", alt: "Mastercard", w: 30 },
                { src: "/brand/amex.svg", alt: "American Express", w: 28 },
                { src: "/brand/discover.svg", alt: "Discover", w: 44 },
              ].map((c) => (
                <li
                  key={c.alt}
                  className="flex h-9 w-14 items-center justify-center rounded-md bg-white ring-1 ring-inset ring-gray-200"
                >
                  <Image src={c.src} alt={c.alt} width={c.w} height={20} unoptimized style={{ width: c.w, height: "auto" }} />
                </li>
              ))}
              <li className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-white px-3 text-[12.5px] font-extrabold tracking-wide text-gray-700 ring-1 ring-inset ring-gray-200">
                <Landmark className="h-4 w-4 text-gray-500" strokeWidth={2.2} aria-hidden />
                ACH
              </li>
            </ul>
          </div>
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
          <AnimateIn className="max-w-3xl">
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
