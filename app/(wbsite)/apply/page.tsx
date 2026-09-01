import type { Metadata } from "next";
import { AnimateIn } from "@/components/AnimateIn";
import ApplyForm from "@/components/ApplyForm";
import { ClipboardList, ShieldCheck, Wrench } from "lucide-react";

export const metadata: Metadata = {
  title: "Get started — WorkBench",
  description:
    "Open your WorkBench account in minutes: tell us about your business, verify payments, and start setting up. Free forever.",
};

const steps = [
  {
    icon: ClipboardList,
    step: "Step 1",
    title: "Tell us about your business",
    body: "The application below opens your account on the spot. A person reviews every application within a business day — WorkBench moves real money, so we check that every company on it is a real business.",
  },
  {
    icon: ShieldCheck,
    step: "Step 2",
    title: "Verify payments",
    body: "A one-time payment verification (the same KYC check every payments provider runs) — about 10 minutes. Card and ACH payments switch on the moment underwriting approves you.",
  },
  {
    icon: Wrench,
    step: "Step 3",
    title: "Set up your account",
    body: "You're in: add your prices, your team, and your clients right away. While your application is under review the account is provisional — if we can't approve it, access closes.",
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
              Get started with <span className="text-[#0B57D8]">WorkBench</span>.
            </h1>
            <div className="mt-6 max-w-2xl space-y-4 text-[16.5px] leading-relaxed text-gray-600">
              <p>
                Your account opens today — no waiting on an invite. Because
                card and ACH payments are built into everything WorkBench
                does, getting started has two quick verification steps built
                in: a short application (a person reads every one) and the
                standard payment check every processor requires.
              </p>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── The three steps ── */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map(({ icon: Icon, step, title, body }, i) => (
            <AnimateIn key={title} delay={i * 110}>
              <div className="card-lift h-full rounded-2xl border border-gray-200 bg-white p-7">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${i === 1 ? "bg-orange-50" : "bg-blue-50"}`}>
                  <Icon className={`h-[18px] w-[18px] ${i === 1 ? "text-[#F86A0A]" : "text-[#0B57D8]"}`} strokeWidth={2} />
                </div>
                <p className="mt-5 text-[12px] font-bold uppercase tracking-wide text-gray-400">{step}</p>
                <h2 className="mt-1 text-[16px] font-bold text-gray-900">{title}</h2>
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
