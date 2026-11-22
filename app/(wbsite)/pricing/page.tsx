import { RATES, RATES_SENTENCE } from "@/lib/plans";
import { SERVICE_FEE_CARD } from "@/lib/service-fee";
import type { Metadata } from "next";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import WBSplitHero, { WB_SHOTS } from "@/components/wb/WBSplitHero";
import WBTestimonials from "@/components/wb/WBTestimonials";
import WBScribble from "@/components/wb/WBScribble";
import { WBFaqSection } from "@/components/wb/WBFaq";
import WBAgentLink from "@/components/wb/WBAgentLink";
import WBPricing from "@/components/wb/WBPricing";
import WBPriceAverage from "@/components/wb/WBPriceAverage";
import WBPriceForever from "@/components/wb/WBPriceForever";
import WBDoodle from "@/components/wb/WBDoodle";
import { BENCHMARK } from "@/lib/wb-savings";
import { ArrowRight, CreditCard, HandCoins, ShieldCheck } from "lucide-react";
import { ATLAS_FREE_TOKENS, ATLAS_PLAN_TOKENS, tokenCount } from "@/lib/atlas-pricing";
import {
  ANNUAL_MONTHS,
  DISPATCH_SETUP_CENTS,
  EXTRA_SEAT_CENTS,
  FAIR_USE_FORBIDDEN,
  FAIR_USE_SENTENCE,
  FREE_PLAN_NAME,
  FULL_SHOP,
  INCLUDED_SEATS,
  PLANS,
  formatCents,
} from "@/lib/plans";
import { WB_PHONE, WB_TRADE_PHOTOS } from "@/lib/wb-site";

const freeTokens = tokenCount(ATLAS_FREE_TOKENS);
const planTokens = tokenCount(ATLAS_PLAN_TOKENS);
const H2 = "text-[2.2rem] leading-[1.05] sm:text-[3.2rem]";
const CARD = "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";
const dispatch = PLANS.DISPATCH;
const shop = PLANS.SHOP;
const jobsite = PLANS.JOBSITE;
const seatPrice = formatCents(EXTRA_SEAT_CENTS);

const pricingFaq = [
  {
    q: "Isn't the processing fee the real price?",
    a: (
      <p>
        It is a price, but not a new one. Online card payments cost a business about {BENCHMARK.label} almost
        anywhere ({BENCHMARK.note}); on WorkBench the company-paid rate is {RATES.companyPaid.card}. The
        difference is that everywhere else that fee sits on top of a monthly subscription, and here the
        software is free. Or add a service fee your client pays at checkout and the processing costs you
        nothing. The{" "}
        <a href="#savings" className="font-semibold text-[#0B57D8] hover:underline">
          average above
        </a>{" "}
        puts numbers on it for a typical shop.
      </p>
    ),
  },
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
        No. {RATES_SENTENCE} Pick whichever suits your clients; either way that&apos;s the whole
        list, and failed or declined payments cost nothing.
      </p>
    ),
  },
  {
    q: `What does ${dispatch.name} cost beyond the monthly price?`,
    a: (
      <p>
        {formatCents(DISPATCH_SETUP_CENTS)} once, when you get your number: that covers buying
        it and registering your business with the carriers so it can text (a filing every
        business that texts has to make). After that, talk and text are unlimited.
      </p>
    ),
  },
  {
    q: `What does "unlimited" mean on ${dispatch.name}?`,
    a: (
      <p>
        {FAIR_USE_SENTENCE} A busy three-truck shop uses a few hundred of each, so a real
        business never meets the ceiling; it exists so the line can&apos;t be run as a dialer.{" "}
        {FAIR_USE_FORBIDDEN} The carriers register your number for conversations with your
        own clients, and that is what it is for.
      </p>
    ),
  },
  {
    q: "How does annual billing work?",
    a: (
      <p>
        Pay for {ANNUAL_MONTHS} months up front and get 12, on any add-on. You can start
        monthly and switch to annual later: the yearly term starts the day you switch and the
        monthly one runs out on its own — nothing is prorated or credited back. Plans renew
        automatically until you cancel, and cancelling ends the plan at the end of the term
        you paid for. Plan charges are card payments and carry the same card service fee
        your clients pay ({SERVICE_FEE_CARD}); the exact total is shown before you confirm.
      </p>
    ),
  },
  {
    q: "Will features I use ever move behind a paywall?",
    a: (
      <p>
        No. If our pricing or packaging ever changes, existing customers are grandfathered
        in: the features you already use stay where they are, at the price you signed up
        for. Atlas, the AI assistant, has always had a meter, because AI usage costs real
        money: every account gets {freeTokens} Atlas tokens free each month.
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
        what it used. Your {freeTokens} free tokens refill on the 1st of every month.{" "}
        {shop.name} and {FULL_SHOP.name} include {planTokens} tokens a month, and Atlas never
        spends past your allowance.
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
        — you're in the app the same day. To take payments, connect your own Square account
        from Settings (a few minutes, no paperwork with us). Add-ons are switched on from
        Settings → Money → Your WorkBench plan afterwards, or we set them up with you.
      </p>
    ),
  },
];

export const metadata: Metadata = {
  title: "Pricing",
  alternates: { canonical: "https://workbenchfsm.com/pricing", types: { "text/markdown": "https://workbenchfsm.com/pricing.md" } },
  description: `WorkBench FSM's core is free: full access for ${INCLUDED_SEATS} users, not a trial, funded by payment processing (${RATES.companyPaid.card} per card transaction, or a service fee your client pays). Optional add-ons from ${formatCents(dispatch.monthlyCents)} a month: ${dispatch.name} (business phone line), ${shop.name} (unlimited users and the ops tools), and ${jobsite.name} (job photos, coming soon).`,
};

export default function WBPricingPage() {
  return (
    <>
      {/* ── Hero ── */}
      <WBSplitHero
        photo={WB_TRADE_PHOTOS.cleaning}
        phone={WB_SHOTS.insights}
        chip={{ icon: <HandCoins className="h-[18px] w-[18px] text-[#F86A0A]" strokeWidth={2.2} />, title: "$0 a month on " + FREE_PLAN_NAME, sub: `Full access for ${INCLUDED_SEATS} users` }}
      >
        <h1 className="text-4xl font-extrabold leading-[1.08] sm:text-5xl">The core of WorkBench is free.</h1>
        <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-gray-600 lg:mx-0">
          Full access for {INCLUDED_SEATS} users, not a trial, with no card and no clock.
          Extra users are {seatPrice} a month each.
          Add a business phone line, unlimited users with the ops tools, or job photos
          only when you want them, from {formatCents(dispatch.monthlyCents)} a month.
          Payment processing funds the rest.
        </p>
        <div className="mt-6 hidden items-end gap-1 lg:flex" aria-hidden>
          <p className="pb-2 text-[15px] font-extrabold leading-snug text-[#10244A]">Start on {FREE_PLAN_NAME}.
            <br />
            Add the rest later.</p>
          <WBScribble variant="droop" delay={0.6} className="h-[80px] w-[62px] flex-none" />
        </div>
      </WBSplitHero>

      {/* ── The plans ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <AnimateIn>
            <WBPricing />
          </AnimateIn>
          <WBAgentLink href="/pricing.md" what="this pricing" />
        </div>
      </section>

      {/* ── How it's free (light gray) ── */}
      <section className="bg-[#F5F7FA]">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
          <AnimateIn>
            <h2 className={H2}>
              So how is <span className="text-[#0B57D8]">the core free?</span>
            </h2>
            <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-gray-600">
              Payments. WorkBench has card and ACH processing built into every quote, invoice, and booking. Pay the fee yourself at{" "}
              <span className="font-bold text-[#0A1428]">{RATES.companyPaid.card} per card transaction</span> and{" "}
              <span className="font-bold text-[#0A1428]">{RATES.companyPaid.ach} per ACH bank transfer</span>, or pass it on as a service fee
              your client pays at checkout ({RATES.serviceFee.card} per card, {RATES.serviceFee.ach} ACH) and keep the full invoice amount.
            </p>
            <p className="mt-4 max-w-lg text-[18px] leading-relaxed text-gray-600">
              When your clients pay you through WorkBench, a small slice of that processing fee funds the software. We make money when you do.
            </p>
          </AnimateIn>
          <AnimateIn delay={120} className={`wb-stagger self-center ${CARD} divide-y divide-gray-100`}>
            {[
              {
                icon: CreditCard,
                title: "Two ways to pay for processing",
                body: `Company-paid: ${RATES.companyPaid.card} per card transaction, ${RATES.companyPaid.achShort} per ACH transfer. Or a service fee your client pays: ${RATES.serviceFee.card} card, ${RATES.serviceFee.achShort} ACH. No monthly fees, no minimums, no charge on failed payments.`,
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
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-5 p-6 sm:p-7">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-[#0A1428]">
                  <Icon className="h-5 w-5 text-[#FF8B33]" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-[17px] font-black text-[#0A1428]">{title}</p>
                  <p className="mt-1 text-[15.5px] leading-relaxed text-gray-600">{body}</p>
                </div>
              </div>
            ))}
          </AnimateIn>
        </div>
      </section>

      {/* ── What the average shop keeps (blue band) ── */}
      <WBPriceAverage />

      {/* ── Free forever, not a trial (white, over a faint hand-drawn "Free") ── */}
      <section className="relative overflow-hidden bg-white">
        <WBDoodle word="free" paper="#FFFFFF" opacity={0.06} className="-right-10 top-10 w-[520px] rotate-6 max-lg:hidden" />
        <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <AnimateIn>
            <h2 className={`max-w-3xl ${H2}`}>
              Free forever. <span className="text-[#F86A0A]">Not a trial.</span>
            </h2>
            <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-gray-600">
              Everything a service business needs to run (clients, booking, scheduling, quotes, invoices, payments, the client portal, team
              chat, the phone apps) is in {FREE_PLAN_NAME}, and that&apos;s permanent. No trial clock, no card on file, no day when the
              essentials stop working.
            </p>
          </AnimateIn>
          <AnimateIn delay={100} className="mt-12">
            <WBPriceForever planName={FREE_PLAN_NAME} seats={INCLUDED_SEATS} />
          </AnimateIn>
          <AnimateIn className="wb-stagger mt-12 grid gap-10 md:grid-cols-3">
            <div>
              <h3 className="text-[20px] font-black text-[#0A1428]">Nothing gets taken away</h3>
              <p className="mt-2 text-[16.5px] leading-relaxed text-gray-600">
                If our pricing or packaging ever changes, existing customers are grandfathered in: the features you use stay where they are,
                at the price you signed up for.
              </p>
            </div>
            <div>
              <h3 className="text-[20px] font-black text-[#0A1428]">Add-ons are extras, not ransom</h3>
              <p className="mt-2 text-[16.5px] leading-relaxed text-gray-600">
                {dispatch.name} is a phone line. {shop.name} is unlimited users plus the ops tools a growing crew reaches for: the estimator,
                routes, automations, agreements, the team map, timesheets, and QuickBooks. {jobsite.name} will be job photos.
              </p>
            </div>
            <div>
              <h3 className="text-[20px] font-black text-[#0A1428]">Atlas, with a free allowance</h3>
              <p className="mt-2 text-[16.5px] leading-relaxed text-gray-600">
                The AI assistant is the one metered thing, because AI work costs real money. Every account gets {freeTokens} Atlas tokens free
                each month; {shop.name} and {FULL_SHOP.name} include {planTokens}.
              </p>
            </div>
          </AnimateIn>
        </div>
      </section>

      <WBTestimonials />

      <WBFaqSection items={pricingFaq} title="Pricing questions, answered" />

      {/* ── CTA ── */}
      <section className="bg-[#F5F7FA]">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-5 py-20 sm:px-8 md:flex-row md:items-center">
          <AnimateIn>
            <h2 className="text-[2rem] leading-[1.05] sm:text-[2.6rem]">
              Questions about <span className="text-[#0B57D8]">pricing?</span>
            </h2>
            <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-gray-600">
              Book a call and we will walk through it with you, or sign up and your account opens today. Or call {WB_PHONE.display}.
            </p>
          </AnimateIn>
          <AnimateIn delay={120} className="flex flex-wrap items-center gap-3">
            <Link href="/apply" className="wb-pill wb-pill-orange !px-7 !py-4 !text-[16px]">
              Get started free
              <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </Link>
            <Link href="/book-a-call" className="wb-pill wb-pill-outline !px-7 !py-4 !text-[16px]">
              Book a call
            </Link>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
