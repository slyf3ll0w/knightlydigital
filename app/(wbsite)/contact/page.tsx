import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Mail, MessageSquare, Phone, PhoneCall, Users } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBContactLanding from "@/components/wb/WBContactLanding";
import WBCta from "@/components/wb/WBCta";
import WBEmbedForm from "@/components/wb/WBEmbedForm";
import WBScribble from "@/components/wb/WBScribble";
import WBSplitHero from "@/components/wb/WBSplitHero";
import { WB_DAY_PHOTOS, WB_EMAIL, WB_EMAIL_HREF, WB_PHONE } from "@/lib/wb-site";

export const metadata: Metadata = {
  title: "Contact",
  description: `Call WorkBench at ${WB_PHONE.display} or email ${WB_EMAIL}. Questions about the software, pricing, or getting your company set up.`,
};

/**
 * Contact (redesign 2026-11-19, David: "besides the hero, needs some
 * pizzazz"): the ways to reach us as solid cards with the phone up front,
 * the message form in its own panel beside a coded copy of where the
 * message lands (WorkBench's own leads), and a blue band for booking a
 * walkthrough instead.
 */

const CARD = "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";
const H2 = "text-[2.2rem] leading-[1.05] sm:text-[3.2rem]";

function Tile({ icon: Icon }: { icon: typeof Phone }) {
  return (
    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-[#0A1428] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_14px_-6px_rgba(10,20,40,0.5)]">
      <Icon className="h-5 w-5 text-[#FF8B33]" strokeWidth={2.1} />
    </span>
  );
}

const expect = [
  { icon: Users, t: "You reach the people who build and support WorkBench, not a call center." },
  { icon: PhoneCall, t: "If nobody picks up, leave your name and trade and we call you back." },
  { icon: CalendarCheck, t: "Booked calls come with a confirmation email and a link to reschedule." },
];

export default function WBContactPage() {
  return (
    <>
      <WBSplitHero
        photo={WB_DAY_PHOTOS.paid}
        mascot={{ say: <>Yes, a real person<br />picks up.</> }}
        chip={{ icon: <Phone className="h-[18px] w-[18px] text-[#F86A0A]" strokeWidth={2.2} />, title: WB_PHONE.display, sub: "Toll-free. A person answers." }}
      >
        <h1 className="mt-3 text-4xl font-extrabold leading-[1.1] sm:text-5xl">Talk to a person.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-gray-600 lg:mx-0">
          Questions about how WorkBench works, what it costs, or whether it fits
          your trade. Call or email and you reach the people who build and
          support it.
        </p>
      </WBSplitHero>

      {/* ── The ways to reach us: the phone up front, email and the app beside it ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
          <h2 className={`max-w-3xl ${H2}`}>
            However you like it, <span className="text-[#0B57D8]">a person is on the other end.</span>
          </h2>
          <AnimateIn className="mt-12">
            <div className="wb-stagger grid gap-5 lg:grid-cols-[1.2fr_1fr]">
              <a
                href={WB_PHONE.href}
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl bg-[#0A1428] p-7 text-white shadow-[0_2px_0_rgba(10,20,40,0.15),0_30px_50px_-28px_rgba(10,20,40,0.7)] sm:p-9 lg:row-span-2"
              >
                <div>
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#F86A0A]">
                    <Phone className="h-6 w-6 text-white" strokeWidth={2.2} />
                  </span>
                  <p className="mt-8 text-[17px] font-bold text-white/70">Call us</p>
                  <p className="mt-1 text-[2.1rem] font-black leading-none tracking-[-0.03em] sm:text-[3.4rem]">{WB_PHONE.display}</p>
                  <p className="mt-4 max-w-sm text-[16px] leading-relaxed text-white/70">
                    Toll-free. Tap to call from your phone, and you reach the people who build and support WorkBench.
                  </p>
                </div>
                <span className="wb-pill wb-pill-orange mt-10 self-start !px-7 !py-4 !text-[16px]">
                  Call now
                  <ArrowRight className="h-[18px] w-[18px] transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                </span>
              </a>

              <a href={WB_EMAIL_HREF} className={`group flex gap-5 p-7 ${CARD}`}>
                <Tile icon={Mail} />
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold text-gray-500">Email</span>
                  <span className="mt-1 block break-words text-[21px] font-extrabold text-[#0A1428] group-hover:text-[#0B57D8]">
                    {WB_EMAIL.split("@")[0]}@<wbr />
                    {WB_EMAIL.split("@")[1]}
                  </span>
                  <span className="mt-2 block text-[15px] leading-relaxed text-gray-600">
                    For anything that is easier to write down, including screenshots.
                  </span>
                </span>
              </a>

              <div className={`flex gap-5 p-7 ${CARD}`}>
                <Tile icon={MessageSquare} />
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold text-gray-500">Already a customer?</span>
                  <span className="mt-1 block text-[21px] font-extrabold text-[#0A1428]">Message us from the app</span>
                  <span className="mt-2 block text-[15px] leading-relaxed text-gray-600">
                    Log in and open Help Center from the menu, then Report a bug or Suggest a feature. It reaches the same team.
                  </span>
                  <Link href="/app/login" className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-bold text-[#0B57D8] hover:underline">
                    Log in
                    <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                  </Link>
                </span>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── The message: where it goes, and the form in its own panel ── */}
      <section id="message" className="scroll-mt-24 bg-[#F5F7FA]">
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-start gap-14 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div className="lg:sticky lg:top-28">
            <h2 className={H2}>
              Send a message. <span className="text-[#F86A0A]">Watch where it goes.</span>
            </h2>
            <p className="mt-6 max-w-md text-[18px] leading-relaxed text-gray-600">
              Tell us a little about your business and what you need. It lands in WorkBench&apos;s own leads, the same board our
              customers use, and we reply by email, or by phone if you leave a number.
            </p>
            <AnimateIn className="mt-12">
              <WBContactLanding />
            </AnimateIn>
          </div>
          <AnimateIn className="relative">
            <div className={`p-5 sm:p-8 ${CARD}`}>
              <p className="text-[22px] font-black tracking-[-0.02em] text-[#0A1428]">Send us a message</p>
              <p className="mb-5 mt-1 text-[15px] text-gray-600">A few fields, then it is on its way.</p>
              <WBEmbedForm />
            </div>
            <div className="pointer-events-none absolute -top-[92px] right-6 z-20 hidden items-end gap-1 xl:flex" aria-hidden>
              <p className="pb-3 text-right text-[15px] font-extrabold leading-snug text-[#10244A]">
                Fill it in
                <br />
                right here
              </p>
              <WBScribble variant="droop" delay={0.5} className="h-[78px] w-[60px] flex-none" />
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── See it first (white, before the blue closing band) ── */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <h2 className={H2}>
              Want to see it <span className="text-[#0B57D8]">before you sign up?</span>
            </h2>
            <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-gray-600">
              Book a call and we will walk you through the software on a screen share, using your trade and your kind of jobs, and
              set your company up with you. If it is not a fit, we will tell you.
            </p>
            <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-gray-600">
              If you are ready to start, the sign-up takes a few minutes and your account opens today.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/book-a-call" className="wb-pill wb-pill-orange !px-7 !py-4 !text-[16px]">
                Book a call
                <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </Link>
              <Link href="/apply" className="wb-pill wb-pill-outline !px-7 !py-4 !text-[16px]">
                Get started
              </Link>
            </div>
          </div>
          <AnimateIn>
            <div className={`p-7 text-[#0A1428] sm:p-8 ${CARD}`}>
              <p className="text-[22px] font-black tracking-[-0.02em]">What to expect</p>
              <ul className="wb-stagger mt-6 space-y-5">
                {expect.map(({ icon, t }) => (
                  <li key={t} className="flex items-center gap-4 text-[16px] leading-snug text-gray-700">
                    <Tile icon={icon} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </AnimateIn>
        </div>
      </section>

      <WBCta
        title="Ready when you are."
        body="Sign up online in a few minutes, or call first and talk it through."
        secondary={{ label: "See every feature", href: "/features" }}
      />
    </>
  );
}
