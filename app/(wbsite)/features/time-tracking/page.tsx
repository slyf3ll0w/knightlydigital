import type { Metadata } from "next";
import WBFeaturePage from "@/components/wb/WBFeaturePage";
import { pickFeatures } from "@/lib/wb-features";

export const metadata: Metadata = {
  title: "Time Tracking — WorkBench",
  description:
    "Techs clock in and out right on the job. Weekly timesheets, a live map of who's on the clock, and real labor cost flowing into each job's profit margin — all built in, no extra software.",
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
      eyebrow="Run the day"
      accent="orange"
      title={
        <>
          Labor cost that flows straight into <span className="text-[#F86A0A]">job profitability</span>.
        </>
      }
      intro="Techs clock in and out right on the job. Weekly timesheets roll up per person, managers can fix a forgotten clock-out, and every logged hour becomes real labor cost on that job's margin — not a guess at the end of the month."
      screenshot={{
        src: "/screens/mobile-05.png",
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
