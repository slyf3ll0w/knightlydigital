import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import WBPhoneShowcase from "@/components/wb/WBPhoneShowcase";
import { APP_STORE_URL, sections } from "@/lib/wb-features";
import {
  ArrowRight,
  Clock4,
  Compass,
  Smartphone,
  WifiOff,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features — WorkBench",
  description:
    "Everything in WorkBench, end to end: online booking, lead pipeline, quotes with e-signature, scheduling and dispatch, time tracking, team chat, invoicing, card & ACH payments, recurring billing, and a client hub — all free. Plus Atlas, an AI assistant with free trial tokens.",
};

// Section id → deep-dive pages worth a link once the reader has seen the
// section's full item grid.
const deepLinks: Record<string, { label: string; href: string }[]> = {
  win: [{ label: "Quotes & invoicing, in depth →", href: "/features/quotes-and-invoicing" }],
  run: [
    { label: "Scheduling & dispatch, in depth →", href: "/features/scheduling-dispatch" },
    { label: "Time tracking, in depth →", href: "/features/time-tracking" },
  ],
  paid: [
    { label: "Payments, in depth →", href: "/features/payments" },
    { label: "Quotes & invoicing, in depth →", href: "/features/quotes-and-invoicing" },
  ],
  clients: [{ label: "Client portal, in depth →", href: "/features/client-portal" }],
};

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
              one. Sections 01–04 below are in the free plan, for every seat
              on your team; Atlas, the AI assistant, comes with free trial
              tokens and its own usage-based plan after that.
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
            {deepLinks[section.id] && (
              <div className="mt-10 flex flex-wrap gap-3">
                {deepLinks[section.id].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`rounded-full px-4 py-2 text-[13px] font-bold transition-colors hover:opacity-80 ${section.chip}`}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
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
                  <p className="mt-3 max-w-lg text-[13px] font-semibold text-blue-200/80">
                    Free trial tokens included. Ongoing use is a separate,
                    usage-based plan — not part of the $0 core plan.
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
              <Link
                href="/features/atlas"
                className="relative mt-8 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-white/25"
              >
                Atlas, in depth →
              </Link>
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
