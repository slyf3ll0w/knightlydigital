import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock4, Mail, MessageSquare, Phone } from "lucide-react";
import WBCta from "@/components/wb/WBCta";
import WBHero from "@/components/wb/WBHero";
import WBScribble from "@/components/wb/WBScribble";
import { WB_EMAIL, WB_EMAIL_HREF, WB_PHONE } from "@/lib/wb-site";

export const metadata: Metadata = {
  title: "Contact — WorkBench",
  description: `Call WorkBench at ${WB_PHONE.display} or email ${WB_EMAIL}. Questions about the software, pricing, or getting your company set up.`,
};

export default function WBContactPage() {
  return (
    <>
      <WBHero>
        <div className="relative">
          <div className="absolute -bottom-20 left-[22%] hidden items-end gap-1 md:flex" aria-hidden>
            <WBScribble variant="swoop" flip delay={0.5} className="h-[56px] w-[104px] rotate-[-30deg]" />
            <p className="pb-6 text-[15px] font-extrabold leading-snug text-[#10244A]">
              Yes, a real person
              <br />
              picks up.
            </p>
          </div>
          <p className="wb-label">Contact</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.1] sm:text-5xl">
            Talk to a person.
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-gray-600">
            Questions about how WorkBench works, what it costs, or whether it fits
            your trade. Call or email and you reach the people who build and
            support it.
          </p>
        </div>
      </WBHero>

      <section className="bg-[#F6F8FB]">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-14 sm:px-8 sm:py-16 md:grid-cols-3">
          <a
            href={WB_PHONE.href}
            className="rounded-[1.5rem] border border-gray-200 bg-white p-7 transition-colors hover:border-[#0B57D8]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
              <Phone className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
            </div>
            <p className="mt-5 text-[13.5px] font-bold text-gray-500">Phone</p>
            <p className="mt-1 text-2xl font-extrabold text-gray-900">{WB_PHONE.display}</p>
            <p className="mt-2 text-[14px] leading-relaxed text-gray-600">
              Toll-free. Tap to call from your phone.
            </p>
          </a>
          <a
            href={WB_EMAIL_HREF}
            className="rounded-[1.5rem] border border-gray-200 bg-white p-7 transition-colors hover:border-[#0B57D8]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
              <Mail className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
            </div>
            <p className="mt-5 text-[13.5px] font-bold text-gray-500">Email</p>
            <p className="mt-1 break-all text-xl font-extrabold text-gray-900">{WB_EMAIL}</p>
            <p className="mt-2 text-[14px] leading-relaxed text-gray-600">
              For anything that is easier to write down, including screenshots.
            </p>
          </a>
          <div className="rounded-[1.5rem] border border-gray-200 bg-white p-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50">
              <MessageSquare className="h-5 w-5 text-[#F86A0A]" strokeWidth={2} />
            </div>
            <p className="mt-5 text-[13.5px] font-bold text-gray-500">Already a customer?</p>
            <p className="mt-1 text-xl font-extrabold text-gray-900">Message us from the app</p>
            <p className="mt-2 text-[14px] leading-relaxed text-gray-600">
              Log in and open Help &amp; Feedback in the menu. It reaches the same team.
            </p>
            <Link href="/app/login" className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-[#0B57D8] hover:underline">
              Log in
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Want to see it before you sign up?</h2>
            <p className="mt-4 text-[15.5px] leading-relaxed text-gray-600">
              Call and we will walk you through the software on a screen share, using
              your trade and your kind of jobs. If it is not a fit, we will tell you.
            </p>
            <p className="mt-4 text-[15.5px] leading-relaxed text-gray-600">
              If you are ready to start, the sign-up takes a few minutes. Every
              application is reviewed by a person, and approved companies are onboarded
              personally.
            </p>
            <Link
              href="/apply"
              className="wb-pill wb-pill-primary mt-6"
            >
              Get started
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </div>
          <div className="rounded-[1.5rem] border border-gray-200 bg-[#F6F8FB] p-7">
            <div className="flex items-center gap-3">
              <Clock4 className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
              <p className="text-[15px] font-bold text-gray-900">What to expect</p>
            </div>
            <ul className="mt-4 space-y-3 text-[14.5px] leading-relaxed text-gray-600">
              <li>You reach the people who build and support WorkBench, not a call center.</li>
              <li>If nobody picks up, leave your name and trade and we call you back.</li>
              <li>Applications are reviewed by a person within one business day.</li>
            </ul>
          </div>
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
