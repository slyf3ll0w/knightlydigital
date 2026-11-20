import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import WBSplitHero, { WB_SHOTS } from "@/components/wb/WBSplitHero";
import WBTestimonials from "@/components/wb/WBTestimonials";
import { PLAY_STORE_URL, WB_TRADE_PHOTOS } from "@/lib/wb-site";
import WBScribble from "@/components/wb/WBScribble";
import WBCta from "@/components/wb/WBCta";
import WBPhoneShowcase from "@/components/wb/WBPhoneShowcase";
import { APP_STORE_URL, sections } from "@/lib/wb-features";
import { INCLUDED_SEATS, PLANS } from "@/lib/plans";
import { ATLAS_FREE_TOKENS, ATLAS_PLAN_TOKENS, tokenCount } from "@/lib/atlas-pricing";
import {
  CheckCircle2,
  ArrowRight,
  Clock4,
  Compass,
  Smartphone,
  WifiOff,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features",
  description:
    `Everything in WorkBench FSM, end to end: online booking, lead pipeline, quotes with e-signature, scheduling and dispatch, clock-in, team chat, invoicing, card & ACH payments, recurring billing, and a client hub — free with full access for ${INCLUDED_SEATS} users, not a trial. Plus Atlas, an AI assistant you can talk to hands-free, with ${tokenCount(ATLAS_FREE_TOKENS)} free tokens every month, and optional add-ons for a phone line, unlimited users with the ops tools, and job photos.`,
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
      <WBSplitHero
        photo={WB_TRADE_PHOTOS.electrical}
        phone={WB_SHOTS.jobs}
        chip={{ icon: <CheckCircle2 className="h-[18px] w-[18px] text-[#F86A0A]" strokeWidth={2.2} />, title: "Job #214 complete", sub: "Invoice sent from the driveway" }}
        note={<>Real screens
          <br />
          from the app</>}
      >
        <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">
          Every feature in WorkBench
        </h1>
        <p className="mx-auto mt-6 max-w-2xl lg:mx-0 text-[17px] leading-relaxed text-gray-600">
          WorkBench covers the whole arc of a job: winning it, running it,
          getting paid for it, and keeping the client for the next one.
          Nearly everything below is in Core, the free plan,
          with full access for {INCLUDED_SEATS} users. The few marked Pro come with
          that add-on, alongside the estimator, routes, automations, and
          QuickBooks. Atlas, the AI assistant, gives every account free
          tokens each month, with a larger paid allowance for heavy users.
        </p>
      </WBSplitHero>

      {/* ── Feature sections ── */}
      {sections.map((section, si) => (
        <section
          key={section.id}
          id={section.id}
          className={`scroll-mt-24 ${si % 2 ? "bg-[#F5F7FA]" : "bg-white"}`}
        >
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <AnimateIn>
              <h2 className="text-[2.2rem] leading-[1.05] sm:text-[3.2rem]">{section.title}</h2>
              <p className="mt-4 max-w-2xl text-[18px] leading-relaxed text-gray-600">
                {section.kicker}
              </p>
            </AnimateIn>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map(({ icon: Icon, title, body, plan }, i) => (
                <AnimateIn key={title} delay={(i % 3) * 90} className="h-full">
                  <div className="flex h-full gap-4 rounded-xl bg-white p-6 shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#0A1428]">
                      <Icon className="h-5 w-5 text-[#FF8B33]" strokeWidth={2} />
                    </span>
                    <div>
                      <h3 className="flex flex-wrap items-center gap-2 text-[17px] font-extrabold text-gray-900">
                        {title}
                        {plan && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#0B57D8]">
                            {PLANS[plan].name}
                          </span>
                        )}
                      </h3>
                      <p className="mt-1.5 text-[14.5px] leading-relaxed text-gray-600">{body}</p>
                    </div>
                  </div>
                </AnimateIn>
              ))}
            </div>
            {deepLinks[section.id] && (
              <div className="mt-5 grid gap-x-10 border-t-2 border-[#0A1428] sm:grid-cols-2 lg:grid-cols-3 !mt-10">
                {deepLinks[section.id].map((l) => (
                  <Link key={l.href} href={l.href} className="flex items-center justify-between border-b border-gray-200 py-3.5 text-[15.5px] font-bold text-gray-900 hover:text-[#0B57D8]">
                    {l.label.replace(/s*→s*$/, "")} <span className="text-[#F86A0A]">→</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      ))}

      {/* ── Atlas ── */}
      <section id="atlas" className="scroll-mt-24 border-t border-gray-200 bg-[#F6F8FB]">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <AnimateIn>
            <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
              <div>
                <h2 className="text-[2.2rem] leading-[1.05] sm:text-[3.2rem]">
                  Atlas, <span className="text-[#0B57D8]">the AI assistant.</span>
                </h2>
                <p className="mt-4 max-w-lg text-[15.5px] leading-relaxed text-gray-600">
                  Atlas works the same tools your team does, with the same
                  permissions, and it confirms with you before anything goes
                  out the door. Talk to it hands-free from the truck, or type:
                  either way it does the busywork, and anything that reaches a
                  client is read back to you first.
                </p>
                <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-gray-600">
                  {tokenCount(ATLAS_FREE_TOKENS)} free tokens every month on every account. {PLANS.SHOP.name}
                  includes {tokenCount(ATLAS_PLAN_TOKENS)} a month; it is the one thing with a meter.
                </p>
                <Link
                  href="/features/atlas"
                  className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-bold text-[#0B57D8] hover:underline"
                >
                  Atlas, in depth
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </Link>
              </div>
              <div className="rounded-[1.5rem] border border-gray-200 bg-white p-6">
                <p className="text-[13.5px] font-bold text-gray-500">
                  Things you can ask
                </p>
                <ul className="mt-3 divide-y divide-gray-200">
                  {[
                    "Send the Hendersons their quote.",
                    "Reschedule Tuesday's jobs to Friday.",
                    "Who still owes me money?",
                    "Book a follow-up visit for the Elm Street job.",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-3 py-3 text-[14.5px] text-gray-800">
                      <Compass className="mt-0.5 h-4 w-4 flex-none text-[#0B57D8]" strokeWidth={2} />
                      “{line}”
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
              Native iPhone and Android apps with push notifications for
              requests, bookings, chat, and payments — and the web app runs
              on anything with a browser.
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
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-blue-50">
                    <Icon className="h-[18px] w-[18px] text-[#0B57D8]" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-gray-900">{title}</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-gray-500">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href={APP_STORE_URL} target="_blank" rel="noopener" aria-label="Download WorkBench on the App Store" className="inline-block transition-opacity hover:opacity-80">
                <Image src="/app-store-badge.svg" alt="Download on the App Store" width={120} height={40} unoptimized className="h-[44px] w-auto" />
              </a>
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener" aria-label="Get WorkBench on Google Play" className="inline-block transition-opacity hover:opacity-80">
                <Image src="/google-play-badge.svg" alt="Get it on Google Play" width={180} height={53} unoptimized className="h-[44px] w-auto" />
              </a>
            </div>
          </AnimateIn>
          <AnimateIn delay={130}>
            <WBPhoneShowcase />
          </AnimateIn>
        </div>
      </section>

      <WBTestimonials />

      <WBCta
        title="Free to start. Add more when the crew needs it."
        body={`Full access for ${INCLUDED_SEATS} users, not a trial, and flat-priced add-ons when you want them. Sign up and we onboard your company personally.`}
      />
    </>
  );
}
