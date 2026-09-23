import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import WBCta from "@/components/wb/WBCta";
import WBFaq from "@/components/wb/WBFaq";
import WBPhoneShowcase from "@/components/wb/WBPhoneShowcase";
import WBShowcase from "@/components/wb/WBShowcase";
import { APP_STORE_URL, WB_EMAIL, WB_EMAIL_HREF, WB_PHONE, WB_PHOTOS } from "@/lib/wb-site";
import {
  ArrowRight,
  Bug,
  CalendarClock,
  CalendarRange,
  Check,
  Clock4,
  Compass,
  CreditCard,
  Droplets,
  Fan,
  FileText,
  Globe,
  Hammer,
  Home,
  Leaf,
  Mail,
  MessageSquare,
  Phone,
  Plug,
  Smartphone,
  Sparkles,
  SprayCan,
  Users,
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

const features = [
  {
    icon: Globe,
    title: "Online booking and leads",
    body: "A booking page on your website fills the calendar, and every request lands in a pipeline so nothing waits in voicemail.",
    href: "/features#win",
  },
  {
    icon: FileText,
    title: "Quotes with e-signature",
    body: "Line items, optional add-ons, deposits, and a signature from the client's phone. Automatic follow-ups if they sit on it.",
    href: "/features/quotes-and-invoicing",
  },
  {
    icon: CalendarRange,
    title: "Scheduling and dispatch",
    body: "Month, week, and day views with drag-to-schedule, recurring visits, time blocks, and per-tech filtering.",
    href: "/features/scheduling-dispatch",
  },
  {
    icon: CreditCard,
    title: "Invoicing and payments",
    body: "One-click invoices with card and ACH built in at one flat rate. Deposits, partial payments, autopay, and reminders.",
    href: "/features/payments",
  },
  {
    icon: Users,
    title: "Client portal",
    body: "Clients see visits, sign agreements, message your team, and pay from a link. No account or password needed.",
    href: "/features/client-portal",
  },
  {
    icon: Clock4,
    title: "Time tracking and team chat",
    body: "Clock in on the job, keep timesheets straight for payroll, and talk to the office without a second app.",
    href: "/features/time-tracking",
  },
];

const atlasExamples = [
  "Send the Hendersons their quote.",
  "Reschedule Tuesday's jobs to Friday.",
  "Who still owes me money?",
  "Book a follow-up visit for the Elm Street job.",
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
      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div>
            <p className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-[#F86A0A]">
              Field service management software
            </p>
            <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.1] text-gray-900 sm:text-[2.7rem]">
              Scheduling, quotes, and invoicing for home-service companies. Free to use.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-gray-600">
              WorkBench runs the day for plumbers, electricians, HVAC techs,
              cleaners, and every other trade: online booking, dispatch,
              quotes, invoices, a client portal, team chat, and built-in card
              and ACH payments. No per-seat pricing and no feature tiers.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/apply"
                className="wb-btn inline-flex items-center gap-2 rounded-md bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white"
              >
                Get started
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
              <a
                href={WB_PHONE.href}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-6 py-3 text-[15px] font-bold text-gray-900 transition-colors hover:border-gray-900"
              >
                <Phone className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.25} aria-hidden />
                Call {WB_PHONE.display}
              </a>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener"
                aria-label="Download WorkBench on the App Store"
                className="transition-opacity hover:opacity-80"
              >
                <Image
                  src="/app-store-badge.svg"
                  alt="Download on the App Store"
                  width={120}
                  height={40}
                  unoptimized
                  className="h-10 w-auto"
                />
              </a>
              <p className="text-[13.5px] text-gray-500">
                iPhone app and web app. Unlimited users.
              </p>
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-gray-100 lg:aspect-[4/3]">
            <Image
              src={WB_PHOTOS.hero.src}
              alt={WB_PHOTOS.hero.alt}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 560px"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* ── Three facts ── */}
      <section className="border-b border-gray-200 bg-[#F5F7FA]">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 sm:px-8 md:grid-cols-3 md:gap-10">
          {[
            {
              icon: Users,
              title: "Free for unlimited users",
              body: "Every essential feature, for the whole team, with no trial and no card required.",
            },
            {
              icon: CreditCard,
              title: "One flat payment rate",
              body: "2.9% + 30¢ per card transaction and 0.75% per ACH transfer. No monthly fees.",
            },
            {
              icon: Smartphone,
              title: "Native iPhone app",
              body: "Push notifications, offline schedule, and invoicing from the driveway.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4">
              <div className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-white ring-1 ring-inset ring-gray-200">
                <Icon className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[15.5px] font-bold text-gray-900">{title}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-gray-600">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── What it does ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <AnimateIn className="max-w-2xl">
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
              What WorkBench does
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-gray-600">
              One system from the first booking request to the paid invoice.
              Everything below is included, for every seat on your team.
            </p>
          </AnimateIn>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body, href }, i) => (
              <AnimateIn key={title} delay={(i % 3) * 80}>
                <Link
                  href={href}
                  className="group flex h-full flex-col rounded-md border border-gray-200 bg-white p-6 transition-colors hover:border-[#0B57D8]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-50">
                    <Icon className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
                  </div>
                  <h3 className="mt-5 text-[17px] font-extrabold text-gray-900">{title}</h3>
                  <p className="mt-2 flex-1 text-[14.5px] leading-relaxed text-gray-600">{body}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-bold text-[#0B57D8]">
                    Learn more
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                  </span>
                </Link>
              </AnimateIn>
            ))}
          </div>
          <p className="mt-8 text-[14.5px] text-gray-600">
            Also included: lead pipeline, recurring plans, review requests, a
            team map, contracts, and one-click refunds.{" "}
            <Link href="/features" className="font-bold text-[#0B57D8] hover:underline">
              See every feature
            </Link>
          </p>
        </div>
      </section>

      {/* ── Product screenshots ── */}
      <section className="border-y border-gray-200 bg-[#F5F7FA]">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <AnimateIn>
            <h2 className="text-center text-3xl font-extrabold leading-tight sm:text-4xl">
              A look inside
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-[16px] leading-relaxed text-gray-600">
              Real screens from the software, from the morning dashboard to the
              paid invoice.
            </p>
          </AnimateIn>
          <AnimateIn delay={130} className="mt-10">
            <WBShowcase />
          </AnimateIn>
        </div>
      </section>

      {/* ── Built for the trades ── */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:gap-16">
          <AnimateIn>
            <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-gray-100">
              <Image
                src={WB_PHOTOS.trades.src}
                alt={WB_PHOTOS.trades.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 540px"
                className="object-cover"
              />
            </div>
          </AnimateIn>
          <AnimateIn delay={120}>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
              Built for the trades
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-gray-600">
              WorkBench is made for companies that send people to a customer's
              home. Quotes are priced by the job, schedules are built around
              drive time, and invoices are sent from the driveway. If your
              trade is on this list, it fits.
            </p>
            <ul className="mt-7 grid grid-cols-2 gap-x-6 gap-y-3">
              {trades.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2.5 text-[15px] font-semibold text-gray-800">
                  <Icon className="h-4 w-4 flex-none text-[#0B57D8]" strokeWidth={2.2} />
                  {label}
                </li>
              ))}
            </ul>
          </AnimateIn>
        </div>
      </section>

      {/* ── iPhone app ── */}
      <section className="border-y border-gray-200 bg-[#F5F7FA]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <AnimateIn>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
              Take the office into the field
            </h2>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-gray-600">
              The native iPhone app carries the whole system: schedule, jobs,
              chat, invoices, and Atlas. Techs never need a laptop between the
              truck and the crawl space.
            </p>
            <ul className="mt-8 grid gap-5">
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
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-white ring-1 ring-inset ring-gray-200">
                    <Icon className="h-[18px] w-[18px] text-[#0B57D8]" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-gray-900">{title}</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-gray-600">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener"
              aria-label="Download WorkBench on the App Store"
              className="mt-8 inline-block transition-opacity hover:opacity-80"
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
            <WBPhoneShowcase />
          </AnimateIn>
        </div>
      </section>

      {/* ── Atlas ── */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
          <AnimateIn>
            <div className="flex items-center gap-3">
              <Compass className="h-6 w-6 text-[#0B57D8]" strokeWidth={1.9} />
              <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
                Atlas, the built-in assistant
              </h2>
            </div>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-gray-600">
              Every WorkBench account includes Atlas, an AI assistant that
              works the same tools your team does, with the same permissions
              and a confirmation before anything goes out the door. Ask it to
              do the busywork in plain English.
            </p>
            <p className="mt-3 max-w-lg text-[14.5px] text-gray-600">
              Every account gets 10,000 Atlas tokens free each month. Atlas
              Full adds 150,000 a month for $20.{" "}
              <Link href="/features/atlas" className="font-bold text-[#0B57D8] hover:underline">
                More about Atlas
              </Link>
            </p>
          </AnimateIn>
          <AnimateIn delay={120}>
            <div className="rounded-md border border-gray-200 bg-[#F5F7FA] p-6">
              <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500">
                Things you can ask
              </p>
              <ul className="mt-4 divide-y divide-gray-200">
                {atlasExamples.map((line) => (
                  <li key={line} className="flex items-start gap-3 py-3 text-[15px] text-gray-800">
                    <MessageSquare className="mt-0.5 h-4 w-4 flex-none text-[#0B57D8]" strokeWidth={2} />
                    “{line}”
                  </li>
                ))}
              </ul>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="border-y border-gray-200 bg-[#F5F7FA]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:gap-16">
          <AnimateIn>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
              Free for your whole team. We earn when the job gets paid.
            </h2>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-gray-600">
              WorkBench does not charge per seat, per month, or per feature.
              The software is funded by built-in payment processing at one
              flat rate, so it costs nothing until a client pays you through
              it.
            </p>
            <ul className="mt-7 grid gap-3">
              {[
                "Unlimited team members, all roles included",
                "Every essential feature on, no tiers to climb",
                "Card and ACH at 2.9% + 30¢ per transaction, 0.75% for ACH",
                "No contracts. Your data exports any time",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3 text-[15px] text-gray-800">
                  <Check className="mt-1 h-4 w-4 flex-none text-[#0B57D8]" strokeWidth={3} />
                  {line}
                </li>
              ))}
            </ul>
            <Link
              href="/pricing"
              className="mt-7 inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-6 py-3 text-[15px] font-bold text-gray-900 transition-colors hover:border-gray-900"
            >
              How the pricing works
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </AnimateIn>
          <AnimateIn delay={120}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-gray-100">
              <Image
                src={WB_PHOTOS.paid.src}
                alt={WB_PHOTOS.paid.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 540px"
                className="object-cover"
              />
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── About and contact ── */}
      <section id="contact" className="scroll-mt-24 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <AnimateIn>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
              Who is behind WorkBench
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-gray-600">
              WorkBench is built and supported by Streamflaire, a small software
              company in Allen, Texas. We build the software, answer the phone,
              and review every application ourselves. When you call, you reach
              the people who can actually change something.
            </p>
            <p className="mt-4 text-[16px] leading-relaxed text-gray-600">
              Because WorkBench moves real money, every company is verified
              before its account opens. That takes a short form and a business
              day, and most companies are scheduling and quoting the same day
              they are approved.
            </p>
          </AnimateIn>
          <AnimateIn delay={120}>
            <div className="rounded-md border border-gray-200 bg-[#F5F7FA] p-7">
              <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500">
                Get in touch
              </p>
              <a href={WB_PHONE.href} className="mt-4 flex items-center gap-3 text-gray-900 hover:text-[#0B57D8]">
                <Phone className="h-5 w-5 flex-none text-[#F86A0A]" strokeWidth={2.25} aria-hidden />
                <span className="text-[22px] font-extrabold">{WB_PHONE.display}</span>
              </a>
              <a href={WB_EMAIL_HREF} className="mt-3 flex items-center gap-3 text-[15.5px] font-semibold text-gray-800 hover:text-[#0B57D8]">
                <Mail className="h-5 w-5 flex-none text-[#F86A0A]" strokeWidth={2.25} aria-hidden />
                {WB_EMAIL}
              </a>
              <p className="mt-5 text-[14px] leading-relaxed text-gray-600">
                Call with questions about the software, pricing, or your trade.
                If nobody picks up, leave a message and we call you back.
              </p>
              <Link href="/contact" className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-bold text-[#0B57D8] hover:underline">
                Contact page
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="border-t border-gray-200 bg-[#F5F7FA]">
        <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
          <AnimateIn>
            <h2 className="text-center text-3xl font-extrabold leading-tight sm:text-4xl">
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
