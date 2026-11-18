import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";

/**
 * "What WorkBench does" as a bento grid (Stripe-style, David 2026-11-18):
 * each tile is a two-tone title, one line, and a slice of the REAL app
 * (the screenshots in public/screens) set on a wash of the brand colors.
 * Each tile links to its feature page. Desktop slices crop from the top
 * left of a 1512 x 791 capture; phone slices show the top of a 640 x 1385
 * capture inside a phone outline.
 */

type Tile = {
  title: string;
  rest: string;
  href: string;
  wash: string;
  shot: { src: string; alt: string; kind: "desktop" | "phone" };
  span: string;
};

const TILES: Tile[] = [
  {
    title: "Win the work.",
    rest: "Requests come in booked, quotes get signed from a phone.",
    href: "/features/quotes-and-invoicing",
    wash: "from-[#DCE8FD] via-[#C9D9FB] to-[#F9D3BC]",
    shot: { src: "/screens/desktop-quotes.jpg", alt: "A quote in WorkBench with line items, ready to send for signature", kind: "desktop" },
    span: "lg:col-span-7",
  },
  {
    title: "Talk to Atlas.",
    rest: "Say it out loud; it schedules, quotes and chases payments.",
    href: "/features/atlas",
    wash: "from-[#0B57D8] via-[#4B4FD8] to-[#F86A0A]",
    shot: { src: "/screens/mobile-atlas.png", alt: "The WorkBench phone app menu with Atlas at the top", kind: "phone" },
    span: "lg:col-span-5",
  },
  {
    title: "Run the day.",
    rest: "Drag jobs onto the calendar; the crew sees it on their phones.",
    href: "/features/scheduling-dispatch",
    wash: "from-[#FDE3D2] via-[#F6D5E6] to-[#D7DDFB]",
    shot: { src: "/screens/desktop-schedule.jpg", alt: "The WorkBench schedule: a week of jobs per crew member", kind: "desktop" },
    span: "lg:col-span-5",
  },
  {
    title: "Get paid.",
    rest: "One-click invoices, card and bank payments, reminders that send themselves.",
    href: "/features/payments",
    wash: "from-[#0A1428] via-[#0C2A66] to-[#0B57D8]",
    shot: { src: "/screens/desktop-invoices.jpg", alt: "WorkBench invoices, each with its payment status", kind: "desktop" },
    span: "lg:col-span-7",
  },
  {
    title: "Clock in on the job.",
    rest: "Time, photos and notes from the driveway.",
    href: "/features/time-tracking",
    wash: "from-[#FFE7D6] via-[#FFD0B0] to-[#F8A46B]",
    shot: { src: "/screens/mobile-timeclock.png", alt: "A job in the WorkBench phone app with the Clock In button", kind: "phone" },
    span: "lg:col-span-4",
  },
  {
    title: "Keep clients close.",
    rest: "Every client, every job, a portal where they pay and book.",
    href: "/features/client-portal",
    wash: "from-[#E6EEFD] via-[#DCE6FB] to-[#C7D6F8]",
    shot: { src: "/screens/desktop-jobs.jpg", alt: "The WorkBench jobs list with status on every job", kind: "desktop" },
    span: "lg:col-span-8",
  },
];

export default function WBBento() {
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {TILES.map((t, i) => (
          <AnimateIn key={t.title} delay={(i % 2) * 80} className={t.span}>
            <Link
              href={t.href}
              className="group relative flex h-[420px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white sm:h-[460px]"
            >
              <div className="relative z-10 flex items-start justify-between gap-4 p-6 sm:p-7">
                <p className="max-w-md text-[21px] font-extrabold leading-snug text-gray-900 sm:text-[23px]">
                  {t.title} <span className="font-bold text-slate-500">{t.rest}</span>
                </p>
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md border border-gray-200 text-gray-400 transition-colors group-hover:border-[#0B57D8] group-hover:text-[#0B57D8]">
                  <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
                </span>
              </div>
              <div className={`relative mx-3 mb-3 flex-1 overflow-hidden rounded-lg bg-gradient-to-br ${t.wash}`}>
                {t.shot.kind === "desktop" ? (
                  <div className="absolute left-6 top-6 w-[150%] overflow-hidden rounded-md shadow-[0_24px_50px_-18px_rgba(10,20,40,0.45)] ring-1 ring-black/5 transition-transform duration-500 group-hover:-translate-y-1 sm:left-8 sm:top-8 lg:w-[130%]">
                    <Image src={t.shot.src} alt={t.shot.alt} width={1512} height={791} sizes="(min-width: 1024px) 700px, 100vw" className="h-auto w-full" />
                  </div>
                ) : (
                  <div className="absolute left-1/2 top-6 w-[200px] -translate-x-1/2 rounded-[1.9rem] bg-gray-900 p-[6px] shadow-[0_24px_50px_-14px_rgba(10,20,40,0.55)] transition-transform duration-500 group-hover:-translate-y-1 sm:w-[220px]">
                    <div className="overflow-hidden rounded-[1.55rem] bg-white">
                      <Image src={t.shot.src} alt={t.shot.alt} width={640} height={1385} sizes="220px" unoptimized className="h-auto w-full" />
                    </div>
                  </div>
                )}
              </div>
            </Link>
          </AnimateIn>
      ))}
    </div>
  );
}
