import type { Metadata } from "next";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import WBPricing from "@/components/wb/WBPricing";
import { ArrowRight, CreditCard, HandCoins, Puzzle, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing — WorkBench",
  description:
    "WorkBench is free: every essential feature, unlimited users, no trial clock. The software is funded by built-in payment processing at 2.9% + 30¢ per transaction.",
};

export default function WBPricingPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="wb-grid-paper pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pt-16 sm:px-8 sm:pt-24">
          <AnimateIn>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">
              Free. <span className="text-[#0B57D8]">We&apos;re not kidding.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-gray-600">
              No per-seat pricing, no monthly plan, no feature tiers, no
              14-day countdown. Pick annual or monthly billing below — the
              difference is a joke, and the joke is the pricing model.
            </p>
          </AnimateIn>
        </div>
      </section>

      {/* ── The card ── */}
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
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
                So how is this free?
              </h2>
              <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-gray-600">
                Payments. WorkBench has card and ACH processing built into
                every quote, invoice, and booking, at a flat{" "}
                <span className="font-bold text-gray-900">
                  2.9% + 30¢ per transaction
                </span>
                . When your clients pay you through WorkBench, a small slice
                of that processing fee is what funds the software.
              </p>
              <p className="mt-4 max-w-lg text-[15.5px] leading-relaxed text-gray-600">
                That means we only make money when you do. There&apos;s no
                incentive to nickel-and-dime you with seats and tiers — our
                incentive is that WorkBench runs your day so well that
                getting paid through it is the obvious move.
              </p>
            </AnimateIn>
            <ul className="grid content-center gap-5">
              {[
                {
                  icon: CreditCard,
                  title: "One flat rate",
                  body: "2.9% + 30¢ per successful transaction. No monthly fees, no minimums, no charge on failed payments.",
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
              The essentials are free. Forever.
            </h2>
          </AnimateIn>
          <AnimateIn delay={120}>
            <p className="text-[15.5px] leading-relaxed text-gray-600">
              Everything a service business needs to run — clients,
              scheduling, quotes, invoices, payments, the client portal, team
              chat, Atlas — is in the free plan, and that&apos;s permanent.
              We will never move an essential feature behind a paywall.
            </p>
            <p className="mt-4 text-[15.5px] leading-relaxed text-gray-600">
              Down the road, WorkBench will likely offer a{" "}
              <span className="font-bold text-gray-900">paid add-on tier</span>{" "}
              for power extras beyond the essentials. If we do, it will be
              exactly that — an add-on. Nothing you rely on today gets taken
              away or metered. The free plan is the product, not the demo.
            </p>
          </AnimateIn>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-16 sm:px-8 md:flex-row md:items-center">
          <AnimateIn>
            <h2 className="text-2xl font-extrabold sm:text-3xl">
              Sounds fair? It is.
            </h2>
            <p className="mt-2 text-[15px] text-gray-500">
              WorkBench is invite-only — tell us about your business and
              we&apos;ll take it from there.
            </p>
          </AnimateIn>
          <AnimateIn delay={120}>
            <Link
              href="/apply"
              className="wb-btn-tool inline-flex items-center gap-2 rounded-lg bg-[#0B57D8] px-6 py-3 text-[15px] font-bold text-white"
            >
              Apply for access
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
