import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BellRing, CalendarCheck, Check, ClipboardSignature, CloudOff, Send, TrendingUp } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import { WBFaqSection } from "@/components/wb/WBFaq";
import WBAtlasShowcase from "@/components/wb/WBAtlasShowcase";
import WBIntegrationsHub from "@/components/wb/WBIntegrationsHub";
import WBLiveApp from "@/components/wb/WBLiveApp";
import WBAppJourney from "@/components/wb/WBAppJourney";
import WBDoodle from "@/components/wb/WBDoodle";
import WBInsights from "@/components/wb/WBInsights";
import WBTeamDemo from "@/components/wb/WBTeamDemo";
import WBMarker from "@/components/wb/WBMarker";
import WBPhoneStack from "@/components/wb/WBPhoneStack";
import WBOdometer from "@/components/wb/WBOdometer";
import WBReceipt from "@/components/wb/WBReceipt";
import { ASSISTANT_NAME } from "@/lib/wb-assistant";
import WBScribble from "@/components/wb/WBScribble";
import WBVideo from "@/components/wb/WBVideo";
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { APP_STORE_URL, PLAY_STORE_URL, WB_PHONE } from "@/lib/wb-site";
import { EXTRA_SEAT_CENTS, FREE_PLAN_NAME, INCLUDED_SEATS, PLANS, PROCESSING_RATES, RATES_SENTENCE, formatCents } from "@/lib/plans";
import { loadVolume } from "@/lib/wb-volume";

export const metadata: Metadata = {
  title: { absolute: "WorkBench FSM — Free field service management software" },
  alternates: { canonical: "https://workbenchfsm.com/" },
  description:
    `WorkBench FSM is field service management software for home-service companies: scheduling, quoting, invoicing, and payments. Online booking, dispatch, a client portal, team chat, Atlas (an AI assistant you can talk to hands-free), and native iPhone and Android apps. The ${FREE_PLAN_NAME} plan is free for ${INCLUDED_SEATS} users with full access, not a trial; extra users are ${formatCents(EXTRA_SEAT_CENTS)} a month, and optional add-ons cover a phone line, unlimited users, and job photos.`,
};
// The counter reads real totals (lib/wb-volume.ts, cached an hour).
export const revalidate = 3600;

/**
 * The home page, "heavy" redesign (David 2026-11-19, built at /wb/preview
 * and promoted here once he signed off). Navy/blue bands for the big
 * moments, light pages with solid white cards between them, the real
 * product (coded copies of the app) doing the selling, hand-drawn notes and
 * faint hand-drawn backgrounds. Sections follow the agreed selling points:
 *   hero → free, not a trial → know your numbers → the assistant → the
 *   mobile app → one job's path (win the work) → works with → from the
 *   field → the counter (hidden until real volume) → pricing → FAQ.
 * Rules for the look: docs/site-design.md + feedback in memory.
 */
const faqItems = [
  {
    q: "Is WorkBench really free?",
    a: (
      <p>
        The {FREE_PLAN_NAME} plan is. Every essential feature for{" "}
        {INCLUDED_SEATS} users, with full access, no trial clock, and no credit
        card required. Extra users are{" "}
        {formatCents(EXTRA_SEAT_CENTS)} a month each, and three optional add-ons
        (a business phone line, unlimited users with the ops tools, and job
        photos) are priced flat per company. The core is funded by built-in
        payment processing: when a client pays an invoice through WorkBench, a
        small slice of the flat processing fee is what keeps the lights on. The
        full story is on the{" "}
        <Link href={FREE_PAGE_PATH} className="font-semibold text-[#0B57D8] hover:underline">
          free plan page
        </Link>{" "}
        and the full breakdown is on the{" "}
        <Link href="/pricing" className="font-semibold text-[#0B57D8] hover:underline">
          pricing page
        </Link>
        .
      </p>
    ),
  },
  {
    q: "What does payment processing cost?",
    a: (
      <p>
        {RATES_SENTENCE}
      </p>
    ),
  },
  {
    q: "Do I have to take card payments through WorkBench?",
    a: (
      <p>
        No. Cash and check payments can be recorded on any invoice, and the{" "}
        {FREE_PLAN_NAME} plan stays free either way. Card and ACH are built in for when you
        want them, on invoices, quotes with deposits, and online bookings.
      </p>
    ),
  },
  {
    q: "How does getting started work?",
    a: (
      <p>
        Create your account, then set up getting paid: pick who pays the card
        fee and connect your Square account (Square runs the same KYC check
        every payments provider does, and creating an account there takes a
        few minutes if you have none). The app opens the moment it is
        connected, and most companies are quoting and scheduling the same day
        they sign up. If you would rather talk first, call{" "}
        <a href={WB_PHONE.href} className="font-semibold text-[#0B57D8] hover:underline">
          {WB_PHONE.display}
        </a>
        .
      </p>
    ),
  },
  {
    q: "Is there a mobile app?",
    a: (
      <p>
        Yes. Native apps for iPhone on the{" "}
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener"
          className="font-semibold text-[#0B57D8] hover:underline"
        >
          App Store
        </a>{" "}
        and Android on{" "}
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener"
          className="font-semibold text-[#0B57D8] hover:underline"
        >
          Google Play
        </a>
        , with push notifications for requests, bookings, chat, and payments,
        plus offline viewing of the schedule when a job site has no signal. The
        web app works on any device.
      </p>
    ),
  },
  {
    q: "Will features I use ever move behind a paywall?",
    a: (
      <p>
        No. The features on your plan stay on your plan. If our pricing or
        packaging ever changes, existing customers are grandfathered in on
        everything they already use.
      </p>
    ),
  },
  {
    q: "What does FSM stand for?",
    a: (
      <p>
        Field service management. WorkBench FSM is the full name of the
        product, and it is how the app is listed on the App Store and Google
        Play. On this site we usually just say WorkBench. It is not related to
        any other software called Workbench.
      </p>
    ),
  },
  {
    q: "Can I talk to Atlas instead of typing?",
    a: (
      <p>
        Yes. Tap the microphone in the app and talk the way you&rsquo;d talk to
        an office manager: &ldquo;who still owes me money?&rdquo;, &ldquo;move
        Tuesday&rsquo;s jobs to Friday.&rdquo; Atlas answers out loud within a
        beat, you can interrupt it, and anything that goes to a client is read
        back to you before it is sent. Pick from several voices and accents.
        Voice is on every account and uses a few Atlas tokens a minute. See{" "}
        <Link href="/features/atlas" className="font-semibold text-[#0B57D8] hover:underline">
          Atlas
        </Link>
        .
      </p>
    ),
  },
  {
    q: "Can I get my data out?",
    a: (
      <p>
        Any time. There are no contracts, and your clients, jobs, quotes, and
        invoices export whenever you want them.
      </p>
    ),
  },
];


const BG = {
  hero: "linear-gradient(180deg, #10214A 0%, #12306E 55%, #1847AE 100%)",
  deep: "#0E1C3F",
  blue: "linear-gradient(135deg, #0B57D8 0%, #2E6FF2 100%)",
  atlas: "linear-gradient(135deg, #0A45B8 0%, #0B57D8 55%, #2563EB 100%)",
};
const CARD = "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";
const H2 = "text-[2.3rem] font-black leading-[1.02] tracking-[-0.035em] sm:text-[3.6rem]";
const ghost = "wb-pill !border !border-white/25 !px-7 !py-4 !text-[16px] text-white hover:!border-white/60";

function Note({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`pointer-events-none absolute z-20 hidden items-end gap-1 xl:flex ${className}`} aria-hidden>
      <p className="pb-3 text-right text-[15px] font-extrabold leading-snug text-[#10244A]">{children}</p>
      <WBScribble variant="droop" delay={0.5} className="h-[78px] w-[60px] flex-none" />
    </div>
  );
}

export default async function WBHomePage() {
  const card = PROCESSING_RATES.companyPaid;
  const volume = await loadVolume();
  return (
    <div className="bg-white text-[#0A1428]">
      {/* ── 1. Hero (navy): the promise left, the real app large on the right,
           running off the edge of the screen and the bottom of the hero. ── */}
      <section data-wb-hero className="relative overflow-hidden text-white" style={{ background: BG.hero }}>
        <div className="mx-auto grid max-w-7xl gap-12 px-5 pt-32 sm:px-8 sm:pt-40 lg:grid-cols-[600px_1fr] lg:gap-12">
          <div className="wb-stagger-load lg:pb-24 lg:pt-4">
            <h1 className="text-[3rem] font-black leading-[0.96] tracking-[-0.045em] sm:text-[4.2rem] xl:text-[4.6rem]">
              Run the whole business from <span className="text-[#FF8B33]">one place.</span>
            </h1>
            <p className="mt-7 max-w-md text-[18px] leading-relaxed text-white/70">
              Scheduling, quotes, invoicing and payments for home-service companies, in one app your whole crew shares.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link href="/apply" className="wb-pill wb-pill-orange !px-7 !py-4 !text-[16px]">
                Get started free
                <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </Link>
              <Link href="/book-a-call" className={ghost}>
                Book a call
              </Link>
            </div>
            <p className="mt-8 text-[16px] font-semibold text-white/75">
              <WBMarker delay={1.1}>Free</WBMarker> for your first {INCLUDED_SEATS} users. No credit card.
            </p>
          </div>
          <div className="relative h-[400px] sm:h-[520px] lg:h-auto">
            <div className="absolute left-0 top-0 w-[1000px] origin-top-left overflow-hidden rounded-tl-xl shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_40px_80px_-30px_rgba(0,0,0,0.7)] lg:top-6 lg:scale-[1.12] xl:w-[1080px]">
              <WBLiveApp />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Free, not a trial (light), over a faint hand-drawn "Free" ── */}
      <section className="relative overflow-hidden bg-white">
        <WBDoodle word="free" paper="#FFFFFF" opacity={0.06} className="right-4 top-1/2 w-[600px] -translate-y-1/2 -rotate-6 max-lg:hidden" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[auto_1fr] lg:gap-20">
          <AnimateIn>
            <p className="wb-stamp text-center text-[9rem] font-black leading-none tracking-[-0.06em] text-[#F86A0A] sm:text-[13rem] lg:text-left">$0</p>
          </AnimateIn>
          <AnimateIn>
            <h2 className={H2}>
              Free. <span className="text-[#64748B]">Not a trial.</span>
            </h2>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-gray-600">
              The {FREE_PLAN_NAME} plan gives your first {INCLUDED_SEATS} users everything they need to run the business, for as long as
              you want it. We earn a small part of the card fee when your clients pay you, so free stays free.
            </p>
            <ul className="wb-stagger mt-8 grid gap-3 sm:grid-cols-2">
              {["No credit card to start", "No clock running out", "No features held back", `Extra users ${formatCents(EXTRA_SEAT_CENTS)} a month`].map((f) => (
                <li key={f} className="flex items-center gap-3 text-[16px] font-bold">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#F86A0A] text-white">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </AnimateIn>
          <Note className="right-[24%] top-6">
            Really.
            <br />
            No catch.
          </Note>
        </div>
      </section>

      {/* ── 3. The crew (light gray): add people in a minute, the first
           ${INCLUDED_SEATS} free (David 2026-11-20). A coded Team & roles screen
           adds a tech while the seat line counts against the free ones. ── */}
      <section className="bg-[#F5F7FA]">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className={H2}>
              Bring the whole crew. <span className="text-[#0B57D8]">Your first {INCLUDED_SEATS} are free.</span>
            </h2>
            <p className="mt-6 max-w-md text-[18px] leading-relaxed text-gray-600">
              Add your techs, office and sales people in a minute. Each gets their own sign-in on the phone app or the computer,
              and a role that shows them only what they need: techs see their own jobs and schedule, never your prices.
            </p>
            <p className="mt-6 max-w-md text-[16px] leading-relaxed text-gray-600">
              {INCLUDED_SEATS} users are included free. Each extra person is {formatCents(EXTRA_SEAT_CENTS)} a month, or go unlimited with {PLANS.SHOP.name}.
            </p>
          </div>
          <WBTeamDemo included={INCLUDED_SEATS} extraSeat={`${formatCents(EXTRA_SEAT_CENTS)}/mo`} proName={PLANS.SHOP.name} />
        </div>
      </section>

      {/* ── 4. The assistant (blue band): what it handles, and a live demo that
           cycles through a dozen real requests. Name from lib/wb-assistant.ts. ── */}
      <section className="relative overflow-hidden text-white" style={{ background: BG.atlas }}>
        <WBDoodle word="voice" ink="#FFFFFF" opacity={0.1} className="-left-10 bottom-[-3rem] w-[460px] -rotate-6 max-lg:hidden" />
        <WBAtlasShowcase>
          <h2 className={H2}>
            Just say it. <span className="text-[#BFD6FF]">{ASSISTANT_NAME} gets it done.</span>
          </h2>
          <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-white/85">
            {ASSISTANT_NAME} is the assistant built into WorkBench. Talk to it from the truck like an office manager: the schedule,
            quotes, money, clients and leads. Anything that goes to a client or moves money waits for your OK.
          </p>
        </WBAtlasShowcase>
      </section>

      {/* ── 5. The mobile app (light): three real screens; pushes drop into the
           middle one, the side ones drift with the scroll ── */}
      <section className="overflow-x-clip bg-white">
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1fr_auto]">
          <div>
            <h2 className={H2}>
              The office <span className="text-[#F86A0A]">in your pocket.</span>
            </h2>
            <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-gray-600">
              Native apps for iPhone and Android, not a website squeezed onto a phone. Your crew sees the day, clocks in on the job
              and sends the invoice before they leave the driveway.
            </p>
            <ul className="mt-8 space-y-3 text-[16px] font-bold">
              {[
                { icon: BellRing, t: "Push alerts for new bookings, messages and payments" },
                { icon: CloudOff, t: "The schedule still opens when the job site has no signal" },
                { icon: CalendarCheck, t: "Clock in and out on the job, with timesheets for you" },
              ].map(({ icon: Icon, t }) => (
                <li key={t} className="flex items-center gap-3">
                  <Icon className="h-5 w-5 flex-none text-[#F86A0A]" strokeWidth={2.2} />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-10 flex flex-wrap gap-3">
              <a href={APP_STORE_URL} target="_blank" rel="noopener" aria-label="Download on the App Store">
                <Image src="/app-store-badge.svg" alt="Download on the App Store" width={150} height={50} unoptimized className="h-[50px] w-auto" />
              </a>
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener" aria-label="Get it on Google Play">
                <Image src="/google-play-badge.svg" alt="Get it on Google Play" width={168} height={50} unoptimized className="h-[50px] w-auto" />
              </a>
            </div>
          </div>
          <AnimateIn>
            <WBPhoneStack />
          </AnimateIn>
          <Note className="right-10 top-6">
            Straight from
            <br />
            the app
          </Note>
        </div>
      </section>

      {/* ── 6. Win the work (light gray): one job's real path through the app,
           over a faint hand-drawn clipboard ── */}
      <section className="relative overflow-hidden bg-[#F5F7FA]">
        <WBDoodle word="clipboard" paper="#F5F7FA" opacity={0.07} className="right-8 top-8 w-[300px] rotate-6 max-lg:hidden" />
        <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <h2 className={`max-w-3xl ${H2}`}>
            Win more of the work <span className="text-[#64748B]">that comes your way.</span>
          </h2>
          <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-gray-600">
            One job, start to finish, on the real screens: the request comes in, the quote gets signed, the job lands on the
            calendar, and the invoice gets paid, with each step handing off to the next. Tap a step to jump to it.
          </p>
          <AnimateIn className="mt-14">
            <WBAppJourney />
          </AnimateIn>
          <p className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px] text-gray-600">
            <span className="flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-[#F86A0A]" /> Booked online at real open times</span>
            <span className="flex items-center gap-2"><ClipboardSignature className="h-4 w-4 text-[#F86A0A]" /> Quotes signed from a phone</span>
            <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[#F86A0A]" /> A leads board to track who you&apos;re talking to</span>
            <span className="flex items-center gap-2"><Send className="h-4 w-4 text-[#F86A0A]" /> Follow-ups on quotes that go quiet</span>
            <Link href="/features" className="font-bold text-[#0B57D8] hover:underline">
              See every feature →
            </Link>
          </p>
        </div>
      </section>

      {/* ── 7. Works with (navy): a calm grid where logos pop in and out around
           the WorkBench mark (Railway-style) ── */}
      <section className="text-white" style={{ background: BG.deep }}>
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1fr_1.15fr]">
          <div>
            <h2 className={H2}>
              Plugs into <span className="text-[#FF8B33]">what you already use.</span>
            </h2>
            <p className="mt-6 max-w-md text-[18px] leading-relaxed text-white/70">
              Your books sync to QuickBooks, payments run through Square, jobs land on your Google Calendar, and leads come in from
              anywhere through Zapier or Make.
            </p>
          </div>
          <WBIntegrationsHub />
        </div>
      </section>

      {/* ── 7b. Know your numbers (light gray): a coded copy of what WorkBench
           adds up as you work, its charts growing in (replaces "Get paid",
           which repeated the hero, the job journey and pricing). ── */}
      <section className="bg-[#F5F7FA]">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className={H2}>
              Know which jobs <span className="text-[#0B57D8]">make you money.</span>
            </h2>
            <p className="mt-6 max-w-md text-[18px] leading-relaxed text-gray-600">
              WorkBench adds it up while you work: what came in this month, what each job really made after labor and materials,
              and which lead sources are worth paying for.
            </p>
            <p className="mt-6 max-w-md text-[16px] leading-relaxed text-gray-600">
              Log your expenses as they happen, from the supply-house run to the rent, and set the ones that repeat to log
              themselves every month. Profit is what came in minus what went out, so it is the real number.
            </p>
          </div>
          <WBInsights />
        </div>
      </section>

      {/* ── 8. From the field (light): Edan beside his video, in its own clean frame ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <AnimateIn className="grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
            <div>
              <h2 className="text-3xl font-black leading-[1.08] tracking-[-0.03em] sm:text-[2.8rem]">
                Hear it from an owner who runs the busy season on WorkBench.
              </h2>
              <div className="mt-8 flex items-center gap-4">
                <span className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-lg bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.1)]">
                  <Image src="/brand/customers/knight-light.png" alt="Knight Light Christmas Lighting logo" width={83} height={70} className="h-full w-full object-contain p-1" />
                </span>
                <span>
                  <span className="block text-[16px] font-extrabold">Edan</span>
                  <span className="block text-[14px] text-gray-500">Owner, Knight Light Christmas Lighting</span>
                </span>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl bg-black shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-28px_rgba(10,20,40,0.55)]">
              <WBVideo
                src="/video/knight-light-edan.mp4"
                poster="/video/knight-light-edan-poster.jpg"
                label="Edan from Knight Light Christmas Lighting on running installs with WorkBench"
                caption="Watch Edan's walkthrough"
              />
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── 9. The counter (blue band): REAL totals from lib/wb-volume.ts. On the
           live home it renders only once volumeShowable() is true. ── */}
      {/* SHOWN for now so David can see the live totals (2026-11-19); before
          launch, gate it again: volumeShowable(volume) && … */}
      {volume && (
        <section className="relative overflow-hidden text-white" style={{ background: BG.blue }}>
          <div className="relative mx-auto max-w-6xl px-5 py-24 text-center sm:px-8 sm:py-32">
            <h2 className={H2}>
              Running on WorkBench <span className="text-[#BFD6FF]">right now.</span>
            </h2>
            <AnimateIn className="wb-stagger mt-14 grid gap-5 md:grid-cols-2">
              <div className="relative overflow-hidden rounded-2xl bg-[#F86A0A] px-6 pb-24 pt-10 shadow-[0_2px_0_rgba(0,0,0,0.15),0_30px_50px_-28px_rgba(0,0,0,0.55)]">
                <WBOdometer value={volume.jobs} className="text-[4.4rem] font-black leading-none tracking-[-0.04em] sm:text-[6rem]" />
                <p className="mt-4 text-[18px] font-bold text-white/90">jobs done</p>
                <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="wb-scribble absolute inset-x-0 bottom-0 h-20 w-full" aria-hidden style={{ ["--wb-draw-delay" as string]: "0.6s" }}>
                  <path d="M0 70 C 40 66, 70 60, 100 62 C 140 64, 160 48, 200 44 C 240 40, 260 30, 300 26 C 340 22, 370 12, 400 6" pathLength={1} stroke="rgba(255,255,255,0.75)" strokeWidth={4} fill="none" strokeLinecap="round" />
                </svg>
              </div>
              <div className="relative overflow-hidden rounded-2xl bg-white px-6 pb-24 pt-10 text-[#0A1428] shadow-[0_2px_0_rgba(0,0,0,0.15),0_30px_50px_-28px_rgba(0,0,0,0.55)]">
                <WBOdometer value={volume.paidCents / 100} money className="text-[4.4rem] font-black leading-none tracking-[-0.04em] text-[#0B57D8] sm:text-[6rem]" />
                <p className="mt-4 text-[18px] font-bold text-gray-500">paid to businesses through WorkBench</p>
                <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="wb-scribble absolute inset-x-0 bottom-0 h-20 w-full" aria-hidden style={{ ["--wb-draw-delay" as string]: "0.9s" }}>
                  <path d="M0 72 C 50 70, 80 64, 120 58 C 160 52, 180 56, 220 42 C 260 28, 300 30, 330 20 C 360 10, 380 8, 400 4" pathLength={1} stroke="#F86A0A" strokeWidth={4} fill="none" strokeLinecap="round" />
                </svg>
              </div>
            </AnimateIn>
            <p className="mt-10 -rotate-2 text-[20px] font-extrabold text-white" aria-hidden>
              ...and counting
            </p>
          </div>
        </section>
      )}

      {/* ── 10. Pricing (light gray): the bill printed as a receipt, over a faint
           hand-drawn coin stacks. Every figure from lib/plans.ts. ── */}
      <section className="relative overflow-hidden bg-[#F5F7FA]">
        <WBDoodle word="coins" paper="#F5F7FA" opacity={0.07} className="-left-6 -bottom-6 w-[420px] -rotate-3 max-lg:hidden" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1fr_440px]">
          <div>
            <h2 className={H2}>
              Simple pricing. <span className="text-[#64748B]">The whole bill.</span>
            </h2>
            <p className="mt-6 max-w-md text-[18px] leading-relaxed text-gray-600">
              The software is free for your first {INCLUDED_SEATS} users. You pay the card fee only when a client pays you, and add-ons
              only if you want them.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/apply" className="wb-pill wb-pill-orange !px-7 !py-4 !text-[16px]">
                Get started free
                <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </Link>
              <Link href="/pricing" className="wb-pill wb-pill-outline !px-7 !py-4 !text-[16px]">
                See full pricing
              </Link>
            </div>
            <Note className="right-[29rem] top-20">
              Nothing
              <br />
              hidden.
            </Note>
          </div>
          <WBReceipt
            title="WorkBench"
            lines={[
              { label: `${FREE_PLAN_NAME} plan · ${INCLUDED_SEATS} users`, value: "$0.00" },
              { label: "Scheduling, quotes, invoices", value: "Included" },
              { label: "Online booking + client portal", value: "Included" },
              { label: "iPhone and Android apps", value: "Included" },
              { label: "Card payments", value: `${(card.cardBps / 100).toFixed(2)}% + ${card.cardFixedCents}¢`, note: "Only when a client pays you" },
              { label: "Extra users", value: `${formatCents(EXTRA_SEAT_CENTS)}/mo`, note: "Only if you add them" },
              { label: "Add-ons", value: `From $${PLANS.DISPATCH.monthlyCents / 100}/mo`, note: "Phone line, unlimited users, photos" },
            ]}
            total={{ label: "Total today", value: "$0.00", strong: true }}
            footer="No contract. Cancel anytime."
          />
        </div>
      </section>
      <WBFaqSection items={faqItems} title="Questions, answered" />
    </div>
  );
}
