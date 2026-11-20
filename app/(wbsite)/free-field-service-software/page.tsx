import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, CreditCard, HandCoins, Infinity as InfinityIcon, MessagesSquare, ShieldCheck, Sparkles, Users, Wallet } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBSplitHero from "@/components/wb/WBSplitHero";
import { WBFaqSection } from "@/components/wb/WBFaq";
import WBFaqJsonLd from "@/components/wb/WBFaqJsonLd";
import WBTestimonials from "@/components/wb/WBTestimonials";
import WBCta from "@/components/wb/WBCta";
import WBSavingsExamples from "@/components/wb/WBSavingsExamples";
import WBDoodle from "@/components/wb/WBDoodle";
import WBFreePlanCountdown from "@/components/wb/WBFreePlanCountdown";
import WBScribble from "@/components/wb/WBScribble";
import { BENCHMARK } from "@/lib/wb-savings";
import { WB_SHOTS, WB_TRADE_PHOTOS } from "@/lib/wb-site";
import { freeGroups } from "@/lib/wb-free";
import { ATLAS_FREE_TOKENS, tokenCount } from "@/lib/atlas-pricing";
import {
  EXTRA_SEAT_CENTS,
  FREE_PLAN_NAME,
  FULL_SHOP,
  INCLUDED_SEATS,
  PLANS,
  RATES,
  formatCents,
} from "@/lib/plans";

/**
 * Redesign 2026-11-19 (David: "the free plan page could also look a lot
 * better"): as strong as the home's "Free. Not a trial." section: the big
 * $0 over a hand-drawn Free, what is included printed as $0 tickets, a trial
 * counting down beside a plan with no end (WBFreePlanCountdown), and how we
 * make money on a blue band.
 *
 * /free-field-service-software: the page for "free field service
 * management software" searches. Every number on it is read from
 * lib/plans.ts and lib/atlas-pricing.ts, the same constants the pricing
 * page, the Help Center and llms.txt use, so a price change lands here on
 * the same deploy.
 */

const seats = INCLUDED_SEATS;
const seatPrice = formatCents(EXTRA_SEAT_CENTS);
const freeTokens = tokenCount(ATLAS_FREE_TOKENS);
const addOns = [PLANS.DISPATCH, PLANS.SHOP, PLANS.JOBSITE];
const cheapestAddOn = formatCents(Math.min(...addOns.map((p) => p.monthlyCents)));

export const metadata: Metadata = {
  title: "Free field service management software, not a trial",
  description: `WorkBench FSM's ${FREE_PLAN_NAME} plan is free field service management software for home-service companies: scheduling, online booking, quotes with e-signature, invoicing, card and ACH payments, a client portal, team chat, and Atlas AI. Full access for ${seats} users with no card and no trial clock; extra users are ${seatPrice} a month. Funded by payment processing (${RATES.companyPaid.card} per card payment) and optional flat-priced add-ons.`,
  alternates: { canonical: "https://workbenchfsm.com/free-field-service-software" },
};

const faq: { q: string; a: string }[] = [
  {
    q: "Is the free plan a trial?",
    a: `No. ${FREE_PLAN_NAME} is the full product for ${seats} users, on from the day you sign up, with no clock and no card. Clients, booking, scheduling, quotes, invoices, payments, the client portal, team chat, and Atlas are all in it, and they stay in it.`,
  },
  {
    q: "What's the catch?",
    a: `WorkBench is a payments company as much as a software company. When a client pays you through it, the processing fee (${RATES.companyPaid.card} per card payment and ${RATES.companyPaid.ach} per ACH transfer, or a service fee your client pays at checkout) is what funds the software. The add-ons are how we earn from shops that want more than the core. A shop that records cash and checks by hand and never buys an add-on is still a customer we're happy to have.`,
  },
  {
    q: "Do I have to take card payments to use it?",
    a: "No. Cash and check payments can be recorded on any invoice, and the software stays free. Online payments are there, on invoices, quotes with deposits, and online bookings, when you want them.",
  },
  {
    q: `What happens when I add a ${seats + 1}${seats + 1 === 3 ? "rd" : "th"} person?`,
    a: `Each user past the first ${seats} is ${seatPrice} a month, on the same plan with the same features. ${PLANS.SHOP.name} (${formatCents(PLANS.SHOP.monthlyCents)} a month per company) removes the per-user charge entirely and adds the ops tools a growing crew reaches for.`,
  },
  {
    q: "Which features are held back for a paid plan?",
    a: `None of the essentials. The add-ons are extra tools, not the product with the good parts taken out: ${PLANS.DISPATCH.name} is a business phone line, ${PLANS.SHOP.name} is unlimited users plus the estimator, routes, automations, agreements, the team map, timesheets and QuickBooks, and ${PLANS.JOBSITE.name} will be job photos. Atlas, the AI assistant, is the one metered thing: ${freeTokens} tokens free every month on every account.`,
  },
  {
    q: "Will features I use ever move behind a paywall?",
    a: "No. The features on your plan stay on your plan. If our pricing or packaging ever changes, existing customers are grandfathered in on everything they already use.",
  },
  {
    q: "Can I get my data out?",
    a: "Any time. There are no contracts, and your clients, jobs, quotes, and invoices export whenever you want them.",
  },
];

const facts = [
  {
    icon: InfinityIcon,
    title: "No trial clock",
    body: `${FREE_PLAN_NAME} is on from the day you sign up and never expires. There is no day the essentials stop working.`,
  },
  {
    icon: CreditCard,
    title: "No card to start",
    body: "Sign up, set up your company, and run jobs. The only time a card comes up is if you choose an add-on later.",
  },
  {
    icon: Users,
    title: `Full access for ${seats} users`,
    body: `Every role, every feature in the free plan. A third person is ${seatPrice} a month; ${PLANS.SHOP.name} makes users unlimited.`,
  },
  {
    icon: ShieldCheck,
    title: "Nothing gets taken away",
    body: "If packaging ever changes, existing customers keep everything they already use.",
  },
];

const compare: { label: string; core: string; trial: string; coreGood: boolean; trialGood: boolean }[] = [
  { label: "Time limit", core: "None", trial: "Usually 14 or 30 days", coreGood: true, trialGood: false },
  { label: "Card required", core: "No", trial: "Often, up front", coreGood: true, trialGood: false },
  { label: "Users included", core: `${seats}, with full access`, trial: "Varies; the clock runs either way", coreGood: true, trialGood: false },
  { label: "Features held back", core: "None of the essentials", trial: "Whatever the paid tier gates", coreGood: true, trialGood: false },
  { label: "When it ends", core: "It doesn't", trial: "Pay or lose access", coreGood: true, trialGood: false },
];

const CARD = "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";
const H2 = "text-[2.2rem] leading-[1.05] sm:text-[3.2rem]";
const BLUE = "linear-gradient(135deg, #0A45B8 0%, #0B57D8 55%, #2563EB 100%)";
/** One per freeGroups entry, in order: run the work, get paid, grow & manage. */
const GROUP_ICONS = [CalendarDays, Wallet, MessagesSquare];

function Tile({ icon: Icon }: { icon: typeof CreditCard }) {
  return (
    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-[#0A1428] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_14px_-6px_rgba(10,20,40,0.5)]">
      <Icon className="h-5 w-5 text-[#FF8B33]" strokeWidth={2.1} />
    </span>
  );
}

export default function FreePage() {
  return (
    <>
      <WBFaqJsonLd items={faq} />

      {/* ── Hero ── */}
      <WBSplitHero
        photo={WB_TRADE_PHOTOS.plumbing}
        phone={WB_SHOTS.invoices}
        chip={{ icon: <HandCoins className="h-[18px] w-[18px] text-[#F86A0A]" strokeWidth={2.2} />, title: `${formatCents(0)} a month on ${FREE_PLAN_NAME}`, sub: `Full access for ${seats} users` }}
      >
        <h1 className="mt-4 text-4xl font-extrabold leading-[1.08] sm:text-5xl">
          Free field service management software. <span className="text-[#0B57D8]">Not a trial.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-gray-600 lg:mx-0">
          Scheduling, online booking, quotes with e-signature, invoicing, card and ACH payments, a client
          portal, team chat, and Atlas AI, free for {seats} users with no card and no clock. Extra users are{" "}
          {seatPrice} a month, and the add-ons start at {cheapestAddOn} a month, only if you want them.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
          <Link href="/apply" className="wb-pill wb-pill-primary">
            Get started
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <Link href="/pricing" className="wb-pill wb-pill-outline">
            The full pricing
          </Link>
        </div>
      </WBSplitHero>

      {/* ── Free, not a trial (white, over a faint hand-drawn "Free") ── */}
      <section className="relative overflow-hidden bg-white">
        <WBDoodle word="free" paper="#FFFFFF" opacity={0.06} className="right-4 top-1/2 w-[600px] -translate-y-1/2 -rotate-6 max-lg:hidden" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[auto_1fr] lg:gap-20">
          <AnimateIn>
            <p className="wb-stamp text-center text-[9rem] font-black leading-none tracking-[-0.06em] text-[#F86A0A] sm:text-[13rem] lg:text-left">
              {formatCents(0).replace(/\.00$/, "")}
            </p>
            <p className="-mt-2 text-center text-[17px] font-bold text-gray-500 lg:text-left">a month on {FREE_PLAN_NAME}, for {seats} users</p>
          </AnimateIn>
          <div>
            <h2 className={H2}>
              Free. <span className="text-[#64748B]">Not a trial.</span>
            </h2>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-gray-600">
              {FREE_PLAN_NAME} is the full product, on from the day you sign up. We earn a small part of the card fee when your
              clients pay you, so free stays free.
            </p>
            <AnimateIn className="mt-9">
              <div className="wb-stagger grid gap-4 sm:grid-cols-2">
                {facts.map(({ icon: Icon, title, body }) => (
                  <div key={title} className={`flex gap-4 p-5 ${CARD}`}>
                    <Tile icon={Icon} />
                    <div>
                      <p className="text-[16.5px] font-extrabold text-[#0A1428]">{title}</p>
                      <p className="mt-1 text-[14.5px] leading-relaxed text-gray-600">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </AnimateIn>
          </div>
          <div className="pointer-events-none absolute right-[30%] top-8 z-20 hidden items-end gap-1 xl:flex" aria-hidden>
            <p className="pb-3 text-right text-[15px] font-extrabold leading-snug text-[#10244A]">
              Really.
              <br />
              No catch.
            </p>
            <WBScribble variant="droop" delay={0.5} className="h-[78px] w-[60px] flex-none" />
          </div>
        </div>
      </section>

      {/* ── What's in it: each group printed as a ticket, every line Included,
           the subtotal $0 ── */}
      <section className="relative overflow-hidden bg-[#F5F7FA]">
        <WBDoodle word="clipboard" paper="#F5F7FA" opacity={0.06} className="-left-16 bottom-0 w-[300px] -rotate-6 max-lg:hidden" />
        <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
          <div className="max-w-3xl">
            <h2 className={H2}>
              Everything a service business needs <span className="text-[#0B57D8]">to run a day.</span>
            </h2>
            <p className="mt-6 text-[18px] leading-relaxed text-gray-600">
              The same list the pricing page shows, because it is the same list. The{" "}
              <Link href="/features" className="font-semibold text-[#0B57D8] hover:underline">
                features page
              </Link>{" "}
              has every item in detail.
            </p>
          </div>
          <AnimateIn className="mt-14">
            <div className="wb-stagger grid gap-6 md:grid-cols-3">
              {freeGroups.map((g, i) => {
                const Icon = GROUP_ICONS[i % GROUP_ICONS.length];
                return (
                  <div key={g.label} className={`flex flex-col overflow-hidden ${CARD}`}>
                    <div className="flex items-center gap-3 px-6 pb-4 pt-6">
                      <Tile icon={Icon} />
                      <p className="text-[20px] font-black tracking-[-0.02em] text-[#0A1428]">{g.label}</p>
                    </div>
                    <ul className="flex-1 border-t-2 border-dashed border-gray-200 px-6 py-3">
                      {g.items.map((item) => (
                        <li key={item} className="flex items-baseline justify-between gap-4 py-2 text-[15px]">
                          <span className="font-semibold text-gray-800">{item}</span>
                          <span className="flex-none text-[13px] font-bold text-gray-400">Included</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-baseline justify-between border-t-2 border-dashed border-gray-200 bg-[#FAFBFC] px-6 py-4">
                      <span className="text-[14px] font-bold text-gray-500">Subtotal</span>
                      <span className="text-[24px] font-black tabular-nums text-[#F86A0A]">{formatCents(0)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Free plan vs. free trial: a trial counting down beside a plan with no end ── */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <h2 className={H2}>
              Most &ldquo;free&rdquo; software <span className="text-[#F86A0A]">is a countdown.</span>
            </h2>
            <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-gray-600">
              A free trial gives you the product for a few weeks and then asks for a card. A free plan with the good parts removed
              makes you upgrade the first time you need to invoice. {FREE_PLAN_NAME} is neither: the essentials are free, on from
              day one, and they stay that way.
            </p>
          </div>
          <AnimateIn>
            <WBFreePlanCountdown rows={compare} planName={FREE_PLAN_NAME} monthly={formatCents(0)} />
          </AnimateIn>
        </div>
      </section>

      {/* ── How we make money (blue band, white cards) ── */}
      <section className="relative overflow-hidden text-white" style={{ background: BLUE }}>
        <WBDoodle word="piggy" ink="#FFFFFF" paper="#0B57D8" opacity={0.08} className="-right-16 -top-10 w-[420px] rotate-6 max-lg:hidden" />
        <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
          <div className="max-w-3xl">
            <h2 className={H2}>
              How we make money. <span className="text-[#BFD6FF]">Three things, all optional.</span>
            </h2>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-white/85">
              All three are on the{" "}
              <Link href="/pricing" className="font-bold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
                pricing page
              </Link>
              . None of them is the price of getting started.
            </p>
          </div>
          <AnimateIn className="mt-14">
            <div className="wb-stagger grid gap-6 text-[#0A1428] lg:grid-cols-3">
              <div className={`p-7 ${CARD}`}>
                <Tile icon={CreditCard} />
                <h3 className="mt-5 text-[20px] font-black tracking-[-0.02em]">Payment processing</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
                  Only when a client pays you through WorkBench. Pay the fee yourself at{" "}
                  <span className="font-bold text-gray-900">{RATES.companyPaid.card}</span> per card payment and{" "}
                  <span className="font-bold text-gray-900">{RATES.companyPaid.ach}</span> per ACH transfer, or add a service fee your
                  client pays at checkout ({RATES.serviceFee.card} card, {RATES.serviceFee.ach} ACH) and keep the full invoice amount. No
                  monthly fees, no minimums, no charge on failed payments.
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
                  This is the fee you pay already: online card payments cost about {BENCHMARK.label} almost anywhere. The difference is
                  that here there is no subscription underneath it.
                </p>
              </div>
              <div className={`p-7 ${CARD}`}>
                <Tile icon={HandCoins} />
                <h3 className="mt-5 text-[20px] font-black tracking-[-0.02em]">Add-ons, flat per company</h3>
                <ul className="mt-3 divide-y divide-gray-100">
                  {addOns.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5 text-[15px]">
                      <span className="text-gray-800">
                        <span className="font-bold text-gray-900">{p.name}</span>
                        {p.comingSoon && <span className="ml-2 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-500">Coming soon</span>}
                        <span className="block text-[13px] text-gray-500">{p.tagline}</span>
                      </span>
                      <span className="shrink-0 font-black text-gray-900">{formatCents(p.monthlyCents)}/mo</span>
                    </li>
                  ))}
                  <li className="flex items-baseline justify-between gap-3 py-2.5 text-[15px]">
                    <span className="text-gray-800">
                      <span className="font-bold text-gray-900">{FULL_SHOP.name}</span>
                      <span className="block text-[13px] text-gray-500">{FULL_SHOP.tagline}</span>
                    </span>
                    <span className="shrink-0 font-black text-gray-900">{formatCents(FULL_SHOP.monthlyCents)}/mo</span>
                  </li>
                </ul>
                <p className="mt-3 text-[13.5px] text-gray-500">
                  Extra users on {FREE_PLAN_NAME} are {seatPrice} a month each; {PLANS.SHOP.name} has no per-user charge.
                </p>
              </div>
              <div className={`p-7 ${CARD}`}>
                <Tile icon={Sparkles} />
                <h3 className="mt-5 text-[20px] font-black tracking-[-0.02em]">Atlas, past the free allowance</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
                  Every account gets {freeTokens} Atlas tokens free each month, refilled on the 1st. AI usage costs real money, so it is
                  the one metered thing instead of being buried in the price of everything else. Heavier users get a much larger
                  allowance with {PLANS.SHOP.name};{" "}
                  <Link href="/pricing" className="font-semibold text-[#0B57D8] hover:underline">
                    pricing
                  </Link>{" "}
                  has the numbers.
                </p>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── What three shops keep ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
            <div>
              <h2 className={H2}>
                The card fee is the same bill you pay now. <span className="text-[#0B57D8]">The subscription isn&rsquo;t.</span>
              </h2>
              <p className="mt-6 text-[18px] leading-relaxed text-gray-600">
                Three shops, their card volume, and what each keeps in a year next to the cheapest published plan at Jobber and
                Housecall Pro, with everyone&rsquo;s processing counted.
              </p>
            </div>
            <AnimateIn>
              <WBSavingsExamples />
            </AnimateIn>
          </div>
        </div>
      </section>

      <WBTestimonials />

      <WBFaqSection items={faq} title="Questions about the free plan" />

      <WBCta
        title={`Free for ${seats} users. Full access, not a trial.`}
        body="Create your account, pick who pays the card fee, connect your Square account, and you are in — about five minutes, no waiting on anyone."
        secondary={{ label: "See it for your trade", href: "/trades" }}
      />
    </>
  );
}
