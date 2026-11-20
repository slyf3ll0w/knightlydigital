import type { Metadata } from "next";
import WBFeaturePage from "@/components/wb/WBFeaturePage";
import { CenterHero, DemoHero, DemoSection } from "@/components/wb/WBTradeSections";
import WBDemoTimesheet from "@/components/wb/demos/WBDemoTimesheet";
import WBInsights from "@/components/wb/WBInsights";
import WBTeamDemo from "@/components/wb/WBTeamDemo";
import { SEATS_SENTENCE } from "@/lib/help/plan-copy";
import WBAppJourney from "@/components/wb/WBAppJourney";
import { Clock } from "lucide-react";
import { WB_SHOTS } from "@/components/wb/WBSplitHero";
import { WB_TRADE_PHOTOS } from "@/lib/wb-site";
import { pickFeatures } from "@/lib/wb-features";

export const metadata: Metadata = {
  title: "Time Tracking",
  description:
    "Techs clock in and out right on the job. Weekly timesheets, a live map of who's on the clock, and real labor cost flowing into each job's profit margin. Clocking in and out is in the free plan; weekly timesheets, the live map, and labor costing come with the Pro add-on.",
};

const timeFeatures = pickFeatures("run", ["Time tracking & timesheets", "Team map"]);
const marginFeature = pickFeatures("paid", ["Job profitability"]);
const permsFeature = pickFeatures("run", ["Roles & permissions"]);

const features = [...timeFeatures, ...marginFeature, ...permsFeature];

const faq = [
  {
    q: "Where do techs clock in and out?",
    a: (
      <p>
        Right on the job, from the WorkBench app in the field — no separate
        time-clock app or hardware to buy.
      </p>
    ),
  },
  {
    q: "What if someone forgets to clock out?",
    a: (
      <p>
        A manager can fix a forgotten clock-out from the timesheet view;
        every edit is stamped with who made it, so the record stays honest.
      </p>
    ),
  },
  {
    q: "Does time tracking affect job pricing?",
    a: (
      <p>
        Yes — set an hourly cost per person once, and logged hours flow into
        that job's profit margin as real labor cost, next to materials, so
        you can see which jobs are actually worth taking.
      </p>
    ),
  },
  {
    q: "Is location tracked while techs are off the clock?",
    a: (
      <p>
        No. Location is only ever collected while someone is clocked in on a
        job — never in the background, never off hours.
      </p>
    ),
  },
];

export default function TimeTrackingPage() {
  return (
    <WBFeaturePage
      hero={
        <CenterHero
          tone="navy"
          eyebrow="Time tracking"
          title={["Labor cost that lands", "on the job."]}
          accent="#FF8B33"
          intro="Techs clock in and out right on the job. Weekly timesheets add up per person, managers fix a forgotten clock-out, and every hour becomes real labor cost on that job, not a guess at the end of the month."
          demo={<WBDemoTimesheet />}
        />
      }
      body={
        <>
          <section className="bg-[#F5F7FA]">
            <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
              <h2 className="max-w-3xl text-[2.3rem] font-black leading-[1.02] tracking-[-0.035em] sm:text-[3.4rem]">
                Everyone signs in. <span className="text-[#0B57D8]">Everyone clocks in.</span>
              </h2>
              <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-gray-600">
                Give each person their own sign-in and a cost per hour. Techs see their own jobs and their own timesheet, never your prices.
              </p>
              <div className="mx-auto mt-14 max-w-5xl">
                <WBTeamDemo seatsSentence={SEATS_SENTENCE} />
              </div>
            </div>
          </section>
          <DemoSection
            tone="deep"
            title={["See what each job", "really made."]}
            accent="#FF8B33"
            body={<p>Logged hours times each person&apos;s cost becomes the labor line on the job, beside the materials and expenses, so the margin is real.</p>}
            demo={<WBInsights />}
          />
        </>
      }
      stepsStyle="rail"
      demo={<WBAppJourney steps={["sched", "done", "inv"]} />}
      eyebrow="Run the day"
      accent="orange"
      title={
        <>
          Labor cost that flows straight into <span className="text-[#F86A0A]">job profitability</span>.
        </>
      }
      intro="Techs clock in and out right on the job. Weekly timesheets roll up per person, managers can fix a forgotten clock-out, and every logged hour becomes real labor cost on that job's margin — not a guess at the end of the month."
      photo={WB_TRADE_PHOTOS.roofing}
      phone={WB_SHOTS.timeclock}
      chip={{ icon: <Clock className="h-[18px] w-[18px] text-[#F86A0A]" strokeWidth={2.2} />, title: "Clocked in · 8:02 AM", sub: "Roof repair, Elm St" }}
      screenshot={{
        src: "/screens/mobile-timeclock.png",
        alt: "WorkBench job screen with a built-in time clock",
        kind: "mobile",
        caption: "Jobs with a built-in time clock",
      }}
      steps={[
        {
          title: "Clock in on the job",
          body: "One tap from the job screen in the field — no separate app, no hardware.",
        },
        {
          title: "Hours roll up automatically",
          body: "Weekly timesheets per person, with a live map of who's currently on the clock for owners and admins.",
        },
        {
          title: "Cost hits the margin",
          body: "Hourly cost × logged time appears as a labor line on the job's profit card, next to materials and revenue.",
        },
      ]}
      features={features}
      faq={faq}
      related={[
        { label: "Scheduling & dispatch", href: "/features/scheduling-dispatch" },
        { label: "Payments", href: "/features/payments" },
        { label: "See every feature", href: "/features" },
      ]}
    />
  );
}
