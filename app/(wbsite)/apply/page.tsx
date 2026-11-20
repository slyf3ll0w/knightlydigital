import { INCLUDED_SEATS } from "@/lib/plans";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { AnimateIn } from "@/components/AnimateIn";
import WBSplitHero from "@/components/wb/WBSplitHero";
import WBScribble from "@/components/wb/WBScribble";
import WBTestimonials from "@/components/wb/WBTestimonials";
import { WB_DAY_PHOTOS, WB_PHONE } from "@/lib/wb-site";
import ApplyForm from "@/components/ApplyForm";
import { socialSignInFor } from "@/lib/sign-in-options";
import { ClipboardList, FileText, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import WBApplyPreview from "@/components/wb/WBApplyPreview";
import WBDoodle from "@/components/wb/WBDoodle";
import { paymentsGateEnabled, paymentsSetupGateEnabled } from "@/lib/payments-gate";
import { RATES } from "@/lib/plans";
import { draftPrefill } from "@/lib/tool-drafts";
import { senderFromCookie } from "@/lib/tool-send";

export const metadata: Metadata = {
  title: "Get started",
  description:
    `Open your WorkBench account in minutes: tell us about your business and start setting up. Free with full access for ${INCLUDED_SEATS} users, not a trial.`,
};

const CARD = "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";

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
    body: `Pick who pays the card fee — your client at checkout (${RATES.serviceFee.card} per card payment) or you (${RATES.companyPaid.card}) — then create your Square account on WorkBench's rates for it. A few minutes, and your money goes straight to your own Square account.`,
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

export default async function WBApplyPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const ua = (await headers()).get("user-agent");
  // A free-tool document on its way in (lib/tool-drafts.ts): pre-fill the
  // business details; the apply API claims the draft once the company exists.
  const draft = await draftPrefill((await searchParams).draft);
  // No draft, but this browser verified an address to email a free-tool
  // document (lib/tool-send.ts): start the form with it.
  const toolSender = draft ? null : await senderFromCookie((await headers()).get("cookie")).catch(() => null);
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
          <WBScribble variant="droop" delay={0.6} className="h-[80px] w-[62px] flex-none" />
        </div>
      </WBSplitHero>

      {/* ── The steps and a peek at the account beside the form, on one
           light band (facelift 2026-11-19) ── */}
      <section className="relative overflow-hidden bg-[#F5F7FA]">
        <WBDoodle word="clipboard" paper="#F5F7FA" opacity={0.05} className="-left-20 bottom-10 w-[300px] -rotate-6 max-lg:hidden" />
        <div className="relative mx-auto grid max-w-6xl items-start gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[380px_1fr] lg:gap-14">
          <aside className="space-y-6 lg:sticky lg:top-28">
            <AnimateIn>
              <div className={`p-6 sm:p-7 ${CARD}`}>
                <p className="text-[22px] font-black tracking-[-0.02em] text-[#0A1428]">How it goes</p>
                <ol className="wb-stagger mt-6">
                  {steps.map(({ icon: Icon, step, title, body }, i) => (
                    <li key={title} className="relative flex gap-4 pb-7 last:pb-0">
                      {i < steps.length - 1 && <span className="absolute left-[21px] top-12 bottom-1 w-[2px] rounded bg-[#E3E6EC]" aria-hidden />}
                      <span
                        className={`relative flex h-11 w-11 flex-none items-center justify-center rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_14px_-6px_rgba(10,20,40,0.5)] ${i === 0 ? "bg-[#F86A0A]" : "bg-[#0A1428]"}`}
                      >
                        <Icon className={`h-5 w-5 ${i === 0 ? "text-white" : "text-[#FF8B33]"}`} strokeWidth={2.1} />
                      </span>
                      <span className="min-w-0 pt-0.5">
                        <span className="sr-only">{step}: </span>
                        <span className="block text-[16.5px] font-extrabold text-[#0A1428]">{title}</span>
                        <span className="mt-1 block text-[14.5px] leading-relaxed text-gray-600">{body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </AnimateIn>
            <AnimateIn className="hidden sm:block" delay={120}>
              <p className="mb-3 px-1 text-[15px] font-extrabold text-[#10244A]">The first thing you see when you&apos;re in</p>
              <WBApplyPreview />
            </AnimateIn>
          </aside>

          <div className="min-w-0">
            {draft && (
              <p className={`mb-5 flex items-center gap-3 px-5 py-4 text-[15px] text-gray-700 ${CARD}`}>
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#0A1428]">
                  <FileText className="h-[18px] w-[18px] text-[#FF8B33]" strokeWidth={2.1} />
                </span>
                Your {draft.kind === "estimate" ? "estimate" : "invoice"} is coming with you. It will be waiting in the account the moment it opens.
              </p>
            )}
            {/* The form keeps its own markup and logic (components/ApplyForm.tsx);
                only its outer surface is restyled here to match the solid cards. */}
            <div className="[&>div]:!rounded-xl [&>div]:!border-transparent [&>div]:shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_30px_50px_-26px_rgba(10,20,40,0.4)] [&>form]:!rounded-xl [&>form]:!border-transparent [&>form]:shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_30px_50px_-26px_rgba(10,20,40,0.4)]">
              <ApplyForm
                social={socialSignInFor(ua)}
                verifyPayments={verifyPayments}
                setupPayments={setupPayments}
                initial={draft ? { companyName: draft.companyName, email: draft.email, phone: draft.phone } : toolSender ? { email: toolSender.email } : undefined}
                draftId={draft?.id}
              />
            </div>
            <p className="mt-5 px-1 text-[15px] text-gray-600">
              Rather talk it through first?{" "}
              <Link href="/book-a-call" className="font-bold text-[#0B57D8] hover:underline">
                Book a free setup call
              </Link>{" "}
              or call{" "}
              <a href={WB_PHONE.href} className="font-bold text-[#0B57D8] hover:underline">
                {WB_PHONE.display}
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <WBTestimonials />
    </>
  );
}
