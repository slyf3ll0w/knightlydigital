import Image from "next/image";
import { Star } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBScribble from "@/components/wb/WBScribble";

/**
 * Customer testimonials on the home page.
 *
 * ⚠️ The quotes below are PLACEHOLDER DRAFTS written 2026-09-25, not words
 * Brendan or Edan have said. They are real people and real businesses, so
 * the section only renders in development (`next dev`) until each of them
 * has read and approved his quote. When they do, paste the approved wording
 * over the draft and flip that entry's `approved` to true; the section goes
 * live on its own once at least one entry is approved.
 */

type Testimonial = {
  quote: string;
  name: string;
  role: string;
  company: string;
  logo: { src: string; width: number; height: number };
  approved: boolean;
};

const testimonials: Testimonial[] = [
  {
    quote:
      "I used to juggle texts, a spreadsheet, and a separate card reader. Now a customer books online, I send the quote from my phone, and they pay the invoice from a link. One app instead of five.",
    name: "Brendan",
    role: "Owner",
    company: "Excellent PC Building",
    logo: { src: "/brand/customers/excellent-pc-building.png", width: 240, height: 240 },
    approved: false,
  },
  {
    quote:
      "Install season is a sprint. WorkBench keeps every house on the route in order, the crew knows exactly where to go, and deposits are in before we ever pull out a ladder.",
    name: "Edan",
    role: "Owner",
    company: "Knight Light Christmas Lighting",
    logo: { src: "/brand/customers/knight-light.png", width: 83, height: 70 },
    approved: false,
  },
];

const isDev = process.env.NODE_ENV !== "production";

export default function WBTestimonials() {
  const shown = testimonials.filter((t) => t.approved || isDev);
  if (shown.length === 0) return null;
  const drafts = shown.some((t) => !t.approved);

  return (
    <section className="border-t border-gray-200 bg-[#F6F8FB]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        {drafts && (
          <p className="mx-auto mb-8 w-fit rounded-full bg-amber-100 px-4 py-1.5 text-[12.5px] font-bold text-amber-800">
            Draft quotes, only visible in local preview until the customers approve them
          </p>
        )}
        <AnimateIn className="relative mx-auto max-w-3xl text-center">
          <p className="wb-label justify-center">From the field</p>
          <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] sm:text-[2.6rem]">
            Owners who run their day on WorkBench.
          </h2>
          <WBScribble
            variant="loop"
            delay={0.5}
            className="absolute -bottom-16 left-[8%] hidden h-[70px] w-[110px] rotate-[20deg] lg:block"
          />
        </AnimateIn>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {shown.map((t, i) => (
            <AnimateIn key={t.company} delay={i * 120}>
              <figure className="flex h-full flex-col rounded-[1.5rem] bg-white p-7 ring-1 ring-inset ring-gray-200/70 sm:p-8">
                <div className="flex gap-0.5 text-[#F86A0A]" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, k) => (
                    <Star key={k} className="h-[18px] w-[18px] fill-current" strokeWidth={0} />
                  ))}
                </div>
                <blockquote className="mt-5 flex-1 text-[18px] font-semibold leading-relaxed text-gray-900 sm:text-[19px]">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-7 flex items-center gap-4 border-t border-gray-100 pt-6">
                  <span className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-gray-200">
                    <Image
                      src={t.logo.src}
                      alt={`${t.company} logo`}
                      width={t.logo.width}
                      height={t.logo.height}
                      className="h-full w-full object-contain"
                    />
                  </span>
                  <span>
                    <span className="block text-[15.5px] font-extrabold text-gray-900">{t.name}</span>
                    <span className="block text-[13.5px] text-gray-500">
                      {t.role}, {t.company}
                    </span>
                  </span>
                </figcaption>
              </figure>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}
