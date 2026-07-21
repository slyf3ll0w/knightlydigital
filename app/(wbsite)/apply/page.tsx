import type { Metadata } from "next";
import { AnimateIn } from "@/components/AnimateIn";
import ApplyForm from "@/components/ApplyForm";
import { BadgeCheck, Landmark, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Apply for access — WorkBench",
  description:
    "WorkBench moves real money, so every company on it is verified. Tell us about your business and we'll get you set up.",
};

const trustPoints = [
  {
    icon: BadgeCheck,
    title: "Legitimate businesses only",
    body: "Every application is reviewed by a person. Real companies doing real work get in; fake storefronts and fraud don't.",
  },
  {
    icon: Landmark,
    title: "It protects your money",
    body: "Payouts, deposits, and client payments all ride the same rails. Verifying who's on them is what keeps your money moving fast.",
  },
  {
    icon: ShieldCheck,
    title: "It protects your clients",
    body: "When a client pays a WorkBench invoice, they can trust the business behind it has been checked out.",
  },
];

export default function WBApplyPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="wb-grid-paper pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pt-16 sm:px-8 sm:pt-24">
          <AnimateIn>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-5xl">
              WorkBench moves <span className="text-[#0B57D8]">real money</span>.
              So we verify who&apos;s on it.
            </h1>
            <div className="mt-6 max-w-2xl space-y-4 text-[16.5px] leading-relaxed text-gray-600">
              <p>
                Card and ACH payments are built into everything WorkBench
                does — which means every company on the platform is handling
                money that belongs to their clients and to themselves.
                That&apos;s not something we hand out to anonymous signups.
              </p>
              <p>
                So instead of an open signup form, there&apos;s an
                application. We confirm you&apos;re a legitimate business
                doing real work, the same way any payments provider would —
                and that&apos;s it. No gatekeeping, no exclusivity games.
                If you run a real service business, you&apos;re exactly who
                this is for.
              </p>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Why verification matters ── */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {trustPoints.map(({ icon: Icon, title, body }, i) => (
            <AnimateIn key={title} delay={i * 110}>
              <div className="card-lift h-full rounded-2xl border border-gray-200 bg-white p-7">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${i === 1 ? "bg-orange-50" : "bg-blue-50"}`}>
                  <Icon className={`h-[18px] w-[18px] ${i === 1 ? "text-[#F86A0A]" : "text-[#0B57D8]"}`} strokeWidth={2} />
                </div>
                <h2 className="mt-5 text-[16px] font-bold text-gray-900">{title}</h2>
                <p className="mt-2 text-[14.5px] leading-relaxed text-gray-600">{body}</p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </section>

      {/* ── Application form ── */}
      <section className="mx-auto max-w-3xl px-5 pb-20 sm:px-8">
        <AnimateIn>
          <ApplyForm />
        </AnimateIn>
      </section>
    </>
  );
}
