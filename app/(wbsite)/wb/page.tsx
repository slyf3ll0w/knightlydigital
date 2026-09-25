import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import WBAtlasCards from "@/components/wb/WBAtlasCards";
import WBCta from "@/components/wb/WBCta";
import WBFaq from "@/components/wb/WBFaq";
import WBHero from "@/components/wb/WBHero";
import WBPhoneShowcase from "@/components/wb/WBPhoneShowcase";
import WBSystemTabs from "@/components/wb/WBSystemTabs";
import { APP_STORE_URL, WB_EMAIL, WB_EMAIL_HREF, WB_PHONE } from "@/lib/wb-site";
import {
  ArrowRight,
  Bug,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Droplets,
  Fan,
  Hammer,
  Home,
  Leaf,
  Mail,
  Phone,
  Plug,
  Smartphone,
  Sparkles,
  SprayCan,
  Warehouse,
  Waves,
  WifiOff,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "WorkBench — Free field service management software",
  description:
    "WorkBench is free scheduling, quoting, invoicing, and payment software for home-service companies. Online booking, dispatch, a client portal, team chat, an AI assistant, and a native iPhone app. Funded by payment processing, not subscriptions.",
};

const trades = [
  { icon: Droplets, label: "Plumbing" },
  { icon: Fan, label: "HVAC" },
  { icon: Zap, label: "Electrical" },
  { icon: Sparkles, label: "Cleaning" },
  { icon: Leaf, label: "Lawn care" },
  { icon: Home, label: "Roofing" },
  { icon: Hammer, label: "Handyman" },
  { icon: Bug, label: "Pest control" },
  { icon: Waves, label: "Pool service" },
  { icon: Plug, label: "Appliance repair" },
  { icon: Warehouse, label: "Garage doors" },
  { icon: SprayCan, label: "Pressure washing" },
];

const rateRows = [
  { label: "The software", value: "Free" },
  { label: "Users", value: "Unlimited" },
  { label: "Monthly fee", value: "$0" },
  { label: "Card payments", value: "2.9% + 30¢" },
  { label: "ACH bank transfers", value: "0.75%" },
  { label: "Atlas tokens", value: "10,000 free a month" },
];

const faqItems = [
  {
    q: "Is WorkBench really free?",
    a: (
      <p>
        Yes. Every essential feature, for unlimited users, with no trial clock
        and no credit card required. The software is funded by built-in payment
        processing: when a client pays an invoice through WorkBench, a small
        slice of the flat processing fee is what keeps the lights on. The full
        breakdown is on the{" "}
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
        One flat rate: 2.9% + 30¢ per successful card transaction and 0.75% per
        ACH bank transfer. There are no monthly fees, no minimums, and no charge
        on failed payments.
      </p>
    ),
  },
  {
    q: "Do I have to take card payments through WorkBench?",
    a: (
      <p>
        No. Cash and check payments can be recorded on any invoice, and the
        software stays free either way. Card and ACH are built in for when you
        want them, on invoices, quotes with deposits, and online bookings.
      </p>
    ),
  },
  {
    q: "How does getting started work?",
    a: (
      <p>
        Because WorkBench moves real money, every company on it is verified.
        Tell us about your business, then complete a short payment-verification
        form (the same KYC check every payments provider runs) and your account
        opens. A person also reviews every application within a business day,
        and most companies are quoting and scheduling the same day they sign
        up. If you would rather talk first, call{" "}
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
        Yes. A native iPhone app on the{" "}
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener"
          className="font-semibold text-[#0B57D8] hover:underline"
        >
          App Store
        </a>
        , with push notifications for requests, bookings, chat, and payments,
        plus offline viewing of the schedule when a job site has no signal. The
        web app works on any device.
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
      {/* ── Hero ── */}
      <WBHero className="bg-white" containerClassName="text-center sm:pb-24">
        <h1 className="mx-auto max-w-4xl text-[2.6rem] font-extrabold leading-[1.04] text-gray-900 sm:text-[3.6rem] lg:text-[4.3rem]">
          Run the whole job
          <br className="hidden sm:block" /> from <span className="text-[#0B57D8]">one place</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600 sm:text-[19px]">
          WorkBench is scheduling, quotes, invoicing, and payments for
          home-service companies. Free for every seat on the team, funded by a
          flat payment rate instead of a subscription.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/apply" className="wb-pill wb-pill-dark">
            Get started
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <a href={WB_PHONE.href} className="wb-pill wb-pill-outline">
            <Phone className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.25} aria-hidden />
            Call {WB_PHONE.display}
          </a>
        </div>
        <p className="mt-5 text-[13.5px] font-semibold text-gray-500">
          No credit card. No trial clock. Unlimited users.
        </p>

        {/* Product screenshot with floating notification cards */}
        <div className="relative mx-auto mt-14 max-w-5xl sm:mt-20">
          <div className="wb-frame overflow-hidden rounded-2xl bg-white">
            <div className="flex items-center gap-2 border-b border-gray-200 bg-[#F6F8FB] px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" aria-hidden />
              <span className="ml-3 hidden flex-1 justify-center sm:flex">
                <span className="rounded-full bg-white px-6 py-1 text-[11.5px] font-semibold text-gray-400 ring-1 ring-inset ring-gray-200">
                  workbenchfsm.com/app
                </span>
              </span>
              <span className="w-[54px]" aria-hidden />
            </div>
            <div className="relative aspect-[1512/791]">
              <Image
                src="/screens/desktop-dashboard.jpg"
                alt="The WorkBench dashboard: money collected and outstanding, the Needs-you list, and today's schedule"
                fill
                priority
                sizes="(min-width: 1152px) 1024px, 100vw"
                className="object-cover"
              />
            </div>
          </div>

          <div
            className="wb-float absolute -left-6 -top-7 hidden items-center gap-3 rounded-2xl bg-white py-3 pl-3 pr-5 text-left lg:flex"
            style={{ "--wb-tilt": "-2deg", animationDelay: "-1.2s" } as React.CSSProperties}
          >
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-green-50">
              <CheckCircle2 className="h-5 w-5 text-green-600" strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-[14px] font-bold text-gray-900">Invoice #2481</span>
              <span className="block text-[12.5px] text-gray-500">
                $1,240.00 · <span className="font-semibold text-green-600">Paid</span>
              </span>
            </span>
          </div>

          <div
            className="wb-float absolute -right-8 top-[22%] hidden items-center gap-3 rounded-2xl bg-white py-3 pl-3 pr-5 text-left lg:flex"
            style={{ "--wb-tilt": "2deg", animationDelay: "-3.4s" } as React.CSSProperties}
          >
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-blue-50">
              <CalendarDays className="h-5 w-5 text-[#0B57D8]" strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-[14px] font-bold text-gray-900">Tue · 2:00 PM</span>
              <span className="block text-[12.5px] text-gray-500">AC repair, Ravenwood Dr</span>
            </span>
          </div>

          <div
            className="wb-float absolute -left-8 bottom-[16%] hidden items-center gap-3 rounded-2xl bg-white py-3 pl-3 pr-5 text-left lg:flex"
            style={{ "--wb-tilt": "1.5deg", animationDelay: "-5.1s" } as React.CSSProperties}
          >
            <Image src="/workbench-icon.png" alt="" width={339} height={296} className="h-10 w-auto flex-none" />
            <span>
              <span className="block text-[14px] font-bold text-gray-900">New booking confirmed</span>
              <span className="block text-[12.5px] text-gray-500">Gutter cleaning · Sat 9:00 AM</span>
            </span>
          </div>
        </div>
      </WBHero>

      {/* ── Three facts ── */}
      <section className="border-y border-gray-200 bg-white">
        <div className="mx-auto grid max-w-6xl divide-y divide-gray-200 px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0">
          {[
            { title: "Free for unlimited users", body: "Every essential feature for the whole team. No tiers, no seats to count." },
            { title: "One flat payment rate", body: "2.9% + 30¢ per card transaction, 0.75% per ACH transfer. Nothing monthly." },
            { title: "A native iPhone app", body: "Push notifications, an offline schedule, and invoices sent from the driveway." },
          ].map((f) => (
            <div key={f.title} className="py-6 md:px-8 md:first:pl-0 md:last:pr-0">
              <p className="text-[15.5px] font-bold text-gray-900">{f.title}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-gray-500">{f.body}</p>
            </div>
          ))}
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
        </div>
      </section>

      {/* ── Atlas ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <AnimateIn className="max-w-3xl">
            <p className="wb-label">Atlas, the built-in assistant</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Ask in plain English. Atlas does the busywork.{" "}
              <span className="text-gray-400">It asks before anything goes out.</span>
            </h2>
          </AnimateIn>
          <AnimateIn delay={120} className="mt-12">
            <WBAtlasCards />
          </AnimateIn>
          <div className="mt-8">
            <Link href="/features/atlas" className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-[#0B57D8] hover:underline">
              More about Atlas
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Built for the trades ── */}
      <section className="bg-[#F6F8FB]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <AnimateIn className="mx-auto max-w-3xl text-center">
            <p className="wb-label justify-center">Built for the trades</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Made for companies that send people to a customer&rsquo;s home.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-gray-600">
              Quotes are priced by the job, schedules are built around drive
              time, and invoices are sent from the driveway. If your trade is on
              this list, it fits.
            </p>
          </AnimateIn>
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {trades.map(({ icon: Icon, label }, i) => (
              <AnimateIn key={label} delay={(i % 4) * 60}>
                <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-4 ring-1 ring-inset ring-gray-200/70 sm:px-5">
                  <Icon className="h-5 w-5 flex-none text-[#0B57D8]" strokeWidth={2} />
                  <span className="text-[15px] font-bold text-gray-900">{label}</span>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── iPhone app ── */}
      <section className="wb-dark text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <AnimateIn>
            <p className="wb-label wb-label-light">The iPhone app</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Take the office into the field.
            </h2>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-blue-100/80">
              The native iPhone app carries the whole system: schedule, jobs,
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
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener"
              aria-label="Download WorkBench on the App Store"
              className="mt-9 inline-block transition-opacity hover:opacity-80"
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
          </AnimateIn>
          <AnimateIn delay={150}>
            <WBPhoneShowcase tone="dark" />
          </AnimateIn>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <AnimateIn>
            <p className="wb-label">Pricing</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Free for your whole team.{" "}
              <span className="text-gray-400">We earn when the job gets paid.</span>
            </h2>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-gray-600">
              WorkBench does not charge per seat, per month, or per feature.
              The software is funded by built-in payment processing at one
              flat rate, so it costs nothing until a client pays you through
              it.
            </p>
            <ul className="mt-7 grid gap-3">
              {[
                "Unlimited team members, all roles included",
                "Every essential feature on, no tiers to climb",
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
            <Link href="/pricing" className="wb-pill wb-pill-outline mt-8">
              How the pricing works
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </AnimateIn>
          <AnimateIn delay={120}>
            <div className="rounded-[1.5rem] bg-[#F6F8FB] p-4 sm:p-5">
              <div className="wb-frag overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                  <p className="text-[15px] font-bold text-gray-900">What WorkBench costs</p>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[12px] font-bold text-[#0B57D8]">One plan</span>
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
                No monthly fees, no minimums, no charge on failed payments.
                Atlas Full adds 150,000 tokens a month for $20 when you want it.
              </p>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Who is behind it ── */}
      <section id="contact" className="scroll-mt-24 border-t border-gray-200 bg-[#F6F8FB]">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
          <AnimateIn>
            <p className="wb-label">Who is behind WorkBench</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              A small software company in Allen, Texas.
            </h2>
            <p className="mt-5 text-[16px] leading-relaxed text-gray-600">
              WorkBench is built and supported by Streamflaire. We write the
              software, answer the phone, and review every application
              ourselves. When you call, you reach the people who can actually
              change something.
            </p>
            <p className="mt-4 text-[16px] leading-relaxed text-gray-600">
              Because WorkBench moves real money, every company is verified
              before its account opens. That takes a short form and a business
              day, and most companies are scheduling and quoting the same day
              they are approved.
            </p>
          </AnimateIn>
          <AnimateIn delay={120}>
            <div className="rounded-[1.5rem] border border-gray-200 bg-white p-7 sm:p-8">
              <p className="text-[13.5px] font-bold text-gray-500">Get in touch</p>
              <a href={WB_PHONE.href} className="mt-4 flex items-center gap-3 text-gray-900 hover:text-[#0B57D8]">
                <Phone className="h-5 w-5 flex-none text-[#F86A0A]" strokeWidth={2.25} aria-hidden />
                <span className="text-[24px] font-extrabold" style={{ fontFamily: '"Nunito", sans-serif' }}>
                  {WB_PHONE.display}
                </span>
              </a>
              <a href={WB_EMAIL_HREF} className="mt-3 flex items-center gap-3 text-[15.5px] font-semibold text-gray-800 hover:text-[#0B57D8]">
                <Mail className="h-5 w-5 flex-none text-[#F86A0A]" strokeWidth={2.25} aria-hidden />
                {WB_EMAIL}
              </a>
              <p className="mt-5 text-[14px] leading-relaxed text-gray-600">
                Call with questions about the software, pricing, or your trade.
                If nobody picks up, leave a message and we call you back.
              </p>
              <Link href="/contact" className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-bold text-[#0B57D8] hover:underline">
                Contact page
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8 sm:py-24">
          <AnimateIn className="text-center">
            <p className="wb-label justify-center">Questions</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Frequently asked questions
            </h2>
          </AnimateIn>
          <AnimateIn delay={120} className="mt-10">
            <WBFaq items={faqItems} />
          </AnimateIn>
        </div>
      </section>

      <WBCta />
    </>
  );
}
