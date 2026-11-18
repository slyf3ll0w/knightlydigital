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
import WBBento from "@/components/wb/WBBento";
import WBTradeCards from "@/components/wb/WBTradeCards";
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { APP_STORE_URL, PLAY_STORE_URL, WB_DAY_PHOTOS, WB_PHONE } from "@/lib/wb-site";
import { EXTRA_SEAT_CENTS, FREE_PLAN_NAME, INCLUDED_SEATS, PLANS, formatCents } from "@/lib/plans";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  Check,
  Phone,
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
      {/* ── Hero (Railway-style): one framed panel, a real job photo under a navy
           wash, the promise in white, and the real desktop app rising out of it,
           with what WorkBench works with along the bottom. ── */}
      <section className="bg-white px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="relative overflow-hidden rounded-2xl bg-[#0A1428]">
          <Image src={WB_DAY_PHOTOS.morning.src} alt="" fill priority sizes="100vw" className="object-cover object-[50%_40%]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,20,40,0.86)_0%,rgba(10,20,40,0.74)_38%,rgba(10,20,40,0.92)_70%,#0A1428_100%)]" aria-hidden />

          <div className="relative mx-auto max-w-6xl px-5 pt-16 text-center sm:px-8 sm:pt-24">
            <p className="text-[12.5px] font-extrabold uppercase tracking-[0.14em] text-[#FFB27A]">Field service management software</p>
            <h1 className="mx-auto mt-5 max-w-4xl text-[2.7rem] font-extrabold leading-[1.02] text-white sm:text-[4rem] xl:text-[4.6rem]">
              Run the entire job from one place.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-blue-50/85 sm:text-[19px]">
              Scheduling, quotes, invoicing and payments for home-service companies, plus Atlas, an
              assistant you can talk to hands-free. Free for your first {INCLUDED_SEATS} users.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/apply" className="wb-pill wb-pill-orange">
                Get started free
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
              <Link href="/book-a-call" className="wb-pill wb-pill-ghost">
                <CalendarDays className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                Book a call
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[14px] font-semibold text-blue-50/80">
              {["No credit card", "No trial clock", "A person answers the phone"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-[#FF8B33]" strokeWidth={3} aria-hidden />
                  {t}
                </li>
              ))}
            </ul>

            {/* The real desktop app, rising out of the panel */}
            <div className="relative mx-auto mt-14 max-w-5xl sm:mt-16">
              <div className="overflow-hidden rounded-t-xl border border-b-0 border-white/15 bg-white shadow-[0_-20px_80px_-20px_rgba(46,111,242,0.55)]">
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
                <div className="relative aspect-[1512/600] overflow-hidden">
                  <Image
                    src="/screens/desktop-dashboard.jpg"
                    alt="The WorkBench dashboard: money collected and outstanding, the Needs-you list, and today's schedule"
                    fill
                    priority
                    sizes="(min-width: 1152px) 1024px, 100vw"
                    className="object-cover object-top"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Works with: one ruled row of cells along the panel's foot */}
          <ul className="relative grid grid-cols-2 border-t border-white/10 bg-[#0A1428] sm:grid-cols-3 lg:grid-cols-6" aria-label="Works with">
            {[
              { kind: "img", src: "/brand/quickbooks.svg", label: "QuickBooks Online" },
              { kind: "img", src: "/brand/google-calendar.svg", label: "Google Calendar" },
              { kind: "text", label: "Square payments" },
              { kind: "cards", label: "Visa, Mastercard, Amex, Discover" },
              { kind: "badge", src: "/app-store-badge.svg", href: APP_STORE_URL, label: "Download on the App Store", w: 120, h: 40 },
              { kind: "badge", src: "/google-play-badge.svg", href: PLAY_STORE_URL, label: "Get it on Google Play", w: 180, h: 53 },
            ].map((c) => (
              <li key={c.label} className="flex h-24 items-center justify-center gap-2.5 border-b border-r border-white/10 px-4 text-[14.5px] font-bold text-white/85 lg:border-b-0 lg:last:border-r-0">
                {c.kind === "img" && <Image src={c.src!} alt="" width={22} height={22} unoptimized className="h-[22px] w-[22px]" />}
                {c.kind === "img" || c.kind === "text" ? <span>{c.label}</span> : null}
                {c.kind === "cards" && (
                  <span className="flex items-center gap-1.5" aria-label={c.label}>
                    {["visa", "mastercard", "amex", "discover"].map((b) => (
                      <span key={b} className="flex h-7 w-11 items-center justify-center rounded bg-white">
                        <Image src={`/brand/${b}.svg`} alt="" width={30} height={18} unoptimized style={{ width: b === "discover" ? 36 : 26, height: "auto" }} />
                      </span>
                    ))}
                  </span>
                )}
                {c.kind === "badge" && (
                  <a href={c.href} target="_blank" rel="noopener" aria-label={c.label} className="opacity-90 transition-opacity hover:opacity-100">
                    <Image src={c.src!} alt={c.label} width={c.w!} height={c.h!} unoptimized className="h-[38px] w-auto" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Contact strip (contractor-site style): three facts, orange icons ── */}
      <section className="bg-white px-2 sm:px-3">
        <div className="mx-auto mt-2 grid max-w-none gap-px overflow-hidden rounded-2xl bg-[#111827] sm:mt-3 md:grid-cols-3">
          {[
            { icon: BadgeCheck, k: `Free for ${INCLUDED_SEATS} users`, v: `${FREE_PLAN_NAME} plan, full access`, href: FREE_PAGE_PATH },
            { icon: Phone, k: "Call us", v: WB_PHONE.display, href: WB_PHONE.href },
            { icon: CalendarDays, k: "Free setup call", v: "Book a time", href: "/book-a-call" },
          ].map(({ icon: Icon, k, v, href }) => (
            <a key={k} href={href} className="group flex items-center justify-center gap-4 bg-[#111827] px-6 py-6 transition-colors hover:bg-[#172036]">
              <Icon className="h-8 w-8 flex-none text-[#F86A0A]" strokeWidth={2} aria-hidden />
              <span className="text-left">
                <span className="block text-[14px] text-white/70">{k}</span>
                <span className="block text-[18px] font-extrabold text-white">{v}</span>
              </span>
            </a>
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

      {/* ── What WorkBench does: the bento of real screens ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <AnimateIn className="max-w-3xl">
            <h2 className="text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              One system from the first call to the paid invoice.{" "}
              <span className="text-gray-400">Nothing to bolt on, nothing to stitch together.</span>
            </h2>
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
