import Image from "next/image";
import { AnimateIn } from "@/components/AnimateIn";
import { WB_DAY_PHOTOS } from "@/lib/wb-site";

/**
 * "A day on the job": three stops of a real field day, each a job-site photo
 * with the phone screen that goes with it tucked into the corner. The
 * home page's bridge between the trades photos and the app itself.
 */

const stops = [
  {
    time: "7:00 AM",
    title: "Load the van, open the app",
    body: "The day's jobs are already on the phone in drive order, with the address, the notes, and what was quoted.",
    photo: WB_DAY_PHOTOS.morning,
    screen: { src: "/screens/mobile-01.png", alt: "The phone app's schedule for the week" },
  },
  {
    time: "9:40 AM",
    title: "On the porch, on the clock",
    body: "The client already got an on-my-way text. Clock in, snap the before photos, and the office sees it all live.",
    photo: WB_DAY_PHOTOS.arrive,
    screen: { src: "/screens/mobile-02.png", alt: "A job in the phone app with photos and notes" },
  },
  {
    time: "11:15 AM",
    title: "Paid before you back out",
    body: "Send the invoice from the driveway. They pay by card or bank from the text, and the job is marked paid.",
    photo: WB_DAY_PHOTOS.paid,
    screen: { src: "/screens/mobile-03.png", alt: "An invoice in the phone app, paid from a link" },
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
        <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-6 lg:gap-8">
          {stops.map((s, i) => (
            <AnimateIn key={s.time} delay={i * 120}>
              <div>
                <div className="relative pb-6 pr-6">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gray-200">
                    <Image src={s.photo.src} alt={s.photo.alt} fill sizes="(min-width: 768px) 360px, 90vw" className="object-cover" />
                    <span className="absolute left-3 top-3 rounded-full bg-[#F86A0A] px-3 py-1 text-[12.5px] font-extrabold tracking-wide text-white shadow-sm">
                      {s.time}
                    </span>
                  </div>
                  <div className="absolute bottom-0 right-0 rounded-[1.25rem] bg-gray-900 p-[5px] shadow-[0_18px_40px_rgba(10,20,40,0.3)]">
                    <div className="relative w-[78px] overflow-hidden rounded-[1rem] bg-white sm:w-[88px]" style={{ aspectRatio: "331 / 720" }}>
                      <Image src={s.screen.src} alt={s.screen.alt} fill sizes="88px" className="object-cover object-top" />
                    </div>
                  </div>
                </div>
                <p className="mt-4 flex items-center gap-2.5 text-[17px] font-extrabold text-gray-900">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-50 text-[12.5px] font-extrabold text-[#0B57D8]">
                    {i + 1}
                  </span>
                  {s.title}
                </p>
                <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-gray-600">{s.body}</p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}
