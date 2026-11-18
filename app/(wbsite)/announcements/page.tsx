import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import WBCta from "@/components/wb/WBCta";
import { ANNOUNCEMENTS, announcementDate, announcementPath } from "@/lib/wb-announcements";

export const metadata: Metadata = {
  title: "Announcements",
  description: "What is new in WorkBench FSM: new features and big changes, with how to find each one and the guide that goes with it.",
  alternates: { canonical: "https://workbenchfsm.com/announcements" },
};

const ORANGE = "#F86A0A";

/* The list of release announcements, newest first. Posts live in
   lib/wb-announcements.ts; the rule for when one is due is in CLAUDE.md. */
export default function AnnouncementsPage() {
  return (
    <>
      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.14em]" style={{ color: ORANGE }}>
            Announcements
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.1] sm:text-5xl">What&apos;s new in WorkBench.</h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-gray-600">
            New features and big changes as they go live, with how to find each one and the guide that goes with it.
          </p>
        </div>
      </section>

      <section className="bg-[#F5F7FA]">
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
          <ul className="space-y-5">
            {ANNOUNCEMENTS.map((a) => (
              <li key={a.slug}>
                <Link
                  href={announcementPath(a)}
                  className="group block rounded-2xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md sm:p-7"
                >
                  <p className="text-[13px] font-semibold text-gray-500">
                    <time dateTime={a.date}>{announcementDate(a.date)}</time>
                  </p>
                  <h2 className="mt-2 text-xl font-extrabold leading-snug text-gray-900 sm:text-2xl">{a.title}</h2>
                  <p className="mt-2.5 text-[15.5px] leading-relaxed text-gray-600">{a.summary}</p>
                  <p className="mt-4 inline-flex items-center gap-1.5 text-[14.5px] font-bold text-[#0B57D8]">
                    Read more
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <WBCta />
    </>
  );
}
