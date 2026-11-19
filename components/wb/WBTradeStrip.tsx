import Image from "next/image";
import Link from "next/link";
import { TRADES } from "@/lib/wb-trades";

/**
 * The trades on the home page, round 5 (David's pick 2026-11-18): tall
 * photo cards sliding slowly across, each with the trade's name on a white
 * label, each a link to its trade page. Hover pauses it. Reuses the logo
 * slider's seamless loop (globals.css .wb-marquee: the list is drawn twice
 * and moves by one copy). Every trade in lib/wb-trades.ts is on it; nothing
 * is numbered.
 */
export default function WBTradeStrip() {
  const seconds = TRADES.length * 5;
  return (
    <div className="wb-marquee-wrap overflow-hidden py-2">
      <ul className="sr-only">
        {TRADES.map((t) => (
          <li key={t.slug}>
            <Link href={`/trades/${t.slug}`}>{t.name}</Link>
          </li>
        ))}
      </ul>
      <div className="wb-marquee flex w-max gap-4" style={{ ["--wb-marquee-s" as string]: `${seconds}s` }} aria-hidden>
        {[...TRADES, ...TRADES].map((t, i) => (
          <Link
            key={`${t.slug}-${i}`}
            href={`/trades/${t.slug}`}
            tabIndex={-1}
            className="group relative block h-[340px] w-[250px] flex-none overflow-hidden rounded-2xl bg-gray-200 sm:h-[380px] sm:w-[280px]"
          >
            <Image src={t.photo.src} alt="" fill sizes="280px" className="object-cover transition-transform duration-700 group-hover:scale-[1.06]" />
            <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
            <span className="wb-trade-label absolute bottom-4 left-4 rounded-lg bg-white px-3.5 py-2 text-[15px] font-extrabold text-gray-900 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.5)] transition-colors group-hover:bg-[#0B57D8] group-hover:text-white">
              {t.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
