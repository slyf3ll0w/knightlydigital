import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import WBLiveApp from "@/components/wb/WBLiveApp";
import WBNote from "@/components/wb/WBNote";
import WBTryIt from "@/components/wb/WBTryIt";
import { emptyDoc } from "@/lib/tool-doc";
import { DEMO_BOOKING_PATH, DEMO_HUB_PATH } from "@/lib/demo-company-shared";
import { INCLUDED_SEATS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Home (direction preview)",
  robots: { index: false, follow: false },
};

/**
 * DIRECTION MOCKUP (David 2026-11-19): the hero and one section of the home
 * page rebuilt for weight, to judge before touching the real home.
 *   - one voice: navy-led, the hand-drawn notes as the only flourish (no
 *     ribbon, no marker strokes, no tilt, no cycling word)
 *   - grounded, not floating: the header is docked to the top edge, the
 *     product sits ON the seam between the navy and the page, nothing drifts
 *     in on scroll (content is simply there; motion only answers a touch)
 *   - big type contrast: a very large, tight headline over quiet text
 *   - the product big and sharp (live HTML, not a shrunken screenshot)
 * Not linked from anywhere; noindex. Delete once the direction is decided.
 */
export default function WBHomePreview() {
  return (
    <>
      {/* ── Hero: a solid navy block, the app resting on its lower edge ── */}
      <section className="relative bg-[linear-gradient(180deg,#0A1428_0%,#0A1428_calc(100%-260px),#FFFFFF_calc(100%-260px))] text-white">
        <div className="mx-auto max-w-7xl px-5 pt-32 sm:px-8 sm:pt-40">
          <div className="grid items-end gap-10 lg:grid-cols-[1fr_380px] lg:gap-16">
            <h1 className="text-[3.1rem] font-black leading-[0.94] tracking-[-0.045em] sm:text-[5rem] xl:text-[6.4rem]">
              Run the whole
              <br />
              business from
              <br />
              <span className="text-[#FF8B33]">one place.</span>
            </h1>
            <div className="pb-2">
              <p className="text-[18px] leading-relaxed text-[#B4C3DE]">
                Scheduling, quotes, invoicing and payments for home-service companies. Free for your first{" "}
                {INCLUDED_SEATS} users.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Link href="/apply" className="wb-pill wb-pill-orange !px-7 !py-[1.05rem] !text-[16px]">
                  Get started free
                  <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
                </Link>
                <Link href="/book-a-call" className="inline-flex items-center gap-1.5 text-[16px] font-bold text-white hover:text-[#FFB27A]">
                  Book a call
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </Link>
              </div>
            </div>
          </div>

          <div className="relative mt-20 sm:mt-24">
            <WBNote tone="chalk" side="left" delay={0.9} length={150} className="absolute -top-16 left-[18%] z-20 hidden xl:flex">
              New bookings show up here
            </WBNote>
            <WBNote tone="chalk" side="right" delay={1.3} length={120} className="absolute -top-16 right-[14%] z-20 hidden xl:flex">
              Paid. No chasing.
            </WBNote>
            <WBLiveApp />
          </div>
        </div>
        <div className="h-20 sm:h-28" />
      </section>

      {/* ── One section: the real quote screen, big ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-5 pb-28 sm:px-8 sm:pb-36">
          <div className="border-t-[3px] border-[#0A1428] pt-14 sm:pt-20">
            <div className="grid items-end gap-8 lg:grid-cols-[1fr_380px] lg:gap-16">
              <h2 className="text-[2.6rem] font-black leading-[0.98] tracking-[-0.04em] text-[#0A1428] sm:text-[4rem] xl:text-[4.6rem]">
                Make a real quote.
                <br />
                <span className="text-[#0B57D8]">Right here.</span>
              </h2>
              <p className="pb-2 text-[17px] leading-relaxed text-gray-600">
                This is the actual quote screen from WorkBench, not a picture of it. Add a client and a line, save, and
                send it for real. Or book a visit the way your customers would.
              </p>
            </div>
            <div className="mt-14">
              <WBTryIt initialQuote={emptyDoc("estimate")} bookingPath={DEMO_BOOKING_PATH} hubPath={DEMO_HUB_PATH} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
