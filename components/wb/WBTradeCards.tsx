import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import { TRADES } from "@/lib/wb-trades";

/**
 * The trades, laid out like a contractor's services grid (David
 * 2026-11-18, round 4: no numbers, no icon chips, no text over photos):
 * a photo card per trade with the trade's name under it, each linking to
 * its trade page. `featured` cards show as photos; the rest follow as one
 * line of plain links ("Also built for …").
 */
export default function WBTradeCards({ featured = TRADES.length }: { featured?: number }) {
  const cards = TRADES.slice(0, featured);
  const rest = TRADES.slice(featured);
  return (
    <>
      <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
        {cards.map(({ slug, name, photo }, i) => (
          <AnimateIn key={slug} delay={(i % 4) * 60}>
            <Link href={`/trades/${slug}`} className="group block overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-[0_18px_40px_-20px_rgba(10,20,40,0.35)]">
              <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  sizes="(min-width: 1024px) 270px, 50vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                />
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                <span className="text-[16px] font-extrabold text-gray-900">{name}</span>
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#F2F6FE] text-[#0B57D8] transition-colors group-hover:bg-[#0B57D8] group-hover:text-white">
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </span>
              </div>
            </Link>
          </AnimateIn>
        ))}
      </div>
      {rest.length > 0 && (
        <p className="mt-8 text-[15.5px] leading-relaxed text-gray-600">
          Also built for{" "}
          {rest.map((t, i) => (
            <span key={t.slug}>
              <Link href={`/trades/${t.slug}`} className="font-bold text-gray-900 underline decoration-gray-300 underline-offset-4 hover:text-[#0B57D8] hover:decoration-[#0B57D8]">
                {t.name.toLowerCase()}
              </Link>
              {i < rest.length - 2 ? ", " : i === rest.length - 2 ? " and " : "."}
            </span>
          ))}{" "}
          <Link href="/trades" className="font-bold text-[#0B57D8] hover:underline">
            See every trade
          </Link>
        </p>
      )}
    </>
  );
}
