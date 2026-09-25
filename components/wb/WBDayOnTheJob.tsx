import Image from "next/image";
import { Check, CreditCard, MapPin, MessageSquare, Route } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBScribble from "@/components/wb/WBScribble";
import { WB_DAY_PHOTOS } from "@/lib/wb-site";

/**
 * "A day on the job": three stops of a real field day, each a job-site photo
 * with the piece of the app that goes with it pinned to the corner. The
 * app pieces are drawn in HTML (not screenshots) so they stay readable at
 * card size; hand-drawn arrows carry the eye from one stop to the next.
 */

function RouteCard() {
  const stops = [
    { t: "8:00", where: "Ravenwood Dr", now: true },
    { t: "10:30", where: "Oak Hollow Ln" },
    { t: "1:00", where: "Elm St" },
  ];
  return (
    <div className="w-[214px] rounded-2xl bg-white p-3.5 text-left">
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#0B57D8]">
        <Route className="h-3.5 w-3.5" strokeWidth={2.4} />
        Today&rsquo;s route
      </p>
      <p className="mt-1 text-[14px] font-extrabold text-gray-900">3 stops · 38 min driving</p>
      <ol className="mt-2.5 space-y-1.5">
        {stops.map((s, i) => (
          <li key={s.t} className="flex items-center gap-2 text-[12.5px] text-gray-700">
            <span
              className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10.5px] font-extrabold ${
                s.now ? "bg-[#F86A0A] text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {i + 1}
            </span>
            <span className="font-bold text-gray-900">{s.t}</span>
            <span className="truncate">{s.where}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OnMyWayCard() {
  return (
    <div className="w-[226px] rounded-2xl bg-white p-3.5 text-left">
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#0B57D8]">
        <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.4} />
        Text to Maria Lopez
      </p>
      <p className="mt-2 rounded-2xl rounded-br-md bg-[#0B57D8] px-3 py-2 text-[12.5px] leading-snug text-white">
        Hi Maria, Jake from Summit Plumbing is on the way. See you around 9:45.
      </p>
      <p className="mt-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
        <MapPin className="h-3.5 w-3.5 text-[#F86A0A]" strokeWidth={2.4} />
        Clocked in · 9:41 AM
      </p>
    </div>
  );
}

function PaidCard() {
  return (
    <div className="w-[214px] rounded-2xl bg-white p-3.5 text-left">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold text-gray-500">Invoice #2481</p>
          <p className="mt-0.5 text-[20px] font-extrabold leading-none text-gray-900">$1,240.00</p>
        </div>
        <span className="font-display -rotate-6 rounded-[4px] border-2 border-green-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-700">
          Paid
        </span>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-gray-600">
        <CreditCard className="h-3.5 w-3.5 text-gray-400" strokeWidth={2.2} />
        Visa ···· 4242 · 11:16 AM
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-green-700">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
        Job marked paid
      </p>
    </div>
  );
}

const stops = [
  {
    time: "7:00 AM",
    title: "Load the van, open the app",
    body: "The day's jobs are already on the phone in drive order, with the address, the notes, and what was quoted.",
    photo: WB_DAY_PHOTOS.morning,
    Card: RouteCard,
  },
  {
    time: "9:40 AM",
    title: "On the porch, on the clock",
    body: "The client already got an on-my-way text. Clock in, snap the before photos, and the office sees it all live.",
    photo: WB_DAY_PHOTOS.arrive,
    Card: OnMyWayCard,
  },
  {
    time: "11:15 AM",
    title: "Paid before you back out",
    body: "Send the invoice from the driveway. They pay by card or bank from the text, and the job is marked paid.",
    photo: WB_DAY_PHOTOS.paid,
    Card: PaidCard,
  },
];

export default function WBDayOnTheJob() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <AnimateIn className="mx-auto max-w-3xl text-center">
          <p className="wb-label justify-center">A day on the job</p>
          <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
            Built for the truck, not the desk.{" "}
            <span className="text-gray-400">Here is a morning with WorkBench.</span>
          </h2>
        </AnimateIn>
        <div className="mt-14 grid gap-14 md:grid-cols-3 md:gap-6 lg:gap-10">
          {stops.map(({ time, title, body, photo, Card }, i) => (
            <AnimateIn key={time} delay={i * 160} className={`relative ${["z-[3]", "z-[2]", "z-[1]"][i]}`}>
              <div className="relative pb-20">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gray-200">
                  <Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 768px) 360px, 90vw" className="object-cover" />
                  <span className="absolute left-3 top-3 rounded-full bg-[#F86A0A] px-3 py-1 text-[12.5px] font-extrabold tracking-wide text-white shadow-sm">
                    {time}
                  </span>
                </div>
                <div className="wb-float absolute bottom-0 right-2 rounded-2xl sm:right-0 md:-right-3" style={{ "--wb-tilt": i === 1 ? "-1.5deg" : "1.5deg", animationDelay: `${-i * 1.7}s` } as React.CSSProperties}>
                  <Card />
                </div>
              </div>
              {/* the arrow on to the next stop (desktop, where they sit side by side) */}
              {i < stops.length - 1 && (
                <WBScribble
                  variant={i === 0 ? "loop" : "swoop"}
                  delay={0.6 + i * 0.3}
                  className="absolute -right-[4.2rem] top-[-2.6rem] z-10 hidden h-[64px] w-[100px] md:block lg:-right-[5rem] lg:w-[112px]"
                />
              )}
              <p className="mt-5 flex items-center gap-2.5 text-[17px] font-extrabold text-gray-900">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-50 text-[12.5px] font-extrabold text-[#0B57D8]">
                  {i + 1}
                </span>
                {title}
              </p>
              <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-gray-600">{body}</p>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}
