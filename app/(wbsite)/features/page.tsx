import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import WBPhoneShowcase from "@/components/wb/WBPhoneShowcase";
import {
  ArrowRight,
  Banknote,
  BellRing,
  BookOpen,
  CalendarClock,
  CalendarRange,
  Camera,
  ClipboardCheck,
  Clock4,
  Compass,
  CreditCard,
  Eye,
  FileText,
  Globe,
  HandCoins,
  KanbanSquare,
  Keyboard,
  MapPin,
  MessageSquare,
  PenLine,
  RefreshCcw,
  Repeat,
  Smartphone,
  Star,
  Users,
  WifiOff,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features — WorkBench",
  description:
    "Everything in WorkBench, end to end: online booking, lead pipeline, quotes with e-signature, scheduling and dispatch, time tracking, team chat, invoicing, card & ACH payments, recurring billing, a client hub, and the Atlas AI assistant. All of it free.",
};

const APP_STORE_URL = "https://apps.apple.com/app/workbench-fsm/id6789991103";

type FeatureItem = {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
};

type FeatureSection = {
  id: string;
  num: string;
  title: string;
  kicker: string;
  accent: string;
  chip: string;
  items: FeatureItem[];
};

const sections: FeatureSection[] = [
  {
    id: "win",
    num: "01",
    title: "Win the work",
    kicker:
      "From the first website visit to a signed quote — intake that fills the calendar instead of the voicemail box.",
    accent: "text-[#0B57D8]",
    chip: "bg-blue-50 text-[#0B57D8]",
    items: [
      {
        icon: Globe,
        title: "Online booking",
        body: "An embeddable booking widget for your website that shows real availability. Jobs that need a look first go through an approval loop instead of landing straight on the calendar.",
      },
      {
        icon: KanbanSquare,
        title: "Lead pipeline",
        body: "A drag-and-drop board over your contacts with custom stages. Cards advance themselves when a request comes in, an appointment is set, or a quote goes out — and land in Converted when the job is won.",
      },
      {
        icon: ArrowRight,
        title: "Lead webhook",
        body: "A plug-in endpoint for your lead sources — Zapier, Make, Meta lead ads, Google lead forms. New leads drop onto the board the moment they exist.",
      },
      {
        icon: FileText,
        title: "Quotes with e-signature",
        body: "Line items, optional add-ons the client can toggle, discounts, and deposits. Clients review and sign from their phone; accepted quotes convert to jobs in one click.",
      },
      {
        icon: BellRing,
        title: "Quote follow-ups",
        body: "A quote that sits unanswered gets a friendly nudge at 3 and 7 days, automatically. No more spreadsheet of “need to call back.”",
      },
      {
        icon: HandCoins,
        title: "Deposits up front",
        body: "Collect a deposit at quote approval — card or bank transfer — so the job is funded before the truck rolls.",
      },
    ],
  },
  {
    id: "run",
    num: "02",
    title: "Run the day",
    kicker:
      "Dispatch, field work, and the crew — everything between “scheduled” and “done.”",
    accent: "text-[#F86A0A]",
    chip: "bg-orange-50 text-[#F86A0A]",
    items: [
      {
        icon: CalendarClock,
        title: "Scheduling & dispatch",
        body: "Month, week, and day views with drag-to-schedule, time blocks, and per-tech filtering. The calendar is the command center, not a read-only report.",
      },
      {
        icon: CalendarRange,
        title: "Recurring visit series",
        body: "Weekly mows, quarterly filter changes, biweekly cleans — visit schedules generate real jobs weeks ahead that dispatchers can drag, reschedule, or skip one at a time.",
      },
      {
        icon: Camera,
        title: "Jobs with notes & photos",
        body: "Every job carries its history: status, notes, and before/after photos from the field, so the office and the crew see the same thing.",
      },
      {
        icon: Clock4,
        title: "Time tracking & timesheets",
        body: "Techs clock in and out right on the job. Weekly timesheets roll up per person, managers can fix a forgotten clock-out, and logged hours flow into each job's profit margin as real labor cost.",
      },
      {
        icon: MapPin,
        title: "Team map",
        body: "See who's on the clock and where — a live map of clocked-in techs. Location is only ever collected while someone is clocked in, never off hours.",
      },
      {
        icon: MessageSquare,
        title: "Team chat",
        body: "A company channel, direct messages, and group threads with push notifications — job details stop living in six different text conversations.",
      },
      {
        icon: Users,
        title: "Roles & permissions",
        body: "Owner, admin, sales, and tech roles out of the box, each seeing what they need and nothing they don't. Every seat is free.",
      },
      {
        icon: Keyboard,
        title: "Built for speed",
        body: "A command palette and keyboard shortcuts across the whole app — jump anywhere, create anything, without touching the mouse.",
      },
    ],
  },
  {
    id: "paid",
    num: "03",
    title: "Get paid",
    kicker:
      "Invoices go out in one click, money comes back on rails — and the chasing happens automatically.",
    accent: "text-[#0B57D8]",
    chip: "bg-blue-50 text-[#0B57D8]",
    items: [
      {
        icon: CreditCard,
        title: "Card & ACH built in",
        body: "Every invoice, quote, and booking can take card or bank payments at one flat rate — 2.9% + 30¢ per card transaction, 0.75% ACH. No monthly fees, no minimums.",
      },
      {
        icon: ClipboardCheck,
        title: "One-click invoicing",
        body: "Finish a job, send the invoice. Clients pay from a link on their phone; deposits and partial payments are first-class, not a workaround.",
      },
      {
        icon: RefreshCcw,
        title: "Saved cards & autopay",
        body: "Clients keep a card on file, recurring work charges itself, and a declined card retries on a smart schedule with the client nudged to update it — before you ever have to make the awkward call.",
      },
      {
        icon: Repeat,
        title: "Recurring billing, three ways",
        body: "Flat monthly plans, bill-after-each-visit, or per-visit work consolidated into one tidy monthly invoice with a dated line per visit. Pick per client.",
      },
      {
        icon: BellRing,
        title: "Payment reminders",
        body: "Unpaid invoices get escalating reminders — on the due date, then 3, 7, and 14 days after — that stop the moment the money lands.",
      },
      {
        icon: Banknote,
        title: "Payouts & refunds",
        body: "Payouts go straight to your bank on an automatic schedule, and a refund is one button — full or partial — with the records kept clean for your bookkeeper.",
      },
      {
        icon: BookOpen,
        title: "Products & services price book",
        body: "Your services live in one price book with set rates — quotes and invoices pull from it, and a service can be marked recurring to start a plan automatically when it sells.",
      },
      {
        icon: HandCoins,
        title: "Job profitability",
        body: "Each job shows its margin — revenue against materials and real labor cost from the time clock — so you know which work is worth chasing.",
      },
    ],
  },
  {
    id: "clients",
    num: "04",
    title: "Keep clients close",
    kicker:
      "A client experience that looks like a company twice your size — without hiring anyone.",
    accent: "text-[#F86A0A]",
    chip: "bg-orange-50 text-[#F86A0A]",
    items: [
      {
        icon: PenLine,
        title: "Client hub",
        body: "A magic-link portal — no account, no password — where clients see upcoming visits, review invoices, sign agreements, request more work, and pay.",
      },
      {
        icon: MessageSquare,
        title: "Two-way messaging",
        body: "Clients message from the hub, your team answers from one shared inbox with unread counts — so the conversation lives in one place instead of six text threads.",
      },
      {
        icon: BellRing,
        title: "Automatic notifications",
        body: "Booking confirmations, visit reminders the day before and an hour out, payment receipts — all sent from your business, all without anyone remembering to do it.",
      },
      {
        icon: FileText,
        title: "Agreements & contracts",
        body: "Service agreements and contracts with e-signature, stored on the client and visible in their hub.",
      },
      {
        icon: Eye,
        title: "Know when they've looked",
        body: "See when a client opens a quote or document, so you follow up at the right moment instead of guessing.",
      },
      {
        icon: Star,
        title: "Review requests",
        body: "After a payment lands, WorkBench asks the happy client for a review and points them at your Google listing while the goodwill is fresh.",
      },
    ],
  },
];

export default function WBFeaturesPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="wb-grid-paper pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pt-16 sm:px-8 sm:pt-24">
          <AnimateIn>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">
              Every feature. <span className="text-[#0B57D8]">End to end.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600">
              WorkBench covers the whole arc of a job — winning it, running
              it, getting paid for it, and keeping the client for the next
              one. Everything on this page is in the free plan, for every
              seat on your team.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`rounded-full px-4 py-2 text-[13px] font-bold transition-colors hover:opacity-80 ${s.chip}`}
                >
                  {s.num} · {s.title}
                </a>
              ))}
              <a
                href="#atlas"
                className="rounded-full bg-blue-50 px-4 py-2 text-[13px] font-bold text-[#0B57D8] transition-colors hover:opacity-80"
              >
                05 · Atlas AI
              </a>
              <a
                href="#mobile"
                className="rounded-full bg-orange-50 px-4 py-2 text-[13px] font-bold text-[#F86A0A] transition-colors hover:opacity-80"
              >
                06 · Mobile
              </a>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Feature sections ── */}
      {sections.map((section, si) => (
        <section
          key={section.id}
          id={section.id}
          className={`scroll-mt-24 ${si % 2 ? "" : "bg-white"} ${si % 2 ? "" : "border-y border-gray-200"}`}
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <AnimateIn>
              <div className="flex items-baseline gap-3">
                <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${section.chip}`}>
                  {section.num}
                </span>
                <h2 className="text-2xl font-extrabold sm:text-3xl">{section.title}</h2>
              </div>
              <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-gray-600">
                {section.kicker}
              </p>
            </AnimateIn>
            <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map(({ icon: Icon, title, body }, i) => (
                <AnimateIn key={title} delay={(i % 3) * 90}>
                  <div className="flex gap-4">
                    <Icon className={`mt-0.5 h-5 w-5 flex-none ${section.accent}`} strokeWidth={1.9} />
                    <div>
                      <h3 className="text-[15.5px] font-bold text-gray-900">{title}</h3>
                      <p className="mt-1 text-[14px] leading-relaxed text-gray-600">{body}</p>
                    </div>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* ── Atlas ── */}
      <section id="atlas" className="scroll-mt-24">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <AnimateIn>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B57D8] to-[#0847AE] px-6 py-12 text-white sm:px-10">
              <div className="wb-grid-lines pointer-events-none absolute inset-0" aria-hidden />
              <div className="relative grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-bold text-blue-100">
                      05
                    </span>
                    <h2 className="text-2xl font-extrabold sm:text-3xl">Atlas, the AI assistant</h2>
                  </div>
                  <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-blue-100/90">
                    Atlas works the same tools your team does — scheduling,
                    quotes, invoices, messages — with the same permissions,
                    and it confirms with you before anything goes out the
                    door. Ask it to do the busywork in plain English and get
                    your evening back.
                  </p>
                </div>
                <ul className="flex flex-col gap-3">
                  {[
                    "“Send the Hendersons their quote”",
                    "“Reschedule Tuesday's jobs to Friday”",
                    "“Who still owes me money?”",
                    "“Book a follow-up visit for the Elm St job”",
                  ].map((line) => (
                    <li
                      key={line}
                      className="flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-[13.5px] font-semibold text-gray-700 shadow-sm"
                    >
                      <Compass className="h-4 w-4 flex-none text-[#0B57D8]" strokeWidth={2} />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Mobile ── */}
      <section id="mobile" className="scroll-mt-24 border-t border-gray-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-20">
          <AnimateIn>
            <div className="flex items-baseline gap-3">
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11.5px] font-bold text-[#F86A0A]">
                06
              </span>
              <h2 className="text-2xl font-extrabold sm:text-3xl">Works where the work is</h2>
            </div>
            <p className="mt-4 max-w-lg text-[15.5px] leading-relaxed text-gray-600">
              A native iPhone app on the App Store with push notifications
              for requests, bookings, chat, and payments — and the web app
              runs on anything with a browser.
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
                  title: "Offline on the job site",
                  body: "Today's schedule and job details stay viewable with no signal — basements, crawl spaces, and dead zones included.",
                },
                {
                  icon: Clock4,
                  title: "The field runs from a pocket",
                  body: "Clock in, add photos and notes, message the office, and collect payment without ever opening a laptop.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-orange-50">
                    <Icon className="h-[18px] w-[18px] text-[#F86A0A]" strokeWidth={2} />
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
          <AnimateIn delay={130}>
            <WBPhoneShowcase />
          </AnimateIn>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B2250] via-[#0A1B3D] to-[#0A1428] px-6 py-14 text-center sm:px-12">
            <div className="wb-grid-lines pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative">
              <h2 className="mx-auto max-w-xl text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                All of it, free — for your whole team.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-blue-100/85">
                No tiers to climb and no seats to count. Apply, and we&apos;ll
                onboard your company personally.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/apply"
                  className="wb-btn-tool inline-flex items-center gap-2 rounded-lg bg-[#F86A0A] px-7 py-3 text-[15px] font-bold text-white"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-white/25 px-6 py-3 text-[15px] font-bold text-white transition-colors hover:border-white/60"
                >
                  How the pricing works
                </Link>
              </div>
            </div>
          </div>
        </AnimateIn>
      </section>
    </>
  );
}
