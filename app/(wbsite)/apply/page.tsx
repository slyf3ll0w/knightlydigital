import { INCLUDED_SEATS } from "@/lib/plans";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { AnimateIn } from "@/components/AnimateIn";
import WBSplitHero from "@/components/wb/WBSplitHero";
import WBScribble from "@/components/wb/WBScribble";
import WBTestimonials from "@/components/wb/WBTestimonials";
import { WB_DAY_PHOTOS } from "@/lib/wb-site";
import ApplyForm from "@/components/ApplyForm";
import { socialSignInFor } from "@/lib/sign-in-options";
import { ClipboardList, ShieldCheck, Wrench } from "lucide-react";
import { paymentsGateEnabled, paymentsSetupGateEnabled } from "@/lib/payments-gate";
import { RATES } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Get started",
  description:
    `Open your WorkBench account in minutes: tell us about your business and start setting up. Free with full access for ${INCLUDED_SEATS} users, not a trial.`,
};

const verifySteps = [
  {
    icon: ClipboardList,
    step: "Step 1",
    title: "Tell us about your business",
    body: "The application below creates your account on the spot. A person reviews every application within a business day — WorkBench moves real money, so we check that every company on it is a real business.",
  },
  {
    icon: ShieldCheck,
    step: "Step 2",
    title: "Verify payments",
    body: "A one-time payment verification (the same KYC check every payments provider runs) — about 10 minutes. Your account opens as soon as you complete it; card and ACH switch on when underwriting approves you.",
  },
  {
    icon: Wrench,
    step: "Step 3",
    title: "Set up your account",
    body: "You're in: add your prices, your team, and your clients right away. Until your application and underwriting are both approved the account is provisional — if we can't approve it, access closes.",
  },
];

// Square (lib/payments-gate.ts paymentsSetupGateEnabled): sign up, set up
// payments, you're in — the flow since 2026-11-03.
const setupSteps = [
  {
    icon: ClipboardList,
    step: "Step 1",
    title: "Create your account",
    body: "Your name, your business, a password. The form below opens the account on the spot — nothing to wait for.",
  },
  {
    icon: ShieldCheck,
    step: "Step 2",
    title: "Set up getting paid",
    body: `Pick who pays the card fee — your client at checkout (${RATES.serviceFee.card} per card payment) or you (${RATES.companyPaid.card}) — and connect your Square account. No Square yet? Creating one takes a few minutes.`,
  },
  {
    icon: Wrench,
    step: "Step 3",
    title: "You're in",
    body: "Add your prices, your team and your clients. Every quote, invoice and booking can be paid by card or bank from day one.",
  },
];

// Neither gate (Finix closed, no Square credentials): straight in.
const plainSteps = [
  {
    icon: ClipboardList,
    step: "Step 1",
    title: "Create your account",
    body: "The form below opens your account on the spot and takes you straight to your dashboard.",
  },
  {
    icon: ShieldCheck,
    step: "Step 2",
    title: "Set up payments later",
    body: "Online card and bank payments open up from Settings once your account is ready for them.",
  },
  {
    icon: Wrench,
    step: "Step 3",
    title: "Set up your account",
    body: "You're in: add your prices, your team, and your clients right away.",
  },
];

export default async function WBApplyPage() {
  const ua = (await headers()).get("user-agent");
  const verifyPayments = paymentsGateEnabled();
  const setupPayments = !verifyPayments && paymentsSetupGateEnabled();
  const steps = verifyPayments ? verifySteps : setupPayments ? setupSteps : plainSteps;
  return (
    <>
      {/* ── Hero ── */}
      <WBSplitHero
        photo={WB_DAY_PHOTOS.morning}
        chip={{
          icon: <ShieldCheck className="h-[18px] w-[18px] text-[#F86A0A]" strokeWidth={2.2} />,
          title: "Opens today",
          sub: setupPayments ? "Account, payments, in — about five minutes" : "No waiting on an invite",
        }}
      >
        <h1 className="text-4xl font-extrabold leading-[1.08] sm:text-5xl">Get started with WorkBench</h1>
        <p className="mx-auto mt-6 max-w-2xl text-[16.5px] leading-relaxed text-gray-600 lg:mx-0">
          Your account opens today — no waiting on an invite.{" "}
          {verifyPayments
            ? "Because card and ACH payments are built into everything WorkBench does, getting started has two quick verification steps built in: a short application (a person reads every one) and the standard payment check every processor requires."
            : setupPayments
              ? "Card and bank payments are built into everything WorkBench does, so signing up ends with a quick payment setup: pick who pays the card fee, connect your Square account, and you're in."
              : "Fill out the short form and you're in."}
        </p>
        <div className="mt-6 hidden items-end gap-1 lg:flex" aria-hidden>
          <p className="pb-2 text-[15px] font-extrabold leading-snug text-[#10244A]">Three steps,
            <br />
            then you are in</p>
          <WBScribble variant="loop" delay={0.6} className="h-[60px] w-[92px] rotate-[80deg]" />
        </div>
      </WBSplitHero>

      {/* ── The three steps ── */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map(({ icon: Icon, step, title, body }, i) => (
            <AnimateIn key={title} delay={i * 110}>
              <div className="h-full rounded-[1.5rem] border border-gray-200 bg-white p-7">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${i === 1 ? "bg-orange-50" : "bg-blue-50"}`}>
                  <Icon className={`h-[18px] w-[18px] ${i === 1 ? "text-[#F86A0A]" : "text-[#0B57D8]"}`} strokeWidth={2} />
                </div>
                <p className="mt-5 text-[13px] font-bold text-gray-500">{step}</p>
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
          <ApplyForm social={socialSignInFor(ua)} verifyPayments={verifyPayments} setupPayments={setupPayments} />
        </AnimateIn>
      </section>

      <WBTestimonials />
    </>
  );
}
