import type { Metadata } from "next";
import WBFeaturePage from "@/components/wb/WBFeaturePage";
import { pickFeatures } from "@/lib/wb-features";

export const metadata: Metadata = {
  title: "Scheduling & Dispatch — WorkBench",
  description:
    "Drag-to-schedule calendars, recurring visit series, a live team map, and job notes with photos — the dispatch board WorkBench runs the day from. Free for every seat.",
};

const features = pickFeatures("run", [
  "Scheduling & dispatch",
  "Recurring visit series",
  "Jobs with notes & photos",
  "Team map",
  "Roles & permissions",
  "Built for speed",
]);

const faq = [
  {
    q: "Can techs see only their own schedule?",
    a: (
      <p>
        Yes. Roles and permissions filter what each seat sees — a tech opens
        the app to their own day, while owners, admins, and dispatchers see
        the whole board with per-tech filtering.
      </p>
    ),
  },
  {
    q: "How do recurring jobs work — do I have to schedule every visit by hand?",
    a: (
      <p>
        No. Set a visit series once (weekly mows, quarterly filter changes,
        biweekly cleans) and WorkBench generates real jobs several weeks
        ahead. A dispatcher can drag one visit to a different day, skip a
        single occurrence, or delete it — the rest of the series is
        untouched.
      </p>
    ),
  },
  {
    q: "Is the team map always tracking location?",
    a: (
      <p>
        Never off the clock. A tech's location is only ever collected while
        they're clocked in on a job — clock out and the pings stop. There's
        no background or all-day tracking.
      </p>
    ),
  },
  {
    q: "What happens when a job's schedule changes?",
    a: (
      <p>
        Dragging a job to a new day or time updates it everywhere at once —
        the client's hub, the assigned tech's app, and any reminder that was
        queued to go out.
      </p>
    ),
  },
];

export default function SchedulingDispatchPage() {
  return (
    <WBFeaturePage
      eyebrow="Run the day"
      accent="orange"
      title={
        <>
          The calendar is the <span className="text-[#F86A0A]">command center</span>, not a report.
        </>
      }
      intro="Month, week, and day views with drag-to-schedule, time blocks, and per-tech filtering. Recurring visit series generate real jobs weeks ahead, and every job carries its own notes, photos, and status — so the office and the crew are always looking at the same thing."
      screenshot={{
        src: "/screens/desktop-schedule.jpg",
        alt: "WorkBench schedule with drag-to-schedule calendar views",
        kind: "desktop",
        caption: "Month, week, and day views — drag any job to reschedule it.",
      }}
      steps={[
        {
          title: "A job lands on the board",
          body: "From a booking request, an accepted quote, or a manual add — new jobs show up unscheduled until someone drags them onto a day.",
        },
        {
          title: "Dispatch drags it into place",
          body: "Assign a tech, set a time block, and it's on the calendar. Recurring work generates its own run of future visits automatically.",
        },
        {
          title: "The crew works from their phone",
          body: "Techs see their day, clock in, add notes and photos, and update status — all from the WorkBench app in the field.",
        },
      ]}
      features={features}
      faq={faq}
      related={[
        { label: "Time tracking", href: "/features/time-tracking" },
        { label: "Payments", href: "/features/payments" },
        { label: "See every feature", href: "/features" },
      ]}
    />
  );
}
