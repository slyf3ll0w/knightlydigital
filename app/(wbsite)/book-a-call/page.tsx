import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck, CreditCard, MessageCircle, Phone, Wrench } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBCta from "@/components/wb/WBCta";
import WBEmbedForm from "@/components/wb/WBEmbedForm";
import WBFaq from "@/components/wb/WBFaq";
import WBSplitHero from "@/components/wb/WBSplitHero";
import WBScribble from "@/components/wb/WBScribble";
import { WB_DAY_PHOTOS, WB_PHONE } from "@/lib/wb-site";

export const metadata: Metadata = {
  title: "Book a call",
  description:
    "Pick a time and talk to the people who build WorkBench. We walk through the software with your trade and your jobs, and set your company up on the call.",
  alternates: { canonical: "https://workbenchfsm.com/book-a-call" },
};

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
        chip={{
          icon: <CalendarCheck className="h-[18px] w-[18px] text-[#F86A0A]" strokeWidth={2.2} />,
          title: "Pick a time",
          sub: "A person, not a call center",
        }}
      >
        <p className="wb-label justify-center lg:justify-start">Book a call</p>
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
        <div className="mt-6 hidden items-end gap-1 lg:flex" aria-hidden>
          <p className="pb-2 text-[15px] font-extrabold leading-snug text-[#10244A]">
            Booked on our own
            <br />
            booking page.
          </p>
          <WBScribble variant="loop" delay={0.6} className="h-[60px] w-[92px] rotate-[80deg]" />
        </div>
      </WBSplitHero>

      {/* ── What the call covers ── */}
      <section className="bg-[#F6F8FB]">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-14 sm:px-8 sm:py-16 md:grid-cols-3">
          {covers.map(({ icon: Icon, title, body }, i) => (
            <AnimateIn key={title} delay={i * 110} className="rounded-[1.5rem] border border-gray-200 bg-white p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
                <Icon className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
              </div>
              <p className="mt-5 text-xl font-extrabold text-gray-900">{title}</p>
              <p className="mt-2 text-[14.5px] leading-relaxed text-gray-600">{body}</p>
            </AnimateIn>
          ))}
        </div>
      </section>

      {/* ── The calendar ── */}
      <section id="calendar" className="scroll-mt-24 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-16">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Pick a time that suits you</h2>
          <p className="mt-3 text-[15.5px] leading-relaxed text-gray-600">
            Times are shown in your time zone. You get a confirmation by email
            with a link to reschedule, and a reminder before we call.
          </p>
          <div className="mt-7">
            <WBEmbedForm path="phone-call" title="Phone call — WorkBench" />
          </div>
          <p className="mt-5 text-[13.5px] leading-relaxed text-gray-500">
            This calendar is WorkBench&apos;s own booking page, the same one your
            clients would use to book you.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-16">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Before you book</h2>
          <div className="mt-7">
            <WBFaq items={faq} />
          </div>
        </div>
      </section>

      <WBCta
        title="Would rather just start?"
        body="Sign up online in a few minutes, and book the call whenever you want a hand."
        secondary={{ label: "How the pricing works", href: "/pricing" }}
      />
    </>
  );
}
