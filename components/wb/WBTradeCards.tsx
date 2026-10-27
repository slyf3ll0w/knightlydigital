import Image from "next/image";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import { TRADES } from "@/lib/wb-trades";

/**
 * The trade cards, each a link to that trade's page. Home shows the first
 * `featured` as photo cards and the rest as chips; /trades shows them all.
 */
export default function WBTradeCards({ featured = TRADES.length }: { featured?: number }) {
  const cards = TRADES.slice(0, featured);
  const chips = TRADES.slice(featured);
  return (
    <>
      <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map(({ slug, icon: Icon, name, photo }, i) => (
          <AnimateIn key={slug} delay={(i % 4) * 60}>
            <Link
              href={`/trades/${slug}`}
              className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-gray-200 sm:aspect-[4/3] lg:aspect-[4/5]"
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="(min-width: 1024px) 270px, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A1328]/85 via-[#0A1328]/15 to-transparent" aria-hidden />
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 p-3.5 sm:p-4">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
                  <Icon className="h-4 w-4 text-white" strokeWidth={2.2} />
                </span>
                <span className="text-[15px] font-bold text-white sm:text-[16px]">{name}</span>
              </div>
            </Link>
          </AnimateIn>
        ))}
      </div>
      {chips.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <span className="text-[14px] font-semibold text-gray-500">Also:</span>
          {chips.map(({ slug, icon: Icon, name }) => (
            <Link
              key={slug}
              href={`/trades/${slug}`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[14px] font-bold text-gray-900 ring-1 ring-inset ring-gray-200/70 transition-colors hover:ring-gray-900"
            >
              <Icon className="h-4 w-4 text-[#0B57D8]" strokeWidth={2} />
              {name}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
