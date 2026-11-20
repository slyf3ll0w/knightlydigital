import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck, CreditCard, MessageCircle, Phone, Wrench } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBCta from "@/components/wb/WBCta";
import WBEmbedForm from "@/components/wb/WBEmbedForm";
import { WBFaqSection } from "@/components/wb/WBFaq";
import WBBookSlot from "@/components/wb/WBBookSlot";
import WBScribble from "@/components/wb/WBScribble";
import WBSplitHero from "@/components/wb/WBSplitHero";
import { WB_DAY_PHOTOS, WB_PHONE } from "@/lib/wb-site";

export const metadata: Metadata = {
  title: "Book a call",
  description:
    "Pick a time and talk to the people who build WorkBench. We walk through the software with your trade and your jobs, and set your company up on the call.",
  alternates: { canonical: "https://workbenchfsm.com/book-a-call" },
};

/**
 * Book a call (redesign 2026-11-19, David: "besides the hero, needs some
 * pizzazz"): what the call covers beside a coded copy of booking it
 * (WBBookSlot), then the real booking calendar in its own panel.
 */
const CARD = "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";
const H2 = "text-[2.2rem] leading-[1.05] sm:text-[3.2rem]";

const covers = [
  {
    icon: Wrench,
    title: "See it with your jobs",
    body: "A walk through the app on a screen share, using your trade and the kind of work you do, not a canned demo.",
  },
  {
    icon: CreditCard,
    title: "Leave set up",
    body: "We open your account with you, connect your payments, add your services and prices, and send the first invoice together.",
  },
  {
    icon: MessageCircle,
    title: "A straight answer on fit",
    body: "If WorkBench is not right for how you work, we will say so and point you somewhere better.",
  },
];

const faq = [
  {
    q: "Who is on the call?",
    a: "One of the people who builds and supports WorkBench. There is no sales team and no hand-off afterwards. The person you talk to is the person who answers when you have a question later.",
  },
  {
    q: "Do I need an account first?",
    a: (
      <>
        No. We can open it together on the call. If you would rather start now,{" "}
        <Link href="/apply" className="font-bold text-[#0B57D8] hover:underline">
          sign up here
        </Link>{" "}
        and bring the account to the call.
      </>
    ),
  },
  {
    q: "What should I have ready?",
    a: "Your business name, the services you offer and roughly what you charge, and a recent invoice or quote if you have one. A laptop helps for the screen share, but a phone works.",
  },
  {
    q: "Is this a sales call?",
    a: "It is a setup call. The core plan is free for your first users with no trial clock, so there is nothing to close. If a paid add-on fits what you need, we will show you what it does and what it costs, and leave the decision with you.",
  },
  {
    q: "What if none of the times work?",
    a: (
      <>
        Call {WB_PHONE.display} or send a note from the{" "}
        <Link href="/contact" className="font-bold text-[#0B57D8] hover:underline">
          contact page
        </Link>{" "}
        and we will find a time.
      </>
    ),
  },
];

export default function WBBookCallPage() {
  return (
    <>
      <WBSplitHero
        photo={WB_DAY_PHOTOS.arrive}
        mascot={{ say: <>Bring your questions.<br />I&apos;ll bring the coffee.</> }}
        chip={{
          icon: <CalendarCheck className="h-[18px] w-[18px] text-[#F86A0A]" strokeWidth={2.2} />,
          title: "Pick a time",
          sub: "A person, not a call center",
        }}
      >
        <h1 className="mt-3 text-4xl font-extrabold leading-[1.1] sm:text-5xl">
          Pick a time. We set you up.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-gray-600 lg:mx-0">
          A short call with the people who build WorkBench. We walk through the
          software with your trade and your jobs, open your account with you,
          and you hang up ready to send the first invoice.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
          <a href="#calendar" className="wb-pill wb-pill-primary">
            Pick a time
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </a>
          <a href={WB_PHONE.href} className="wb-pill wb-pill-outline">
            <Phone className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.25} aria-hidden />
            Call {WB_PHONE.display}
          </a>
        </div>
      </WBSplitHero>

      {/* ── What the call covers, beside a coded copy of booking it ── */}
      <section className="overflow-x-clip bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[1fr_auto] lg:gap-20">
          <div>
            <h2 className={H2}>
              One call. <span className="text-[#F86A0A]">You leave set up.</span>
            </h2>
            <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-gray-600">
              Pick a time on the calendar below and it is booked on the spot, with a confirmation in your inbox. Here is what we
              cover when we call.
            </p>
            <AnimateIn className="mt-10">
              <ul className="wb-stagger space-y-7">
                {covers.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-5">
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-[#0A1428] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_14px_-6px_rgba(10,20,40,0.5)]">
                      <Icon className="h-5 w-5 text-[#FF8B33]" strokeWidth={2.1} />
                    </span>
                    <span>
                      <span className="block text-[19px] font-extrabold text-[#0A1428]">{title}</span>
                      <span className="mt-1 block max-w-md text-[16px] leading-relaxed text-gray-600">{body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </AnimateIn>
          </div>
          <div className="relative w-full lg:w-[460px]">
            <WBBookSlot />
          </div>
        </div>
      </section>

      {/* ── The calendar, in its own panel ── */}
      <section id="calendar" className="scroll-mt-24 bg-[#F5F7FA]">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
          <div className="relative max-w-3xl">
            <h2 className={H2}>
              Pick a time <span className="text-[#0B57D8]">that suits you.</span>
            </h2>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-gray-600">
              Times are shown in your time zone. You get a confirmation by email with a link to reschedule, and a reminder before
              we call.
            </p>
          </div>
          <AnimateIn className="relative mt-12">
            <div className={`mx-auto max-w-3xl p-5 sm:p-8 ${CARD}`}>
              <WBEmbedForm path="phone-call" title="Phone call — WorkBench" />
            </div>
            <div className="pointer-events-none absolute -top-[96px] right-[2%] z-20 hidden items-end gap-1 xl:flex" aria-hidden>
              <p className="pb-3 text-right text-[15px] font-extrabold leading-snug text-[#10244A]">
                Pick one
                <br />
                right here
              </p>
              <WBScribble variant="droop" delay={0.5} className="h-[78px] w-[60px] flex-none" />
            </div>
          </AnimateIn>
        </div>
      </section>

      <WBFaqSection items={faq} title="Before you book" />

      <WBCta
        title="Would rather just start?"
        body="Sign up online in a few minutes, and book the call whenever you want a hand."
        secondary={{ label: "How the pricing works", href: "/pricing" }}
      />
    </>
  );
}
