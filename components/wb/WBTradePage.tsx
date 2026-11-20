import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBSplitHero from "@/components/wb/WBSplitHero";
import WBAppJourney, { type JourneyJob } from "@/components/wb/WBAppJourney";
import WBAtlasShowcase from "@/components/wb/WBAtlasShowcase";
import WBBookSlot from "@/components/wb/WBBookSlot";
import WBInsights from "@/components/wb/WBInsights";
import WBPhoneStack from "@/components/wb/WBPhoneStack";
import WBVideo from "@/components/wb/WBVideo";
import WBDoodle from "@/components/wb/WBDoodle";
import WBCta from "@/components/wb/WBCta";
import { WBFaqSection, type FaqItem } from "@/components/wb/WBFaq";
import WBDemoDayShift from "@/components/wb/demos/WBDemoDayShift";
import WBDemoQuoteOptions from "@/components/wb/demos/WBDemoQuoteOptions";
import WBDemoRoute from "@/components/wb/demos/WBDemoRoute";
import WBDemoRecurring from "@/components/wb/demos/WBDemoRecurring";
import WBDemoChecklist from "@/components/wb/demos/WBDemoChecklist";
import WBDemoTimesheet from "@/components/wb/demos/WBDemoTimesheet";
import WBDemoContract from "@/components/wb/demos/WBDemoContract";
import { ACCENT_HEX, ACCENT_ON_DARK, CARD, CenterHero, DemoHero, DemoSection, H2, Related, SECTION_BG, SpecList, StepsOnBand, StepsRail, StepsRuled, Title } from "@/components/wb/WBTradeSections";
import { ASSISTANT_NAME } from "@/lib/wb-assistant";
import type { Trade } from "@/lib/wb-trades";
import type { TradeStory } from "@/lib/wb-trade-story";
import type { FeatureItem } from "@/lib/wb-features";
import type { TradeTemplate } from "@/lib/wb-tools";
import { INCLUDED_SEATS, PLANS } from "@/lib/plans";

/**
 * One /trades/<slug> page (2026-11-20). Three layouts by how the work runs
 * (lib/wb-trade-story.ts), each assembled from home-page sections, plus the
 * trade's own signature section. All demo amounts come from the trade's
 * price-book template, so a page never shows a price we did not write.
 */

const CLIENTS = ["Grace Kim", "Maria Hernandez", "Derek Olsen", "Olivia Park", "Hannah Brooks", "Marcus Bell"];
const STREETS = ["1420 Oak Hollow Dr", "88 Cedar Bend Ln", "2715 Willow Creek Ct", "604 Ridgeview Ave", "3109 Meadow Park Rd"];
const STOP_CLIENTS = ["Grace Kim", "Tom Becker", "Hannah Brooks", "Luis Ortega", "Marcus Bell"];

export default function WBTradePage({
  trade: t,
  story,
  template: tpl,
  index,
  features,
  faq,
  related,
}: {
  trade: Trade;
  story: TradeStory;
  template: TradeTemplate | undefined;
  index: number;
  features: FeatureItem[];
  faq: FaqItem[];
  related: { label: string; href: string }[];
}) {
  const accent = ACCENT_HEX[story.accent];
  const accentDark = ACCENT_ON_DARK[story.accent];
  const client = CLIENTS[index % CLIENTS.length];
  const lines = tpl?.lines ?? [];
  const base = lines.filter((l) => !l.optional);
  const opts = lines.filter((l) => l.optional);
  const biggest = [...base].sort((a, b) => b.unitPrice * b.quantity - a.unitPrice * a.quantity);
  const lead = biggest[0];

  const job: JourneyJob | undefined = lead
    ? {
        client,
        title: lead.name,
        short: lead.name,
        lines: biggest.slice(0, 2).map((l) => ({ name: l.name, qty: l.quantity, unit: l.unitPrice })),
      }
    : undefined;

  const total = biggest.slice(0, 3).reduce((a, l) => a + l.unitPrice * l.quantity, 0);
  const sig = story.signature;
  const signatureDemo = (() => {
    switch (sig.kind) {
      case "quoteOptions":
        return (
          <WBDemoQuoteOptions
            client={client}
            title={lead?.name ?? t.name}
            lines={biggest.slice(0, 3).map((l) => ({ name: l.name, qty: l.quantity, unit: l.unitPrice }))}
            options={opts.slice(0, 3).map((l) => ({ name: l.name, unit: l.unitPrice * l.quantity }))}
            pick={Math.min(sig.pick ?? 0, Math.max(0, opts.length - 1))}
            depositPct={25}
          />
        );
      case "recurring": {
        const plan = opts.find((l) => /plan|contract|quarterly|recurring|weekly/i.test(l.name)) ?? base[0];
        return (
          <WBDemoRecurring
            client={client}
            service={plan?.name ?? t.name}
            cadence={sig.cadence ?? story.cadence ?? "Every month"}
            price={plan ? plan.unitPrice : 0}
            billing="visit"
            visits={["Apr 8", "Oct 14", "Apr 7", "Oct 13"]}
          />
        );
      }
      case "checklist":
        return <WBDemoChecklist client={client} title={story.stopService ?? lead?.name ?? t.name} items={sig.items ?? []} next={story.family === "route" ? "Next Tuesday" : undefined} />;
      case "timesheet":
        return (
          <WBDemoTimesheet
            job={`${lead?.name ?? t.name} · ${client}`}
            crew={[
              { name: "Mike Delgado", role: "Owner", rate: 45, hours: [8, 7.5, 8, 6, 0] },
              { name: "Jordan Reyes", role: "Tech", rate: 28, hours: [8, 8, 7, 8, 4] },
              { name: "Sam Whitaker", role: "Tech", rate: 24, hours: [6, 8, 8, 7.5, 4] },
            ]}
          />
        );
      case "contract":
        return <WBDemoContract client={client} title={`${lead?.name ?? t.name} agreement`} clauses={sig.clauses ?? []} total={total} depositPct={story.family === "project" ? 30 : undefined} />;
      case "dayshift":
        return <WBDemoDayShift jobs={dayJobs(base, index)} urgent={story.urgent ?? { client, title: lead?.name ?? t.name }} />;
      case "booking":
        return <WBBookSlot />;
      default:
        return null;
    }
  })();

  // The signature section. Atlas and the video have their own looks.
  const signature =
    sig.kind === "atlas" ? (
      <section className="relative overflow-hidden text-white" style={{ background: SECTION_BG.blue }}>
        <WBDoodle word="voice" ink="#FFFFFF" opacity={0.1} className="-left-10 bottom-[-3rem] w-[460px] -rotate-6 max-lg:hidden" />
        <WBAtlasShowcase>
          <Title parts={sig.title} accent="#BFD6FF" />
          <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-white/85">{sig.body.replace(/\bAtlas\b/g, ASSISTANT_NAME)}</p>
        </WBAtlasShowcase>
      </section>
    ) : sig.kind === "video" ? (
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
          <div>
            <Title parts={sig.title} accent={accent} />
            <p className="mt-6 text-[18px] leading-relaxed text-gray-600">{sig.body}</p>
          </div>
          <AnimateIn className="overflow-hidden rounded-xl bg-black shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-28px_rgba(10,20,40,0.55)]">
            <WBVideo src="/video/knight-light-edan.mp4" poster="/video/knight-light-edan-poster.jpg" label="Edan from Knight Light Christmas Lighting on running installs with WorkBench" caption="Watch Edan's walkthrough" />
          </AnimateIn>
        </div>
      </section>
    ) : (
      <DemoSection
        title={sig.title}
        accent={accent}
        bg={story.family === "route" ? "bg-[#F5F7FA]" : "bg-white"}
        body={
          <>
            <p>{sig.body}</p>
            {sig.pro && <p className="mt-4 text-[15px] font-bold text-[#0B57D8]">With {PLANS.SHOP.name}</p>}
          </>
        }
        demo={signatureDemo}
        note={sig.note}
        flip={index % 2 === 1}
        wide={sig.kind === "timesheet" || sig.kind === "quoteOptions" || sig.kind === "checklist" || sig.kind === "dayshift"}
      />
    );

  const close = (
    <>
      <WBFaqSection items={faq} title={`${t.name}, answered`} />
      <Related links={related} />
      <WBCta
        title={`Run your ${t.name.toLowerCase()} business on WorkBench.`}
        body={<>Free for your first {INCLUDED_SEATS} users. Full access, not a trial. Your account opens the day you sign up.</>}
      />
    </>
  );

  /* ── repair: the call comes in, the day bends, paid in the driveway ── */
  if (story.family === "repair") {
    return (
      <>
        <DemoHero
          tone={story.tone}
          eyebrow={t.eyebrow}
          title={t.headline}
          accent={accentDark}
          intro={t.intro}
          demo={<WBDemoDayShift jobs={dayJobs(base, index)} urgent={story.urgent ?? { client, title: lead?.name ?? t.name }} />}
        />

        {/* Paid before you leave: the job photo with the stamp on it. */}
        <section className="relative overflow-hidden bg-white">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1fr_1fr]">
            <AnimateIn className="relative">
              <div className={`${CARD} relative aspect-[4/3] overflow-hidden`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.photo.src} alt={t.photo.alt} className="h-full w-full object-cover" loading="lazy" />
              </div>
              <p className="wb-stamp absolute -bottom-6 right-6 rounded-lg bg-[#F86A0A] px-6 py-3 text-[2.6rem] font-black leading-none tracking-[-0.04em] text-white shadow-[0_18px_30px_-14px_rgba(248,106,10,0.7)] sm:text-[3.4rem]">
                Paid.
              </p>
            </AnimateIn>
            <div>
              <h2 className={H2}>
                Get paid <span style={{ color: accent }}>before you pull away.</span>
              </h2>
              <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-gray-600">
                Mark the job done and the invoice goes out by text and email from the driveway. {client.split(" ")[0]} pays by card or bank
                transfer from the link, and if they wait, the reminders go out on their own.
              </p>
            </div>
          </div>
        </section>

        <StepsOnBand steps={t.steps} title={["How a call", "runs."]} tone={story.tone === "deep" ? "navy" : "deep"} accent={accentDark} />
        {signature}

        <section className="overflow-x-clip bg-[#F5F7FA]">
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1fr_auto]">
            <div>
              <h2 className={H2}>
                The office <span style={{ color: accent }}>in the truck.</span>
              </h2>
              <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-gray-600">
                Native apps for iPhone and Android. Your techs see their day, the address and the notes, clock in on the job and send the
                invoice before they leave.
              </p>
            </div>
            <AnimateIn>
              <WBPhoneStack />
            </AnimateIn>
          </div>
        </section>

        <SpecList features={features} accent={accent} />
        {close}
      </>
    );
  }

  /* ── route: the same stops every week, billed on their own ── */
  if (story.family === "route") {
    const svc = lines.find((l) => l.name === story.stopService) ?? base[0];
    const stops = STOP_CLIENTS.map((c, k) => ({ client: c, address: STREETS[k], service: svc?.name ?? t.name, price: svc?.unitPrice ?? 0 }));
    const cadence = story.cadence ?? "Every week";
    return (
      <>
        <CenterHero tone={story.tone} eyebrow={t.eyebrow} title={t.headline} accent={accentDark} intro={t.intro} demo={<WBDemoRoute day="Tuesday" stops={stops} cadence={cadence} />} />

        <StepsRuled steps={t.steps} title={["How a week", "runs."]} accent={accent} />

        <DemoSection
          tone="blue"
          title={["Same stops.", "Billed on their own."]}
          accent="#BFD6FF"
          body={
            <p>
              Set the visits once: {cadence.toLowerCase()}, the same crew, the same time window. Every visit lands on the schedule by itself,
              and the billing follows: an invoice after each visit, or one a month with every visit on it, paid by the card on file.
            </p>
          }
          demo={<WBDemoRecurring client={client} service={svc?.name ?? t.name} cadence={cadence} price={svc?.unitPrice ?? 0} billing="monthly" visits={["Tue 4", "Tue 11", "Tue 18", "Tue 25"]} />}
          flip
        />

        {signature}
        <SpecList features={features} accent={accent} />
        {close}
      </>
    );
  }

  /* ── project: the walkthrough, the big quote, the deposit, the costing ── */
  return (
    <>
      <WBSplitHero photo={t.photo} chip={{ icon: <ArrowRight className="h-[18px] w-[18px]" style={{ color: accent }} strokeWidth={2.4} />, title: t.chip.title, sub: t.chip.sub }}>
        <p className="text-[16px] font-bold">{t.eyebrow}</p>
        <h1 className="mt-3 text-[2.7rem] leading-[1.0] tracking-[-0.04em] sm:text-[3.8rem]">
          {t.headline[0]} <span style={{ color: accent }}>{t.headline[1]}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[18px] leading-relaxed text-gray-600 lg:mx-0">{t.intro}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
          <Link href="/apply" className="wb-pill wb-pill-orange !px-7 !py-4 !text-[16px]">
            Get started free
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <Link href="/book-a-call" className="wb-pill wb-pill-outline !px-7 !py-4 !text-[16px]">
            Book a call
          </Link>
        </div>
      </WBSplitHero>

      <section className="relative overflow-hidden bg-[#F5F7FA]">
        <WBDoodle word="clipboard" paper="#F5F7FA" opacity={0.07} className="right-8 top-8 w-[300px] rotate-6 max-lg:hidden" />
        <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <h2 className={`max-w-3xl ${H2}`}>
            From the walkthrough <span style={{ color: accent }}>to the last payment.</span>
          </h2>
          <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-gray-600">
            {client.split(" ")[0]}&apos;s {lead ? lead.name.toLowerCase() : "job"} on the real screens: the quote, the signature and the deposit,
            the crew days on the calendar, and the balance paid. Tap a step to jump to it.
          </p>
          <AnimateIn className="mt-14">
            <WBAppJourney job={job} steps={["quote", "ok", "sched", "inv", "paid"]} />
          </AnimateIn>
        </div>
      </section>

      {signature}

      <DemoSection
        tone={story.tone === "deep" ? "navy" : "deep"}
        title={["Know what the job", "really made."]}
        accent={accentDark}
        body={
          <p>
            Big jobs hide small leaks. WorkBench puts the labor, the materials and the expenses against each job as they happen, so the
            profit on the {lead ? lead.name.toLowerCase() : "job"} is a number you can see before the next quote, not a guess at tax time.
          </p>
        }
        demo={<WBInsights />}
      />

      <StepsRail steps={t.steps} title={["How a project", "runs."]} accent={accent} />
      <SpecList features={features} accent={accent} />
      {close}
    </>
  );
}

/** A plausible day for the repair schedule, from the trade's own line items. */
function dayJobs(base: { name: string }[], index: number) {
  const names = base.length ? base.map((l) => l.name) : ["Service call"];
  const times = ["8:00", "9:30", "1:00", "3:00"];
  return times.map((time, k) => ({
    time,
    client: CLIENTS[(index + k + 1) % CLIENTS.length],
    title: names[k % names.length],
    tech: k % 2 ? "Jordan" : "Mike",
  }));
}

