import Link from "next/link";
import { Phone } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import { WB_PHONE } from "@/lib/wb-site";

export type FaqItem = { q: string; a: React.ReactNode };

/**
 * FAQ list built on native <details>/<summary> (no client JS, keyboard and
 * screen-reader friendly). Ruled rows under a dark top rule with a plus
 * that turns into a minus, like a printed spec sheet. No card, no shadow.
 */
export default function WBFaq({ items }: { items: FaqItem[] }) {
  return (
    <div className="border-t-2 border-[#0A1428]">
      {items.map(({ q, a }) => (
        <details key={q} className="wb-faq group border-b border-gray-200">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-[16.5px] font-bold leading-snug text-gray-900 transition-colors hover:text-[#0B57D8] [&::-webkit-details-marker]:hidden">
            {q}
            <span className="relative mt-1 h-4 w-4 flex-none" aria-hidden>
              <span className="absolute left-0 top-[7px] h-[2.5px] w-4 rounded bg-[#0B57D8]" />
              <span className="absolute left-[7px] top-0 h-4 w-[2.5px] rounded bg-[#0B57D8] transition-transform duration-200 group-open:scale-y-0" />
            </span>
          </summary>
          <div className="max-w-2xl pb-6 pr-8 text-[15.5px] leading-relaxed text-gray-600">{a}</div>
        </details>
      ))}
    </div>
  );
}

/**
 * The standard FAQ band for every marketing page: title + heading bar + a
 * "still stuck? call us" line on the left, the ruled list on the right.
 * New pages use this rather than wrapping WBFaq by hand.
 */
export function WBFaqSection({
  items,
  title = "Questions, answered",
  intro,
  tone = "white",
}: {
  items: FaqItem[];
  title?: React.ReactNode;
  intro?: React.ReactNode;
  tone?: "white" | "gray";
}) {
  return (
    <section className={`border-t border-gray-200 ${tone === "gray" ? "bg-[#F5F7FA]" : "bg-white"}`}>
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <AnimateIn>
          <h2 className="text-3xl font-extrabold leading-[1.1] text-gray-900 sm:text-[2.4rem]">{title}</h2>
          <span className="wb-bar" aria-hidden />
          <p className="mt-6 max-w-sm text-[16px] leading-relaxed text-gray-600">
            {intro ?? "Don't see yours? A person answers the phone, and setup calls are free."}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <a href={WB_PHONE.href} className="inline-flex items-center gap-2 text-[16px] font-extrabold text-gray-900 hover:text-[#0B57D8]">
              <Phone className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.5} aria-hidden />
              {WB_PHONE.display}
            </a>
            <Link href="/book-a-call" className="text-[15px] font-bold text-[#0B57D8] underline decoration-[#B7CFFA] decoration-2 underline-offset-4 hover:decoration-[#0B57D8]">
              Book a call
            </Link>
          </div>
        </AnimateIn>
        <AnimateIn delay={100}>
          <WBFaq items={items} />
        </AnimateIn>
      </div>
    </section>
  );
}
