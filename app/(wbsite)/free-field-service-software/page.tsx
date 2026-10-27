import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, CreditCard, HandCoins, Infinity as InfinityIcon, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBSplitHero from "@/components/wb/WBSplitHero";
import WBFaq from "@/components/wb/WBFaq";
import WBFaqJsonLd from "@/components/wb/WBFaqJsonLd";
import WBTestimonials from "@/components/wb/WBTestimonials";
import WBCta from "@/components/wb/WBCta";
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
        <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-[12.5px] font-bold text-[#0B57D8]">The free plan</span>
        <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] sm:text-5xl">
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

      {/* ── What free means here ── */}
      <section className="border-y border-gray-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-8 px-5 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          {facts.map(({ icon: Icon, title, body }, i) => (
            <AnimateIn key={title} delay={i * 80}>
              <div className="flex gap-4">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-blue-50">
                  <Icon className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-[15.5px] font-bold text-gray-900">{title}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-gray-600">{body}</p>
                </div>
              </div>
            </AnimateIn>
          ))}
        </div>
      </section>

      {/* ── What's in it ── */}
      <section className="bg-[#F6F8FB]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <AnimateIn className="max-w-3xl">
            <p className="wb-label">What&rsquo;s in {FREE_PLAN_NAME}</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Everything a service business needs to run a day.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-gray-600">
              The same list the pricing page shows, because it is the same list. The{" "}
              <Link href="/features" className="font-semibold text-[#0B57D8] hover:underline">
                features page
              </Link>{" "}
              has every item in detail.
            </p>
          </AnimateIn>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {freeGroups.map((g, i) => (
              <AnimateIn key={g.label} delay={i * 90}>
                <div className={`h-full rounded-[1.25rem] border border-gray-200 border-t-4 bg-white p-6 ${g.accent}`}>
                  <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500">{g.label}</p>
                  <ul className="mt-4 space-y-2.5">
                    {g.items.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-[15px] text-gray-800">
                        <Check className="mt-[3px] h-4 w-4 flex-none text-[#15803d]" strokeWidth={2.5} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Free plan vs. free trial ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <AnimateIn>
              <p className="wb-label">Free plan, not free trial</p>
              <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
                Most &ldquo;free&rdquo; software is a countdown.
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-gray-600">
                A free trial gives you the product for a few weeks and then asks for a card. A
                free plan with the good parts removed makes you upgrade the first time you need
                to invoice. {FREE_PLAN_NAME} is neither: the essentials are free, on from day one,
                and they stay that way.
              </p>
            </AnimateIn>
            <AnimateIn delay={120}>
              <div className="overflow-hidden rounded-[1.25rem] border border-gray-200">
                <table className="w-full text-left text-[14.5px]">
                  <thead className="bg-[#F6F8FB] text-[12.5px] font-bold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3 font-bold" scope="col">
                        &nbsp;
                      </th>
                      <th className="px-4 py-3 font-bold text-gray-900" scope="col">
                        WorkBench {FREE_PLAN_NAME}
                      </th>
                      <th className="px-4 py-3 font-bold" scope="col">
                        A typical free trial
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {compare.map((r) => (
                      <tr key={r.label}>
                        <th className="px-4 py-3 align-top font-semibold text-gray-700" scope="row">
                          {r.label}
                        </th>
                        <td className="px-4 py-3 align-top text-gray-900">
                          <span className="flex items-start gap-2">
                            <Check className="mt-[3px] h-4 w-4 flex-none text-[#15803d]" strokeWidth={2.5} />
                            {r.core}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top text-gray-600">
                          <span className="flex items-start gap-2">
                            <X className="mt-[3px] h-4 w-4 flex-none text-gray-400" strokeWidth={2.5} />
                            {r.trial}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── What costs money ── */}
      <section className="bg-[#F6F8FB]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <AnimateIn className="max-w-3xl">
            <p className="wb-label">What costs money</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              Three things, all optional, all on the pricing page.
            </h2>
          </AnimateIn>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            <AnimateIn>
              <div className="h-full rounded-[1.25rem] border border-gray-200 bg-white p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <CreditCard className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-[17px] font-bold text-gray-900">Payment processing</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-gray-600">
                  Only when a client pays you through WorkBench. Pay the fee yourself at{" "}
                  <span className="font-bold text-gray-900">{RATES.companyPaid.card}</span> per card payment and{" "}
                  <span className="font-bold text-gray-900">{RATES.companyPaid.ach}</span> per ACH transfer, or add a
                  service fee your client pays at checkout ({RATES.serviceFee.card} card, {RATES.serviceFee.ach} ACH) and
                  keep the full invoice amount. No monthly fees, no minimums, no charge on failed payments.
                </p>
              </div>
            </AnimateIn>
            <AnimateIn delay={90}>
              <div className="h-full rounded-[1.25rem] border border-gray-200 bg-white p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
                  <HandCoins className="h-5 w-5 text-[#F86A0A]" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-[17px] font-bold text-gray-900">Add-ons, flat per company</h3>
                <ul className="mt-3 divide-y divide-gray-100">
                  {addOns.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-3 py-2 text-[14.5px]">
                      <span className="text-gray-800">
                        <span className="font-bold text-gray-900">{p.name}</span>
                        {p.comingSoon && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-500">Coming soon</span>}
                        <span className="block text-[13px] text-gray-500">{p.tagline}</span>
                      </span>
                      <span className="shrink-0 font-bold text-gray-900">{formatCents(p.monthlyCents)}/mo</span>
                    </li>
                  ))}
                  <li className="flex items-baseline justify-between gap-3 py-2 text-[14.5px]">
                    <span className="text-gray-800">
                      <span className="font-bold text-gray-900">{FULL_SHOP.name}</span>
                      <span className="block text-[13px] text-gray-500">{FULL_SHOP.tagline}</span>
                    </span>
                    <span className="shrink-0 font-bold text-gray-900">{formatCents(FULL_SHOP.monthlyCents)}/mo</span>
                  </li>
                </ul>
                <p className="mt-3 text-[13px] text-gray-500">Extra users on {FREE_PLAN_NAME} are {seatPrice} a month each; {PLANS.SHOP.name} has no per-user charge.</p>
              </div>
            </AnimateIn>
            <AnimateIn delay={180}>
              <div className="h-full rounded-[1.25rem] border border-gray-200 bg-white p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <Sparkles className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-[17px] font-bold text-gray-900">Atlas, past the free allowance</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-gray-600">
                  Every account gets {freeTokens} Atlas tokens free each month, refilled on the 1st. AI usage costs
                  real money, so it is the one metered thing instead of being buried in the price of everything
                  else. Heavier users can move to Atlas Full, on its own or with {PLANS.SHOP.name};{" "}
                  <Link href="/pricing#atlas" className="font-semibold text-[#0B57D8] hover:underline">
                    Atlas pricing
                  </Link>{" "}
                  has the numbers.
                </p>
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      <WBTestimonials />

      {/* ── FAQ ── */}
      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <AnimateIn>
          <h2 className="text-2xl font-extrabold sm:text-3xl">Questions about the free plan</h2>
          <div className="mt-8">
            <WBFaq items={faq} />
          </div>
        </AnimateIn>
      </section>

      <WBCta
        title={`Free for ${seats} users. Full access, not a trial.`}
        body="Tell us about your business and your account opens today. A person reviews every application and onboards your company personally."
        secondary={{ label: "See it for your trade", href: "/trades" }}
      />
    </>
  );
}
