import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import WBFaq from "@/components/wb/WBFaq";
import WBPhoneShowcase from "@/components/wb/WBPhoneShowcase";
import WBShowcase from "@/components/wb/WBShowcase";
import {
  ArrowRight,
  Bug,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Compass,
  CreditCard,
  Droplets,
  Fan,
  FileText,
  Hammer,
  Home,
  Leaf,
  PenLine,
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
  title: "WorkBench — Field service management, free to run",
  description:
    "WorkBench runs the whole day for home-service teams: scheduling, quotes, invoices, online booking, client hub, team chat, an AI assistant, and built-in payments. Free to use. Now on the App Store.",
};

const APP_STORE_URL = "https://apps.apple.com/app/workbench-fsm/id6789991103";

const moreFeatures = [
  { label: "Time tracking", href: "/features#run" },
  { label: "Team map", href: "/features#run" },
  { label: "Lead pipeline", href: "/features#win" },
  { label: "Recurring plans", href: "/features#paid" },
  { label: "Team chat", href: "/features#run" },
  { label: "Review requests", href: "/features#clients" },
  { label: "Atlas AI", href: "/features#atlas" },
  { label: "iPhone app", href: "/features#mobile" },
];

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

const atlasExamples = [
  "“Send the Hendersons their quote”",
  "“Reschedule Tuesday’s jobs to Friday”",
  "“Who still owes me money?”",
];

const faqItems = [
  {
    q: "Is WorkBench really free?",
    a: (
      <p>
        Yes — every essential feature, for unlimited users, with no trial
        clock and no credit card required. The software is funded by built-in
        payment processing: when a client pays an invoice through WorkBench,
        a small slice of the flat processing fee is what keeps the lights on.
        The full breakdown is on the{" "}
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
        One flat rate: 2.9% + 30¢ per successful card transaction and 0.75%
        per ACH bank transfer. There are no monthly fees, no minimums, and no
        charge on failed payments.
      </p>
    ),
  },
  {
    q: "Do I have to take card payments through WorkBench?",
    a: (
      <p>
        No. Cash and check payments can be recorded on any invoice, and the
        software stays free either way. Card and ACH are simply built in for
        when you want them — on invoices, quotes with deposits, and online
        bookings.
      </p>
    ),
  },
  {
    q: "How does getting started work?",
    a: (
      <p>
        Because WorkBench moves real money, every company on it is verified.
        Tell us about your business and your account opens on the spot; a
        short payment-verification form (the same KYC check every payments
        provider runs) switches payments on, and a person reviews every
        application within a business day — most companies are quoting and
        scheduling the same day they sign up.
      </p>
    ),
  },
  {
    q: "Is there a mobile app?",
    a: (
      <p>
        Yes — a native iPhone app on the{" "}
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener"
          className="font-semibold text-[#0B57D8] hover:underline"
        >
          App Store
        </a>
        , with push notifications for requests, bookings, chat, and payments,
        plus offline viewing of the schedule when a job site has no signal.
        The web app works on any device.
      </p>
    ),
  },
  {
    q: "Can I get my data out?",
    a: (
      <p>
        Any time. There are no contracts, and your clients, jobs, quotes, and
        invoices export whenever you want them — WorkBench earns its place on
        your bench every day or not at all.
      </p>
    ),
  },
];

export default function WBHomePage() {
  return (
    <>
      {/* ── Hero — deep navy, workflow card cluster ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0B2250] via-[#0A1B3D] to-[#0A1428]">
        <div className="wb-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div
          className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-[#0B57D8]/25 blur-3xl"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.12fr_0.88fr] lg:items-center">
          <AnimateIn>
            <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.08] text-white sm:text-[3.4rem]">
              Field service software that&apos;s{" "}
              <span className="text-[#FF8B33]">actually free</span>.
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-blue-100/85">
              WorkBench runs the day for home-service companies — online
              booking, scheduling and dispatch, quotes, invoices, team chat,
              a client portal, and built-in card &amp; ACH payments. No
              per-seat pricing, no feature tiers, no trial clock.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/apply"
                className="wb-btn-tool inline-flex items-center gap-2 rounded-lg bg-[#F86A0A] px-6 py-3 text-[15px] font-bold text-white"
              >
                Get started
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 rounded-lg border-2 border-white/25 px-6 py-3 text-[15px] font-bold text-white transition-colors hover:border-white/60"
              >
                Explore the features
              </Link>
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
                  className="h-[46px] w-auto"
                />
              </a>
            </div>
            <p className="mt-5 text-[13px] font-semibold text-blue-200/60">
              Invite-only while we onboard companies personally.
            </p>
          </AnimateIn>

          {/* The day drawn as a workflow: booking → scheduled → paid, connected
              by a marching blueprint path. Only the Atlas chip floats. */}
          <AnimateIn delay={150} className="relative hidden min-h-[400px] lg:block">
            {/* blueprint registration marks */}
            <span className="pointer-events-none absolute -left-6 top-0 select-none text-2xl font-light text-blue-400/40" aria-hidden>+</span>
            <span className="pointer-events-none absolute right-0 top-24 select-none text-xl font-light text-orange-400/40" aria-hidden>+</span>
            <span className="pointer-events-none absolute -bottom-2 left-2 select-none text-2xl font-light text-blue-400/40" aria-hidden>+</span>

            {/* connector path behind the cards */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 460 400"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path
                d="M 150 68 C 300 78, 360 110, 330 172 C 305 224, 200 218, 172 268"
                fill="none"
                stroke="#3B6FD9"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="7 9"
                className="wb-dash"
              />
              <circle cx="150" cy="68" r="4" fill="#5B8DEF" />
              <circle cx="330" cy="172" r="4" fill="#F86A0A" />
              <circle cx="172" cy="268" r="4" fill="#5B8DEF" />
            </svg>

            <div className="absolute left-0 top-0 w-64 -rotate-1 rounded-2xl bg-white p-4 shadow-2xl">
              <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#0B57D8] text-[11px] font-bold text-white ring-2 ring-white">1</span>
              <div className="flex items-center gap-3">
                <Image
                  src="/workbench-icon.png"
                  alt=""
                  width={339}
                  height={296}
                  className="h-9 w-auto"
                />
                <div>
                  <p className="text-[14px] font-bold text-gray-900">New booking confirmed</p>
                  <p className="text-[12.5px] text-gray-500">Gutter cleaning · Sat 9:00 AM</p>
                </div>
              </div>
            </div>

            <div className="absolute right-0 top-[136px] w-60 rotate-1 rounded-2xl bg-white p-4 shadow-2xl">
              <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#F86A0A] text-[11px] font-bold text-white ring-2 ring-white">2</span>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
                  <CalendarClock className="h-5 w-5 text-[#F86A0A]" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-gray-900">Tue · 2:00 PM</p>
                  <p className="text-[12.5px] text-gray-500">AC repair — Ravenwood Dr</p>
                </div>
              </div>
            </div>

            <div className="absolute left-6 top-[268px] w-64 -rotate-1 rounded-2xl bg-white p-4 shadow-2xl">
              <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#0B57D8] text-[11px] font-bold text-white ring-2 ring-white">3</span>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <CheckCircle2 className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-gray-900">Invoice #2481</p>
                  <p className="text-[12.5px] text-gray-500">
                    $1,240.00 · <span className="font-semibold text-[#0B57D8]">Paid</span>
                  </p>
                </div>
              </div>
            </div>

            <div
              className="wb-float absolute -bottom-1 right-4 w-fit rounded-full bg-white px-4 py-2.5 shadow-xl"
              style={{ "--wb-tilt": "-2deg" } as React.CSSProperties}
            >
              <p className="flex items-center gap-2 text-[13px] font-semibold text-gray-700">
                <Compass className="h-4 w-4 text-[#0B57D8]" strokeWidth={2} />
                “Atlas, send Friday&apos;s invoices”
              </p>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Trades ticker ── */}
      <section className="bg-white py-8">
        <p className="text-center text-[11.5px] font-bold uppercase tracking-[0.16em] text-gray-400">
          Built for every trade
        </p>
        <div className="wb-marquee mt-5">
          <div className="wb-marquee-track">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex items-center gap-3 pr-3" aria-hidden={dup === 1}>
                {trades.map(({ icon: Icon, label }, i) => (
                  <span
                    key={label}
                    className="flex items-center gap-2.5 whitespace-nowrap rounded-full bg-white py-2 pl-2.5 pr-4 ring-1 ring-inset ring-gray-200"
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full ${i % 2 ? "bg-orange-50" : "bg-blue-50"}`}>
                      <Icon className={`h-3.5 w-3.5 ${i % 2 ? "text-[#F86A0A]" : "text-[#0B57D8]"}`} strokeWidth={2.2} />
                    </span>
                    <span className="text-[13.5px] font-bold text-gray-700">{label}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product showcase ── */}
      <section className="border-b border-gray-200 bg-white pb-20 pt-10 sm:pb-24">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <AnimateIn>
            <h2 className="mx-auto max-w-2xl text-center text-3xl font-extrabold leading-tight sm:text-4xl">
              A look inside
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-[15.5px] leading-relaxed text-gray-600">
              Real screens from the app your team will live in — from the
              morning dashboard to the paid invoice.
            </p>
          </AnimateIn>
          <AnimateIn delay={130} className="mt-10">
            <WBShowcase />
          </AnimateIn>
        </div>
      </section>

      {/* ── Feature bento grid ── */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <AnimateIn>
          <h2 className="mx-auto max-w-2xl text-center text-3xl font-extrabold leading-tight sm:text-4xl">
            Everything a service company{" "}
            <span className="text-[#0B57D8]">runs on</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-[15.5px] leading-relaxed text-gray-600">
            From the first booking request to the paid invoice — every step
            lives in one system, and every piece below is in the free plan.
          </p>
        </AnimateIn>

        <div className="mt-12 grid gap-5 lg:grid-cols-5">
          {/* Quotes — cream */}
          <AnimateIn className="lg:col-span-2">
            <Link
              href="/features#win"
              className="card-lift group flex h-full flex-col justify-between rounded-3xl border border-[#F0E7D8] bg-[#FBF7EF] p-7"
            >
              <div>
                <h3 className="text-xl font-extrabold text-gray-900">Quotes that close</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-gray-600">
                  Optional line items, discounts, deposits, and e-signature —
                  approved from the client&apos;s phone in a tap, with
                  automatic follow-ups if they sit on it.
                </p>
              </div>
              <div className="mt-6">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-bold text-gray-900">Quote #Q-1042</span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11.5px] font-bold text-[#0B57D8]">
                      Signed ✓
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 text-[12.5px] text-gray-500">
                    <div className="flex justify-between"><span>Water heater install</span><span>$1,850</span></div>
                    <div className="flex justify-between"><span>Haul away old unit</span><span>$120</span></div>
                    <div className="flex justify-between border-t border-gray-100 pt-2 font-bold text-gray-900"><span>Deposit due</span><span>$500</span></div>
                  </div>
                </div>
                <span className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-bold text-[#0B57D8]">
                  Learn more
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                </span>
              </div>
            </Link>
          </AnimateIn>

          {/* Invoicing & payments — brand blue */}
          <AnimateIn delay={100} className="lg:col-span-3">
            <Link
              href="/features#paid"
              className="card-lift group flex h-full flex-col justify-between rounded-3xl bg-gradient-to-br from-[#0B57D8] to-[#0847AE] p-7 text-white"
            >
              <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-sm">
                  <h3 className="text-xl font-extrabold">Invoicing &amp; payments</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-blue-100/90">
                    One-click invoices with card and ACH built in at one flat
                    rate. Deposits, partial payments, saved cards with
                    autopay, and reminders that chase the money so you
                    don&apos;t have to.
                  </p>
                </div>
                <div className="w-full max-w-[240px] flex-none rounded-2xl bg-white p-4 text-gray-900 shadow-lg">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-bold">Invoice #2481</span>
                    <span className="font-bold text-[#0B57D8]">Paid</span>
                  </div>
                  <p className="mt-1 text-[20px] font-extrabold">$1,240.00</p>
                  <div className="mt-3 flex items-center gap-1.5">
                    {["Visa", "MC", "Amex", "ACH"].map((m) => (
                      <span key={m} className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-500">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <p className="text-[13px] font-semibold text-blue-100/80">
                  2.9% + 30¢ per card transaction · 0.75% ACH · no monthly fees
                </p>
                <span className="inline-flex items-center gap-1.5 text-[14px] font-bold">
                  Learn more
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                </span>
              </div>
            </Link>
          </AnimateIn>

          {/* Scheduling — white */}
          <AnimateIn className="lg:col-span-2">
            <Link
              href="/features#run"
              className="card-lift group flex h-full flex-col justify-between rounded-3xl border border-gray-200 bg-white p-7"
            >
              <div>
                <h3 className="text-xl font-extrabold text-gray-900">Scheduling &amp; dispatch</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-gray-600">
                  Month, week, and day views with drag-to-schedule, time
                  blocks, recurring visit series, and per-tech filtering.
                </p>
              </div>
              <div className="mt-6">
                <div className="grid grid-cols-5 gap-1.5">
                  {["M", "T", "W", "T", "F"].map((d, i) => (
                    <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-1.5 text-center">
                      <p className="text-[10px] font-bold text-gray-400">{d}</p>
                      <div className={`mt-1 h-1.5 rounded-full ${i === 1 || i === 3 ? "bg-[#F86A0A]/70" : "bg-[#0B57D8]/60"}`} />
                      {i !== 4 && <div className="mt-1 h-1.5 rounded-full bg-[#0B57D8]/30" />}
                    </div>
                  ))}
                </div>
                <span className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-bold text-[#0B57D8]">
                  Learn more
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                </span>
              </div>
            </Link>
          </AnimateIn>

          {/* Client hub — navy */}
          <AnimateIn delay={100} className="lg:col-span-2">
            <Link
              href="/features#clients"
              className="card-lift group flex h-full flex-col justify-between rounded-3xl bg-[#0A1428] p-7 text-white"
            >
              <div>
                <h3 className="text-xl font-extrabold">Client hub &amp; messaging</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-gray-300">
                  A magic-link portal where clients see visits, sign
                  agreements, message your team, and pay — no account or
                  password required. Confirmations, reminders, and receipts
                  go out automatically, from your business.
                </p>
              </div>
              <span className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-bold text-[#FF8B33]">
                Learn more
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
              </span>
            </Link>
          </AnimateIn>

          {/* More features — orange */}
          <AnimateIn delay={200} className="lg:col-span-1">
            <div className="card-lift flex h-full flex-col rounded-3xl bg-gradient-to-br from-[#F86A0A] to-[#E05500] p-7 text-white">
              <h3 className="text-xl font-extrabold">More features</h3>
              <ul className="mt-4 space-y-2.5">
                {moreFeatures.map(({ label, href }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="group/mf inline-flex items-center gap-1 text-[13.5px] font-bold text-orange-50 hover:text-white"
                    >
                      {label}
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover/mf:translate-x-0.5" strokeWidth={2.5} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Atlas callout ── */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <AnimateIn>
          <div className="relative overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50/70 via-white to-white">
            <div className="wb-grid-paper pointer-events-none absolute inset-0 [mask-image:none]" aria-hidden />
            <div className="relative flex flex-col gap-8 px-6 py-10 sm:px-10 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-lg">
                <div className="flex items-center gap-3">
                  <Compass className="h-6 w-6 text-[#0B57D8]" strokeWidth={1.9} />
                  <h3 className="text-2xl font-extrabold">Or just ask Atlas.</h3>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
                  Every WorkBench account comes with Atlas, an AI assistant
                  that works the same tools your team does — with the same
                  permissions and a confirmation before anything goes out the
                  door.
                </p>
              </div>
              <ul className="flex flex-col gap-3">
                {atlasExamples.map((line) => (
                  <li
                    key={line}
                    className="w-fit rounded-full border border-gray-200 bg-white px-4 py-2 text-[13.5px] text-gray-700 shadow-sm"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </AnimateIn>
      </section>

      {/* ── iPhone app ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-16">
          <AnimateIn>
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#F86A0A]">
              WorkBench on iPhone
            </p>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">
              The field runs from a pocket.
            </h2>
            <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-gray-600">
              The native iPhone app carries the whole system — schedule,
              jobs, chat, invoices, Atlas — so techs never need a laptop
              between the truck and the crawl space.
            </p>
            <ul className="mt-8 grid gap-5">
              {[
                {
                  icon: Smartphone,
                  title: "Push that matters",
                  body: "New requests, bookings, chat messages, and payments land on the phone the moment they happen.",
                },
                {
                  icon: WifiOff,
                  title: "Works offline",
                  body: "Today's schedule and job details stay viewable with no signal — basements and dead zones included.",
                },
                {
                  icon: CalendarClock,
                  title: "Field work, start to finish",
                  body: "Clock in on the job, add photos and notes, message the office, and send the invoice before leaving the driveway.",
                },
              ].map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="flex gap-4">
                  <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${i === 1 ? "bg-blue-50" : "bg-orange-50"}`}>
                    <Icon className={`h-[18px] w-[18px] ${i === 1 ? "text-[#0B57D8]" : "text-[#F86A0A]"}`} strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-gray-900">{title}</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-gray-500">{body}</p>
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
                className="h-[46px] w-auto"
              />
            </a>
          </AnimateIn>
          <AnimateIn delay={150}>
            <WBPhoneShowcase />
          </AnimateIn>
        </div>
      </section>

      {/* ── Pricing teaser ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-20">
          <AnimateIn>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
              Free. <span className="text-[#0B57D8]">Yes, actually.</span>
            </h2>
            <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-gray-600">
              WorkBench doesn&apos;t charge per seat, per month, or per
              feature. The software earns the same way you do — when a job
              gets paid — through built-in payment processing at one flat
              rate. Every essential feature is free, for your whole team,
              forever.
            </p>
            <Link
              href="/pricing"
              className="mt-7 inline-flex items-center gap-2 rounded-lg border-2 border-gray-300 bg-white px-6 py-3 text-[15px] font-bold text-gray-900 transition-colors hover:border-gray-900"
            >
              How the pricing works
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </AnimateIn>
          <AnimateIn delay={130}>
            <ul className="grid content-center gap-4">
              {[
                { icon: Users, line: "Unlimited team members, all roles included" },
                { icon: FileText, line: "Every essential feature on, no tiers to climb" },
                { icon: CreditCard, line: "Card & ACH at 2.9% + 30¢ per transaction" },
                { icon: PenLine, line: "No contracts — your data exports any time" },
              ].map(({ icon: Icon, line }, i) => (
                <li key={line} className="flex items-center gap-3.5">
                  <div className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${i % 2 ? "bg-orange-50" : "bg-blue-50"}`}>
                    <Icon className={`h-4 w-4 ${i % 2 ? "text-[#F86A0A]" : "text-[#0B57D8]"}`} strokeWidth={2} />
                  </div>
                  <span className="text-[15px] text-gray-700">{line}</span>
                </li>
              ))}
            </ul>
          </AnimateIn>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="mx-auto max-w-3xl px-5 py-20 sm:px-8 sm:py-24">
        <AnimateIn>
          <h2 className="text-center text-3xl font-extrabold leading-tight sm:text-4xl">
            Frequently asked questions
          </h2>
        </AnimateIn>
        <AnimateIn delay={120} className="mt-10">
          <WBFaq items={faqItems} />
        </AnimateIn>
      </section>

      {/* ── Apply band ── */}
      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <AnimateIn>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B2250] via-[#0A1B3D] to-[#0A1428] px-6 py-14 text-center sm:px-12">
            <div className="wb-grid-lines pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative">
              <h2 className="mx-auto max-w-xl text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                Your account opens today.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-blue-100/85">
                Tell us about your business, verify payments, and start
                setting up — most companies are quoting and scheduling the
                same day they sign up.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/apply"
                  className="wb-btn-tool inline-flex items-center gap-2 rounded-lg bg-[#F86A0A] px-7 py-3 text-[15px] font-bold text-white"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </Link>
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
                    className="h-[44px] w-auto"
                  />
                </a>
              </div>
            </div>
          </div>
        </AnimateIn>
      </section>
    </>
  );
}
