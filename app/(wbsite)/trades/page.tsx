import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBHero from "@/components/wb/WBHero";
import WBCta from "@/components/wb/WBCta";
import WBTradeCards from "@/components/wb/WBTradeCards";
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { FREE_PLAN_NAME, INCLUDED_SEATS } from "@/lib/plans";
import { TRADES } from "@/lib/wb-trades";

export const metadata: Metadata = {
  title: "Software for every home-service trade",
  description: `WorkBench FSM is field service management software for ${TRADES.map((t) => t.name.toLowerCase()).join(", ")} and any other company that sends people to a customer's home. Scheduling, quotes, invoicing, payments, and a client portal; the ${FREE_PLAN_NAME} plan is free for ${INCLUDED_SEATS} users, not a trial.`,
  alternates: { canonical: "https://workbenchfsm.com/trades" },
};

export default function TradesPage() {
  return (
    <>
      <WBHero className="bg-white" containerClassName="pb-8 sm:pb-10">
        <AnimateIn className="mx-auto max-w-3xl text-center">
          <p className="wb-label justify-center">Built for the trades</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.08] sm:text-5xl">
            Made for companies that send people to a customer&rsquo;s home.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600">
            Quotes are priced by the job, schedules are built around the day, and invoices
            are sent from the driveway. Pick your trade to see how a day runs on WorkBench.
          </p>
        </AnimateIn>
      </WBHero>

      <section className="bg-[#F6F8FB]">
        <div className="mx-auto max-w-6xl px-5 pb-20 pt-4 sm:px-8 sm:pb-28">
          <WBTradeCards />
          <p className="mt-10 text-center text-[15px] text-gray-600">
            Not on the list? If your work happens at a customer&rsquo;s home, it fits.{" "}
            <Link href="/features" className="inline-flex items-center gap-1 font-bold text-[#0B57D8] hover:underline">
              See every feature
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </p>
        </div>
      </section>

      <WBCta secondary={{ label: "What the free plan includes", href: FREE_PAGE_PATH }} />
    </>
  );
}
