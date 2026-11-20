import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, MessageSquarePlus, Phone } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBAnnounceVisual from "@/components/wb/WBAnnounceVisual";
import WBCta from "@/components/wb/WBCta";
import WBHero from "@/components/wb/WBHero";
import WBScribble from "@/components/wb/WBScribble";
import { ANNOUNCEMENTS, announcementDate, announcementPath, type Announcement } from "@/lib/wb-announcements";
import { WB_PHONE } from "@/lib/wb-site";

export const metadata: Metadata = {
  title: "Announcements",
  description: "What is new in WorkBench FSM: new features and big changes, with how to find each one and the guide that goes with it.",
  alternates: { canonical: "https://workbenchfsm.com/announcements" },
};

const CARD =
  "rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";
const H2 = "text-[2.2rem] leading-[1.05] tracking-[-0.03em] sm:text-[3.2rem]";

/** The titled points of a post's first list: what is in the release. */
function highlights(a: Announcement): string[] {
  const list = a.blocks.find((b) => b.type === "list");
  if (!list || list.type !== "list") return [];
  return list.items
    .filter((i) => i.title)
    .map((i) => (i.title as string).replace(/\.$/, ""))
    .slice(0, 4);
}

/* The release log (David 2026-11-19: the old page "looked super
   AI-generated"). Newest post leads with the real screen it is about
   (components/wb/WBAnnounceVisual.tsx); older posts follow on a dated
   timeline; then where releases come from. Posts live in
   lib/wb-announcements.ts and lay themselves out. */
export default function AnnouncementsPage() {
  const [latest, ...older] = ANNOUNCEMENTS;
  const points = highlights(latest);

  return (
    <>
      <WBHero>
        <div className="max-w-3xl">
          <h1 className="text-[2.8rem] leading-[1] tracking-[-0.04em] sm:text-[4.2rem]">
            What&apos;s new in <span className="text-[#0B57D8]">WorkBench.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-gray-600 sm:text-[18px]">
            New features and big changes as they go live, with where to find each one and the step-by-step guide that goes
            with it. Everything here is already in your account: nothing to install, and the phone apps pick it up on their own.
          </p>
        </div>
      </WBHero>

      {/* ── The latest release ─────────────────────────────── */}
      <section className="overflow-x-clip bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
          <article>
            <p className="text-[15px] font-semibold text-gray-500">
              <time dateTime={latest.date}>{announcementDate(latest.date)}</time>
              <span className="mx-2 text-gray-300" aria-hidden>
                ·
              </span>
              <span className="text-[#F86A0A]">{latest.tag}</span>
            </p>
            <h2 className={`mt-4 ${H2}`}>
              <Link href={announcementPath(latest)} className="hover:text-[#0B57D8]">
                {latest.title}
              </Link>
            </h2>
            <p className="mt-6 text-[18px] leading-relaxed text-gray-600">{latest.summary}</p>
            {points.length > 0 && (
              <ul className="mt-8 space-y-3">
                {points.map((p) => (
                  <li key={p} className="flex gap-3.5 text-[16px] font-bold leading-snug text-[#0A1428]">
                    <span className="mt-[0.55em] h-[3px] w-4 flex-none rounded-full bg-[#F86A0A]" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link href={announcementPath(latest)} className="wb-pill wb-pill-orange !px-7 !py-4 !text-[16px]">
                Read the post
                <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </Link>
              <Link href={`/help/${latest.help.slug}`} className="wb-pill wb-pill-outline !px-7 !py-4 !text-[16px]">
                <BookOpen className="h-[18px] w-[18px]" strokeWidth={2.25} />
                The guide
              </Link>
            </div>
          </article>

          <div>
            {/* Hand-drawn note in its own row, pointing down at the screen */}
            <div className="mb-1 hidden items-end justify-end gap-1 pr-10 lg:flex" aria-hidden>
              <p className="pb-3 text-right text-[15px] font-extrabold leading-snug text-[#10244A]">
                The new report,
                <br />
                straight from the app
              </p>
              <WBScribble variant="droop" delay={0.6} className="h-[70px] w-[54px] flex-none" />
            </div>
            <AnimateIn>
              <WBAnnounceVisual announcement={latest} />
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── Earlier releases, on a dated timeline ─────────────── */}
      {older.length > 0 && (
        <section className="bg-[#F5F7FA]">
          <div className="mx-auto max-w-4xl px-5 py-20 sm:px-8 sm:py-24">
            <h2 className={H2}>
              Earlier <span className="text-[#0B57D8]">releases.</span>
            </h2>
            <ol className="relative mt-12 space-y-6 border-l-2 border-[#0A1428]/15 pl-7 sm:pl-10">
              {older.map((a) => (
                <li key={a.slug} className="relative">
                  <span className="absolute -left-[37px] top-7 h-4 w-4 rounded-full border-[3px] border-[#F5F7FA] bg-[#F86A0A] sm:-left-[49px]" aria-hidden />
                  <AnimateIn>
                    <article className={`${CARD} p-6 sm:p-7`}>
                      <p className="text-[14px] font-semibold text-gray-500">
                        <time dateTime={a.date}>{announcementDate(a.date)}</time>
                        <span className="mx-2 text-gray-300" aria-hidden>
                          ·
                        </span>
                        <span className="text-[#F86A0A]">{a.tag}</span>
                      </p>
                      <h3 className="mt-2 text-[1.5rem] font-extrabold leading-snug">
                        <Link href={announcementPath(a)} className="hover:text-[#0B57D8]">
                          {a.title}
                        </Link>
                      </h3>
                      <p className="mt-2 text-[16px] leading-relaxed text-gray-600">{a.summary}</p>
                      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px] font-bold">
                        <Link href={announcementPath(a)} className="inline-flex items-center gap-1.5 text-[#0B57D8] hover:underline">
                          Read the post <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                        </Link>
                        <Link href={`/help/${a.help.slug}`} className="inline-flex items-center gap-1.5 text-gray-700 hover:text-[#0A1428]">
                          <BookOpen className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.25} /> The guide
                        </Link>
                      </div>
                    </article>
                  </AnimateIn>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* ── Where releases come from ───────────────────────────── */}
      <section className={older.length > 0 ? "bg-white" : "bg-[#F5F7FA]"}>
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <h2 className={H2}>
              Built from <span className="text-[#F86A0A]">what you ask for.</span>
            </h2>
            <p className="mt-6 max-w-md text-[18px] leading-relaxed text-gray-600">
              Most of what is posted here started as a customer&apos;s request. Tell us what would save you time.
            </p>
          </div>
          <AnimateIn>
            <div className="wb-stagger grid gap-5 sm:grid-cols-2">
              <div className={`${CARD} flex flex-col p-6 sm:p-7`}>
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#0A1428] text-[#FF8B33]">
                  <MessageSquarePlus className="h-6 w-6" strokeWidth={2} />
                </span>
                <p className="mt-5 text-[19px] font-extrabold text-[#0A1428]">Want something built?</p>
                <p className="mt-2 text-[15px] leading-relaxed text-gray-600">Send the idea, or call and talk it through with a person.</p>
                <div className="mt-auto space-y-2.5 pt-6 text-[15px] font-bold">
                  <Link href="/contact" className="flex items-center gap-2 text-[#0B57D8] hover:underline">
                    Send us an idea <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                  </Link>
                  <a href={WB_PHONE.href} className="flex items-center gap-2 text-[#0A1428] hover:text-[#0B57D8]">
                    <Phone className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.25} />
                    {WB_PHONE.display}
                  </a>
                </div>
              </div>
              <Link href="/help" className={`${CARD} group flex flex-col p-6 transition-transform duration-200 hover:-translate-y-1 sm:p-7`}>
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#0A1428] text-[#FF8B33]">
                  <BookOpen className="h-6 w-6" strokeWidth={2} />
                </span>
                <span className="mt-5 block text-[19px] font-extrabold text-[#0A1428]">Help Center</span>
                <span className="mt-2 block text-[15px] leading-relaxed text-gray-600">
                  Step-by-step guides for everything in WorkBench, new features included.
                </span>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-[15px] font-bold text-[#0B57D8]">
                  Browse the guides
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
                </span>
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>

      <WBCta />
    </>
  );
}
