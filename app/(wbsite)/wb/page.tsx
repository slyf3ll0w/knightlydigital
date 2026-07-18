import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Compass,
  CreditCard,
  FileText,
  Globe,
  KanbanSquare,
  MessageSquare,
  PenLine,
  Smartphone,
  Users,
  Bell,
} from "lucide-react";

export const metadata: Metadata = {
  title: "WorkBench — Field service management, free to run",
  description:
    "WorkBench runs the whole day for home-service teams: scheduling, quotes, invoices, online booking, client hub, team chat, an AI assistant, and built-in payments. Free to use, invite-only.",
};

const groups = [
  {
    num: "01",
    title: "Win the work",
    accent: "text-[#0B57D8]",
    chip: "bg-blue-50 text-[#0B57D8]",
    items: [
      {
        icon: Globe,
        title: "Online booking",
        body: "Clients book from your website against real availability — with an approval loop for jobs that need a look first.",
      },
      {
        icon: KanbanSquare,
        title: "Lead pipeline",
        body: "A board over your contacts with custom stages, auto-advance triggers, and a webhook for your lead sources.",
      },
      {
        icon: FileText,
        title: "Quotes that close",
        body: "Optional items, discounts, deposits, and e-signature — approved from the client's phone in a tap.",
      },
    ],
  },
  {
    num: "02",
    title: "Run the day",
    accent: "text-[#F86A0A]",
    chip: "bg-orange-50 text-[#F86A0A]",
    items: [
      {
        icon: CalendarClock,
        title: "Scheduling & dispatch",
        body: "Month, week, and day views with drag-to-schedule, time blocks, and per-tech filtering.",
      },
      {
        icon: MessageSquare,
        title: "Team chat",
        body: "A company channel, direct messages, and group threads — no more job details lost in texts.",
      },
      {
        icon: Smartphone,
        title: "Works where you work",
        body: "Full mobile experience with push notifications for requests, bookings, chat, and payments.",
      },
      {
        icon: Users,
        title: "Team roles",
        body: "Owner, admin, sales, and tech permissions out of the box — and every seat is free.",
      },
    ],
  },
  {
    num: "03",
    title: "Get paid",
    accent: "text-[#0B57D8]",
    chip: "bg-blue-50 text-[#0B57D8]",
    items: [
      {
        icon: CreditCard,
        title: "Payments built in",
        body: "Card and ACH on every invoice, quote, and booking at one flat rate — deposits and partial payments included.",
      },
      {
        icon: PenLine,
        title: "Client hub & agreements",
        body: "A magic-link portal where clients see visits, sign agreements, and pay — no account or password required.",
      },
      {
        icon: Bell,
        title: "Client notifications",
        body: "Booking confirmations, visit reminders, and payment receipts go out automatically, from your business.",
      },
    ],
  },
];

const atlasExamples = [
  "“Send the Hendersons their quote”",
  "“Reschedule Tuesday’s jobs to Friday”",
  "“Who still owes me money?”",
];

export default function WBHomePage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="wb-grid-paper pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.12fr_0.88fr] lg:items-center">
          <AnimateIn>
            <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.08] sm:text-[3.4rem]">
              The whole day&apos;s work,{" "}
              <span className="text-[#0B57D8]">on one</span>{" "}
              <span className="text-[#F86A0A]">bench</span>.
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-gray-600">
              WorkBench is field service management for home-service teams —
              plumbing, HVAC, electrical, cleaning, lawn care, and every trade
              in between. The request that comes in overnight, the quote that
              goes out at lunch, the crew on site by two, the invoice paid
              before dinner. One system. Every seat free.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/apply"
                className="wb-btn-tool inline-flex items-center gap-2 rounded-lg bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white"
              >
                Apply for access
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-300 bg-white px-6 py-3 text-[15px] font-bold text-gray-900 transition-colors hover:border-gray-900"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-5 text-[13px] font-semibold text-gray-400">
              Invite-only while we onboard companies personally.
            </p>
          </AnimateIn>

          {/* The day drawn as a workflow: booking → scheduled → paid, connected
              by a marching blueprint path. Only the Atlas chip floats. */}
          <AnimateIn delay={150} className="relative hidden min-h-[400px] lg:block">
            {/* blueprint registration marks */}
            <span className="pointer-events-none absolute -left-6 top-0 select-none text-2xl font-light text-blue-200" aria-hidden>+</span>
            <span className="pointer-events-none absolute right-0 top-24 select-none text-xl font-light text-orange-200" aria-hidden>+</span>
            <span className="pointer-events-none absolute -bottom-2 left-2 select-none text-2xl font-light text-blue-200" aria-hidden>+</span>

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
                stroke="#93C5FD"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="7 9"
                className="wb-dash"
              />
              <circle cx="150" cy="68" r="4" fill="#0B57D8" />
              <circle cx="330" cy="172" r="4" fill="#F86A0A" />
              <circle cx="172" cy="268" r="4" fill="#0B57D8" />
            </svg>

            <div className="absolute left-0 top-0 w-64 -rotate-1 rounded-2xl border border-gray-100 bg-white p-4 shadow-xl">
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

            <div className="absolute right-0 top-[136px] w-60 rotate-1 rounded-2xl border border-gray-100 bg-white p-4 shadow-xl">
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

            <div className="absolute left-6 top-[268px] w-64 -rotate-1 rounded-2xl border border-gray-100 bg-white p-4 shadow-xl">
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
              className="wb-float absolute -bottom-1 right-4 w-fit rounded-full border border-gray-200 bg-white px-4 py-2.5 shadow-lg"
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
      <section className="border-y border-gray-200 bg-white py-4">
        <div className="wb-marquee">
          <div className="wb-marquee-track">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex items-center" aria-hidden={dup === 1}>
                {[
                  "Plumbing",
                  "HVAC",
                  "Electrical",
                  "Cleaning",
                  "Lawn care",
                  "Roofing",
                  "Handyman",
                  "Pest control",
                  "Pool service",
                  "Appliance repair",
                  "Garage doors",
                  "Pressure washing",
                ].map((t, i) => (
                  <span key={t} className="flex items-center">
                    <span className="whitespace-nowrap text-[13.5px] font-bold tracking-wide text-gray-500">
                      {t}
                    </span>
                    <span className={`mx-8 h-1.5 w-1.5 rounded-full ${i % 2 ? "bg-[#F86A0A]/50" : "bg-[#0B57D8]/40"}`} />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features, the shape of a day ── */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <AnimateIn>
          <h2 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">
            Everything the day throws at you.
          </h2>
        </AnimateIn>
        <div className="mt-12 grid gap-12 lg:grid-cols-3 lg:gap-10">
          {groups.map((group, gi) => (
            <AnimateIn key={group.title} delay={gi * 110}>
              <div>
                <div className="flex items-baseline gap-3 border-b border-gray-200 pb-4">
                  <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${group.chip}`}>
                    {group.num}
                  </span>
                  <h3 className="text-xl font-extrabold">{group.title}</h3>
                </div>
                <ul className="mt-6 space-y-7">
                  {group.items.map(({ icon: Icon, title, body }) => (
                    <li key={title} className="flex gap-4">
                      <Icon className={`mt-0.5 h-5 w-5 flex-none ${group.accent}`} strokeWidth={1.9} />
                      <div>
                        <p className="text-[15.5px] font-bold text-gray-900">{title}</p>
                        <p className="mt-1 text-[14px] leading-relaxed text-gray-600">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </AnimateIn>
          ))}
        </div>

        {/* Atlas callout */}
        <AnimateIn className="mt-14">
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
                "Unlimited team members, all roles included",
                "Every essential feature on, no tiers to climb",
                "Card & ACH at 2.9% + 30¢ per transaction",
                "No contracts — your data exports any time",
              ].map((line, i) => (
                <li key={line} className="flex items-center gap-3">
                  <span className={`h-2 w-2 flex-none rounded-full ${i % 2 ? "bg-[#F86A0A]" : "bg-[#0B57D8]"}`} />
                  <span className="text-[15px] text-gray-700">{line}</span>
                </li>
              ))}
            </ul>
          </AnimateIn>
        </div>
      </section>

      {/* ── Apply band ── */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0050D4] to-[#003FA5] px-6 py-14 text-center sm:px-12">
            <div className="wb-grid-lines pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative">
              <h2 className="mx-auto max-w-xl text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                We onboard every company personally.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-blue-100/85">
                WorkBench is invite-only. Apply, tell us about your business,
                and we&apos;ll get you set up ourselves — most companies are
                quoting and scheduling the same week.
              </p>
              <Link
                href="/apply"
                className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-7 py-3 text-[15px] font-bold text-[#0B57D8] transition-colors hover:bg-blue-50"
              >
                Apply for access
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
            </div>
          </div>
        </AnimateIn>
      </section>
    </>
  );
}
