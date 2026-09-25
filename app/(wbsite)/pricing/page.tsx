import type { Metadata } from "next";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import WBHero from "@/components/wb/WBHero";
import WBFaq from "@/components/wb/WBFaq";
import WBPricing from "@/components/wb/WBPricing";
import { ArrowRight, Compass, CreditCard, HandCoins, Puzzle, ShieldCheck, Sparkles } from "lucide-react";
import { ATLAS_FREE_TOKENS, ATLAS_PLAN_TOKENS, formatPlanPrice, tokenCount } from "@/lib/atlas-pricing";
import {
  ANNUAL_MONTHS,
  DISPATCH_MINUTES_INCLUDED,
  DISPATCH_OVERAGE_CENTS,
  DISPATCH_SETUP_CENTS,
  DISPATCH_TEXTS_INCLUDED,
  EXTRA_SEAT_CENTS,
  FREE_PLAN_NAME,
  FULL_SHOP,
  INCLUDED_SEATS,
  PLANS,
  formatCents,
  formatUnitCents,
} from "@/lib/plans";
import { WB_PHONE } from "@/lib/wb-site";

const freeTokens = tokenCount(ATLAS_FREE_TOKENS);
const planTokens = tokenCount(ATLAS_PLAN_TOKENS);
const planPrice = formatPlanPrice();
const dispatch = PLANS.DISPATCH;
const shop = PLANS.SHOP;
const jobsite = PLANS.JOBSITE;
const seatPrice = formatCents(EXTRA_SEAT_CENTS);

const pricingFaq = [
  {
    q: "Is the free plan a trial?",
    a: (
      <p>
        No. {FREE_PLAN_NAME} is the full product for {INCLUDED_SEATS} users, on from the day you
        sign up, with no clock and no card. Clients, booking, scheduling, quotes, invoices,
        payments, the client portal, team chat, and Atlas are all in it. The add-ons exist for
        shops that want a phone line, unlimited users and the ops tools, or job photos; a shop
        that never buys one is still a customer we&apos;re happy to have.
      </p>
    ),
  },
  {
    q: "What's the catch?",
    a: (
      <p>
        The catch is that we&apos;re a payments company as much as a software company.
        WorkBench earns a slice of the flat processing fee when your clients pay you through
        it, and the add-ons are how we earn from shops that use more than the core. If
        you&apos;d rather record cash and checks by hand and never add anything, the software
        is still free.
      </p>
    ),
  },
  {
    q: "What counts as a user?",
    a: (
      <p>
        Anyone who signs in: the owner, the office, every tech. {INCLUDED_SEATS} are included
        on {FREE_PLAN_NAME}, {dispatch.name}, and {jobsite.name}; each one after that is{" "}
        {seatPrice} a month. {shop.name} and {FULL_SHOP.name} include unlimited users, so a crew
        of nine pays the same as a crew of three. Clients using the portal are never users.
      </p>
    ),
  },
  {
    q: "Are there any monthly fees or minimums on payments?",
    a: (
      <p>
        No. You pay 2.9% + 30¢ per successful card transaction and 0.75% per ACH bank
        transfer, and that&apos;s the whole list. No monthly fee, no minimum volume, no charge
        on failed or declined payments.
      </p>
    ),
  },
  {
    q: `What does ${dispatch.name} cost beyond the monthly price?`,
    a: (
      <p>
        {formatCents(DISPATCH_SETUP_CENTS)} once, when you get your number: that covers buying
        it and registering your business with the carriers so it can text (a filing every
        business that texts has to make). Each month includes{" "}
        {DISPATCH_TEXTS_INCLUDED.toLocaleString("en-US")} texts and{" "}
        {DISPATCH_MINUTES_INCLUDED.toLocaleString("en-US")} minutes; past that it&apos;s{" "}
        {formatUnitCents(DISPATCH_OVERAGE_CENTS)} per text or minute, billed with the next
        month. Most small shops never reach the allowance.
      </p>
    ),
  },
  {
    q: "How does annual billing work?",
    a: (
      <p>
        Pay for {ANNUAL_MONTHS} months up front and get 12, on any add-on. You can start
        monthly and switch to annual later; the remaining month is credited.
      </p>
    ),
  },
  {
    q: "Will features I use ever move behind a paywall?",
    a: (
      <p>
        The essentials, never. Two things moved into {shop.name} when the add-ons launched in
        September 2026: weekly timesheets and agreements. Every account opened before that
        keeps both free, for good. Atlas, the AI assistant, has always had a meter, because AI
        usage costs real money: every account gets {freeTokens} Atlas tokens free each month.
      </p>
    ),
  },
  {
    q: "Do I need Pro just for QuickBooks?",
    a: (
      <p>
        QuickBooks Online sync is part of {shop.name}. If your accountant or bookkeeper sends
        you to WorkBench, we turn QuickBooks sync on for free on {FREE_PLAN_NAME}; have them
        mention it when you sign up, or call us.
      </p>
    ),
  },
  {
    q: "What's an Atlas token?",
    a: (
      <p>
        A unit of AI work. A quick question costs a couple hundred tokens; a big job like
        rescheduling a whole day or editing forty records costs more, and every reply shows
        what it used. Your {freeTokens} free tokens refill on the 1st of every month. Atlas Full
        is {planTokens} tokens a month, {planPrice} on its own or included with {shop.name}, and
        Atlas never spends past either allowance.
      </p>
    ),
  },
  {
    q: "How do I actually get access?",
    a: (
      <p>
        Your account opens the day you sign up.{" "}
        <Link href="/apply" className="font-semibold text-[#0B57D8] hover:underline">
          Get started here
        </Link>{" "}
        — a person reviews every application, and we onboard approved companies personally.
        At signup, a short payment-verification form (standard KYC) activates your account.
        Add-ons are switched on from Settings afterwards, or we set them up with you.
      </p>
    ),
  },
];

export const metadata: Metadata = {
  title: "Pricing — WorkBench",
  description: `WorkBench is free to use: full access for ${INCLUDED_SEATS} users, not a trial, funded by payment processing at 2.9% + 30¢. Optional add-ons from ${formatCents(dispatch.monthlyCents)} a month: ${dispatch.name} (business phone line), ${shop.name} (unlimited users and the ops tools), and ${jobsite.name} (job photos, coming soon).`,
};

export default function WBPricingPage() {
  return (
    <>
      {/* ── Hero ── */}
      <WBHero>
          <AnimateIn>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">
              WorkBench is free to use.
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-gray-600">
              Full access for {INCLUDED_SEATS} users, not a trial, with no card and no clock.
              Add a business phone line, unlimited users with the ops tools, or job photos
              only when you want them, from {formatCents(dispatch.monthlyCents)} a month.
              Payment processing at one flat rate funds the rest.
            </p>
          </AnimateIn>
      </WBHero>

      {/* ── The plans ── */}
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
        <AnimateIn>
          <WBPricing />
        </AnimateIn>
      </section>

      {/* ── How it's free ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
            <AnimateIn>
              <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
                So how is the core free?
              </h2>
              <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-gray-600">
                Payments. WorkBench has card and ACH processing built into
                every quote, invoice, and booking, at a flat{" "}
                <span className="font-bold text-gray-900">
                  2.9% + 30¢ per card transaction
                </span>{" "}
                and{" "}
                <span className="font-bold text-gray-900">
                  0.75% per ACH bank transfer
                </span>
                . When your clients pay you through WorkBench, a small slice
                of that processing fee is what funds the software.
              </p>
              <p className="mt-4 max-w-lg text-[15.5px] leading-relaxed text-gray-600">
                That means we mostly make money when you do. The add-ons are
                priced flat per company, not per seat, because our real
                incentive is that WorkBench runs your day so well that
                getting paid through it is the obvious move.
              </p>
            </AnimateIn>
            <ul className="grid content-center gap-5">
              {[
                {
                  icon: CreditCard,
                  title: "One flat rate",
                  body: "2.9% + 30¢ per successful card transaction, 0.75% for ACH bank transfers. No monthly fees, no minimums, no charge on failed payments.",
                },
                {
                  icon: HandCoins,
                  title: "Aligned incentives",
                  body: "We earn when a job gets paid — the same moment you do. Software that costs you nothing until it's working.",
                },
                {
                  icon: ShieldCheck,
                  title: "Your money lands with you",
                  body: "Payouts go to your bank account, with records clean enough for your bookkeeper.",
                },
              ].map(({ icon: Icon, title, body }, i) => (
                <AnimateIn key={title} delay={i * 100}>
                  <li className="flex gap-4">
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-blue-50">
                      <Icon className="h-[18px] w-[18px] text-[#0B57D8]" strokeWidth={2} />
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-gray-900">{title}</p>
                      <p className="mt-0.5 text-[14px] leading-relaxed text-gray-500">{body}</p>
                    </div>
                  </li>
                </AnimateIn>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Essentials free forever ── */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
          <AnimateIn>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50">
              <Puzzle className="h-5 w-5 text-[#F86A0A]" strokeWidth={2} />
            </div>
            <h2 className="mt-5 text-3xl font-extrabold leading-tight sm:text-4xl">
              The essentials are free. Forever. Not a trial.
            </h2>
          </AnimateIn>
          <AnimateIn delay={120}>
            <p className="text-[15.5px] leading-relaxed text-gray-600">
              Everything a service business needs to run — clients, booking,
              scheduling, quotes, invoices, payments, the client portal, team
              chat, the iPhone app — is in {FREE_PLAN_NAME}, and that&apos;s
              permanent. There is no trial clock, no card on file, and no
              day when the essentials stop working. We will never move an
              essential feature behind a paywall.
            </p>
            <p className="mt-4 text-[15.5px] leading-relaxed text-gray-600">
              The add-ons are extra tools, not the product with the good
              parts taken out. {dispatch.name} is a phone line. {shop.name} is
              unlimited users plus the ops tools a growing crew reaches for:
              the estimator, routes, automations, agreements, the team map,
              timesheets, and QuickBooks. {jobsite.name} will be job photos.
              If your account was open before the add-ons launched, timesheets
              and agreements stay free on it.
            </p>
            <p className="mt-4 text-[15.5px] leading-relaxed text-gray-600">
              <span className="font-bold text-gray-900">Atlas</span>, the AI
              assistant, is the one metered thing: every account gets{" "}
              {freeTokens} Atlas tokens free every month, and heavier users
              can move up to Atlas Full, on its own or as part of {shop.name}.
              AI usage has a real cost to us, so it&apos;s priced separately
              from the free core software instead of quietly built into it.
            </p>
          </AnimateIn>
        </div>
      </section>

      {/* ── Atlas tiers ── */}
      <section id="atlas" className="scroll-mt-24 border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <AnimateIn>
            <div className="flex items-center gap-3">
              <Compass className="h-6 w-6 text-[#0B57D8]" strokeWidth={1.9} />
              <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
                Atlas, the AI assistant
              </h2>
            </div>
            <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-gray-600">
              Atlas is metered in tokens because every request is real AI
              work. A quick question is a couple hundred tokens; a bulk edit
              across forty records is a couple thousand. Every reply shows
              what it used, and Atlas never spends past your allowance.
            </p>
          </AnimateIn>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <AnimateIn>
              <div className="flex h-full flex-col rounded-[1.5rem] border border-gray-200 bg-white p-8">
                <p className="wb-label">
                  Atlas Free
                </p>
                <p
                  className="mt-4 text-5xl font-extrabold leading-none text-gray-900"
                  style={{ fontFamily: '"Nunito", sans-serif' }}
                >
                  $0
                </p>
                <p className="mt-3 text-[15px] font-bold text-gray-900">
                  {freeTokens} tokens every month
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-gray-500">
                  Included with every account, no card and no sign-up step.
                  Refills on the 1st of the month.
                </p>
                <ul className="mt-6 flex flex-col gap-2.5 text-[14px] text-gray-600">
                  {[
                    "Every Atlas tool — schedule, money, clients, routes",
                    "Roughly 25–60 messages a month",
                    "Shared by your whole team",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Sparkles className="mt-0.5 h-4 w-4 flex-none text-[#0B57D8]" strokeWidth={2.5} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </AnimateIn>
            <AnimateIn delay={120}>
              <div className="relative flex h-full flex-col overflow-hidden rounded-[1.5rem] bg-[#0A1428] p-8 text-white">
                <div className="relative flex h-full flex-col">
                  <div className="flex items-center justify-between gap-3">
                    <p className="wb-label wb-label-light">
                      Atlas Full
                    </p>
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-bold text-blue-100">
                      Included with {shop.name}
                    </span>
                  </div>
                  <p
                    className="mt-4 text-5xl font-extrabold leading-none text-white"
                    style={{ fontFamily: '"Nunito", sans-serif' }}
                  >
                    {planPrice}
                    <span className="text-xl font-bold text-blue-200">/month</span>
                  </p>
                  <p className="mt-3 text-[15px] font-bold text-white">
                    {planTokens} tokens every month
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-blue-100/80">
                    Fifteen times the free allowance, refilled on your billing
                    day. For the office that hands Atlas the whole day. On its
                    own for {planPrice}, or part of {shop.name} and{" "}
                    {FULL_SHOP.name}.
                  </p>
                  <ul className="mt-6 flex flex-col gap-2.5 text-[14px] text-white">
                    {[
                      "Everything in Atlas Free",
                      "Room for bulk work — a hundred records at a time",
                      "Cancel any time; your free tokens stay",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <Sparkles className="mt-0.5 h-4 w-4 flex-none text-[#FF8B33]" strokeWidth={2.5} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
          <AnimateIn>
            <h2 className="text-center text-3xl font-extrabold leading-tight sm:text-4xl">
              Pricing questions, answered
            </h2>
          </AnimateIn>
          <AnimateIn delay={120} className="mt-10">
            <WBFaq items={pricingFaq} />
          </AnimateIn>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-16 sm:px-8 md:flex-row md:items-center">
          <AnimateIn>
            <h2 className="text-2xl font-extrabold sm:text-3xl">
              Questions about pricing?
            </h2>
            <p className="mt-2 text-[15px] text-gray-500">
              Call {WB_PHONE.display} and we will walk through it with you, or
              sign up and your account opens today.
            </p>
          </AnimateIn>
          <AnimateIn delay={120} className="flex flex-wrap items-center gap-4">
            <Link
              href="/apply"
              className="wb-pill wb-pill-primary"
            >
              Get started
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
            <Link
              href="/features"
              className="wb-pill wb-pill-outline"
            >
              See every feature
            </Link>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
