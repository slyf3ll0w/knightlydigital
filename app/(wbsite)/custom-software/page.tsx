import type { Metadata } from "next";
import { ArrowRight, ClipboardList, Phone, UserRound, Wrench } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBCta from "@/components/wb/WBCta";
import WBCustomBuilds from "@/components/wb/WBCustomBuilds";
import WBDoodle from "@/components/wb/WBDoodle";
import WBEmbedForm from "@/components/wb/WBEmbedForm";
import { WBFaqSection } from "@/components/wb/WBFaq";
import WBMarker from "@/components/wb/WBMarker";
import WBSplitHero from "@/components/wb/WBSplitHero";
import { WB_DAY_PHOTOS, WB_PHONE } from "@/lib/wb-site";

export const metadata: Metadata = {
  title: "Custom software for your business",
  description:
    "We build workflows and systems inside WorkBench shaped to how your business runs: your steps, your forms, your reports, and connections to the tools you already use. Call, ask your account manager, or send the form.",
  alternates: { canonical: "https://workbenchfsm.com/custom-software" },
};

/**
 * Custom software (David 2026-11-19): the people who build WorkBench build
 * workflows and systems on top of it for one business. Three ways in: call,
 * an existing client's account manager, or WorkBench's own form
 * (work-bench / custom-software-inquiry, lands in WorkBench's leads).
 */


const steps = [
  { title: "Tell us how it works today", body: "A call about the job as you run it: what slows you down, what gets missed, what you do by hand." },
  { title: "We scope it with you", body: "You get a plain write-up of what we will build and a price before any work starts." },
  { title: "It shows up in your account", body: "We build it into your WorkBench and walk your team through it before it goes live." },
];

const faq = [
  {
    q: "Do I have to use WorkBench?",
    a: "Yes. What we build lives inside your WorkBench account, so it shares your clients, jobs, quotes and invoices instead of becoming one more app to log in to. The core plan is free, so there is no software bill to start.",
  },
  {
    q: "What does it cost?",
    a: "It depends on the size of the job. After the first call you get a written scope and a price up front, and nothing is built until you say yes.",
  },
  {
    q: "How long does it take?",
    a: "It depends on what we are building and, for connections, on what the other software allows. The written scope gives you a date before work starts.",
  },

  {
    q: "I'm already a client. Who do I talk to?",
    a: "Your account manager. Tell them what you have in mind and they will set up the first call. You can also call us or use the form on this page.",
  },
];

export default function WBCustomSoftwarePage() {
  return (
    <>
      <WBSplitHero
        photo={WB_DAY_PHOTOS.morning}
        chip={{
          icon: <Wrench className="h-[18px] w-[18px] text-[#F86A0A]" strokeWidth={2.2} />,
          title: "Built into WorkBench",
          sub: "By the people who make it",
        }}
      >
        <h1 className="mt-3 text-4xl font-extrabold leading-[1.08] sm:text-[3.4rem]">
          Software shaped to <WBMarker>your business.</WBMarker>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600 lg:mx-0">
          Every business has its own way of doing the job. We build workflows and
          systems into WorkBench around yours: your steps, your forms, your reports,
          and connections to the tools you already use.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
          <a href="#inquiry" className="wb-pill wb-pill-orange">
            Tell us what you need
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </a>
          <a href={WB_PHONE.href} className="wb-pill wb-pill-outline">
            <Phone className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.25} aria-hidden />
            Call {WB_PHONE.display}
          </a>
        </div>
      </WBSplitHero>

      {/* ── What we build: each kind as a before/after, by hand → a coded piece
           of WorkBench playing out (WBCustomBuilds) ── */}
      <section className="relative overflow-hidden bg-[#F5F7FA]">
        <WBDoodle word="clipboard" paper="#F5F7FA" opacity={0.06} className="-right-10 top-10 w-[300px] rotate-6 max-lg:hidden" />
        <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
          <div className="relative max-w-3xl">
            <h2 className="text-[2.2rem] leading-[1.05] sm:text-[3.2rem]">
              If you do it by hand today, <span className="text-[#F86A0A]">we can probably build it.</span>
            </h2>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-gray-600">
              Some of what we build. Pick one to see the by-hand way next to what it looks like in WorkBench.
            </p>
          </div>
          <div className="mt-14">
            <WBCustomBuilds />
          </div>
        </div>
      </section>

      {/* ── How it goes ── */}
      <section className="wb-dark relative overflow-hidden text-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <AnimateIn>
            <h2 className="max-w-2xl text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
              No surprises. <span className="text-[#FF8B33]">You see the plan and the price first.</span>
            </h2>
          </AnimateIn>
          <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {steps.map((s, i) => (
              <AnimateIn key={s.title} delay={i * 110} className="border-t border-white/20 pt-6">
                <p className="text-[19px] font-extrabold text-white">{s.title}</p>
                <p className="mt-2.5 text-[15.5px] leading-relaxed text-blue-100/80">{s.body}</p>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Three ways in, then the form ── */}
      <section id="inquiry" className="scroll-mt-24 bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <AnimateIn>
            <h2 className="text-[2.2rem] leading-[1.05] sm:text-[3.2rem]">Start with <span className="text-[#0B57D8]">a conversation.</span></h2>
            <p className="mt-5 max-w-md text-[16.5px] leading-relaxed text-gray-600">
              However you reach us, the first step is a call about how your business runs. The first call is free.
            </p>
            <ul className="mt-9 space-y-6">
              <li className="flex gap-4">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-[#0A1428] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_14px_-6px_rgba(10,20,40,0.5)]">
                  <Phone className="h-[18px] w-[18px] text-[#FF8B33]" strokeWidth={2.2} />
                </span>
                <span>
                  <span className="block text-[16.5px] font-extrabold text-gray-900">Call us</span>
                  <a href={WB_PHONE.href} className="mt-0.5 block text-[15.5px] font-bold text-[#0B57D8] hover:underline">
                    {WB_PHONE.display}
                  </a>
                </span>
              </li>
              <li className="flex gap-4">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-[#0A1428] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_14px_-6px_rgba(10,20,40,0.5)]">
                  <UserRound className="h-[18px] w-[18px] text-[#FF8B33]" strokeWidth={2.2} />
                </span>
                <span>
                  <span className="block text-[16.5px] font-extrabold text-gray-900">Already a client?</span>
                  <span className="mt-0.5 block text-[15.5px] leading-relaxed text-gray-600">
                    Reach out to your account manager and tell them what you have in mind.
                  </span>
                </span>
              </li>
              <li className="flex gap-4">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-[#0A1428] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_14px_-6px_rgba(10,20,40,0.5)]">
                  <ClipboardList className="h-[18px] w-[18px] text-[#FF8B33]" strokeWidth={2.2} />
                </span>
                <span>
                  <span className="block text-[16.5px] font-extrabold text-gray-900">Send the form</span>
                  <span className="mt-0.5 block text-[15.5px] leading-relaxed text-gray-600">
                    Tell us a little about the business and what you want built.
                  </span>
                </span>
              </li>
            </ul>
          </AnimateIn>
          <AnimateIn delay={110}>
            <div className="rounded-xl bg-white p-5 shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)] sm:p-8">
              <WBEmbedForm path="custom-software-inquiry" title="Custom Software Inquiry — WorkBench" />
            </div>
          </AnimateIn>
        </div>
      </section>

      <WBFaqSection items={faq} title="Custom work, answered" tone="gray" />

      <WBCta
        title="Not ready for custom yet?"
        body="Start on WorkBench as it is. It is free for your first users, and everything we build later sits right on top of it."
        secondary={{ label: "See every feature", href: "/features" }}
      />
    </>
  );
}
