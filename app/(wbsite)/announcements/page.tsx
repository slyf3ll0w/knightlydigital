import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, MessageSquarePlus, Phone } from "lucide-react";
import WBCta from "@/components/wb/WBCta";
import WBHero from "@/components/wb/WBHero";
import { ANNOUNCEMENTS, announcementDate, announcementPath, type Announcement } from "@/lib/wb-announcements";
import { WB_PHONE } from "@/lib/wb-site";

export const metadata: Metadata = {
  title: "Announcements",
  description: "What is new in WorkBench FSM: new features and big changes, with how to find each one and the guide that goes with it.",
  alternates: { canonical: "https://workbenchfsm.com/announcements" },
};

/** The bolded points of a post's first list: the "in this release" lines. */
function highlights(a: Announcement): string[] {
  const list = a.blocks.find((b) => b.type === "list");
  if (!list || list.type !== "list") return [];
  return list.items
    .map((i) => (i.title ?? i.text).replace(/\.$/, ""))
    .slice(0, 4);
}

function dateParts(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }),
    day: d.getDate(),
    year: d.getFullYear(),
  };
}

/* The release log, newest first. Posts live in lib/wb-announcements.ts and
   this page lays out any number of them the same way: a date column, then
   the post's tag, title, summary and the bolded points of its first list.
   The rule for when one is due is in CLAUDE.md. */
export default function AnnouncementsPage() {
  const [latest] = ANNOUNCEMENTS;
  return (
    <>
      <WBHero>
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="wb-label">Announcements</p>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.06] text-gray-900 sm:text-[3.2rem]">
              What&apos;s new in WorkBench.
            </h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600 sm:text-[18px]">
              New features and big changes as they go live, with where to find each one and the
              step-by-step guide that goes with it.
            </p>
          </div>
          {latest && (
            <Link href={announcementPath(latest)} className="group block border-y-2 border-[#0A1428] py-5">
              <span className="block text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#F86A0A]">
                Latest · {announcementDate(latest.date)}
              </span>
              <span className="mt-1.5 flex items-center justify-between gap-3 text-[18px] font-extrabold text-gray-900 group-hover:text-[#0B57D8]">
                {latest.title}
                <ArrowRight className="h-5 w-5 flex-none transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
              </span>
            </Link>
          )}
        </div>
      </WBHero>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1fr_300px] lg:gap-16">
          <ol className="border-t-2 border-[#0A1428]">
            {ANNOUNCEMENTS.map((a) => {
              const d = dateParts(a.date);
              const points = highlights(a);
              return (
                <li key={a.slug} className="grid gap-5 border-b border-gray-200 py-10 sm:grid-cols-[110px_1fr] sm:gap-8">
                  <time dateTime={a.date} className="flex items-baseline gap-2 sm:block">
                    <span className="block text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#F86A0A]">{d.month}</span>
                    <span className="block text-[2.6rem] font-extrabold leading-none text-gray-900 sm:mt-1">{d.day}</span>
                    <span className="block text-[14px] font-semibold text-gray-500 sm:mt-1">{d.year}</span>
                  </time>
                  <article>
                    <span className="inline-block rounded-sm border border-[#0B57D8] px-2 py-0.5 text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-[#0B57D8]">
                      {a.tag}
                    </span>
                    <h2 className="mt-3 text-2xl font-extrabold leading-snug text-gray-900 sm:text-[1.9rem]">
                      <Link href={announcementPath(a)} className="hover:text-[#0B57D8]">
                        {a.title}
                      </Link>
                    </h2>
                    <p className="mt-3 max-w-2xl text-[16.5px] leading-relaxed text-gray-600">{a.summary}</p>
                    {points.length > 0 && (
                      <ul className="mt-6 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
                        {points.map((p) => (
                          <li key={p} className="flex gap-3 text-[15px] font-semibold leading-snug text-gray-800">
                            <span className="mt-[0.45em] h-[3px] w-3.5 flex-none bg-[#F86A0A]" aria-hidden />
                            {p}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
                      <Link href={announcementPath(a)} className="wb-pill wb-pill-dark wb-pill-sm">
                        Read the post
                        <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                      </Link>
                      <Link href={`/help/${a.help.slug}`} className="inline-flex items-center gap-2 text-[14.5px] font-bold text-[#0B57D8] hover:underline">
                        <BookOpen className="h-4 w-4" strokeWidth={2.25} />
                        The guide
                      </Link>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>

          <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-lg border border-gray-200 bg-[#F5F7FA] p-6">
              <p className="text-[16px] font-extrabold text-gray-900">How releases reach you</p>
              <p className="mt-2 text-[14.5px] leading-relaxed text-gray-600">
                What is posted here is already live: nothing to install, and the phone apps pick it up on
                their own.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-6">
              <p className="text-[16px] font-extrabold text-gray-900">Want something built?</p>
              <p className="mt-2 text-[14.5px] leading-relaxed text-gray-600">
                Most of what is posted here started as a customer&apos;s request. Tell us what would save you time.
              </p>
              <div className="mt-4 space-y-2.5 text-[14.5px] font-bold">
                <Link href="/contact" className="flex items-center gap-2 text-[#0B57D8] hover:underline">
                  <MessageSquarePlus className="h-4 w-4" strokeWidth={2.25} />
                  Send us an idea
                </Link>
                <a href={WB_PHONE.href} className="flex items-center gap-2 text-gray-900 hover:text-[#0B57D8]">
                  <Phone className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.25} />
                  {WB_PHONE.display}
                </a>
              </div>
            </div>
            <Link href="/help" className="group flex items-center justify-between rounded-lg bg-[#0A1428] p-6 text-white">
              <span>
                <span className="block text-[16px] font-extrabold">Help Center</span>
                <span className="block text-[14px] text-blue-100/75">Step-by-step guides for everything</span>
              </span>
              <ArrowRight className="h-5 w-5 text-[#FF8B33] transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
            </Link>
          </aside>
        </div>
      </section>

      <WBCta />
    </>
  );
}
