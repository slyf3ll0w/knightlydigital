"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { TRADES } from "@/lib/wb-trades";

/**
 * The trades directory (Home and /trades), redesigned 2026-11-18: a
 * numbered, ruled list of every trade like a contractor's service index,
 * beside one large job photo that follows the row you point at, with that
 * trade's sample job on a caption plate. Every row links to its trade page.
 * Phones get the list alone, a small photo on each row.
 *
 * `featured` is kept for older callers; every trade is listed.
 */
export default function WBTradeCards(_props: { featured?: number }) {
  const [active, setActive] = useState(0);
  const t = TRADES[active];
  const half = Math.ceil(TRADES.length / 2);
  const cols = [TRADES.slice(0, half), TRADES.slice(half)];

  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-[0.95fr_1.3fr] lg:gap-12">
      {/* the photo that follows the pointer (desktop) */}
      <div className="relative hidden lg:block">
        <div className="sticky top-28">
          <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-gray-200">
            {TRADES.map((tr, i) => (
              <Image
                key={tr.slug}
                src={tr.photo.src}
                alt={i === active ? tr.photo.alt : ""}
                fill
                sizes="460px"
                className={`object-cover transition-opacity duration-300 ${i === active ? "opacity-100" : "opacity-0"}`}
                loading={i < 2 ? "eager" : "lazy"}
              />
            ))}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#0A1428]/80 to-transparent" aria-hidden />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <p className="text-[12.5px] font-extrabold uppercase tracking-[0.12em] text-[#FF8B33]">
                {String(active + 1).padStart(2, "0")} · {t.name}
              </p>
              <p className="mt-1.5 text-[19px] font-extrabold leading-snug text-white">{t.chip.title}</p>
              <p className="text-[14px] text-white/80">{t.chip.sub}</p>
            </div>
          </div>
          <Link
            href={`/trades/${t.slug}`}
            className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-bold text-[#0B57D8] hover:underline"
          >
            How a {t.name.toLowerCase()} day runs on WorkBench
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
        </div>
      </div>

      {/* the numbered list */}
      <div className="grid gap-x-10 sm:grid-cols-2">
        {cols.map((col, c) => (
          <ul key={c} className={`border-t-2 border-[#0A1428] ${c === 1 ? "max-sm:border-t-0" : ""}`}>
            {col.map((tr) => {
              const i = TRADES.indexOf(tr);
              const on = i === active;
              return (
                <li key={tr.slug} className="border-b border-gray-200">
                  <Link
                    href={`/trades/${tr.slug}`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    className="group flex items-center gap-4 py-3.5 lg:py-4"
                  >
                    <span className="relative h-12 w-12 flex-none overflow-hidden rounded-md bg-gray-200 lg:hidden">
                      <Image src={tr.photo.src} alt="" fill sizes="48px" className="object-cover" />
                    </span>
                    <span className={`hidden w-7 flex-none text-[13px] font-extrabold tabular-nums lg:block ${on ? "text-[#F86A0A]" : "text-gray-400"}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={`flex-1 text-[17px] font-extrabold transition-colors ${on ? "text-[#0B57D8]" : "text-gray-900 group-hover:text-[#0B57D8]"}`}>
                      {tr.name}
                    </span>
                    <ArrowUpRight
                      className={`h-5 w-5 flex-none transition-all ${on ? "translate-x-0.5 -translate-y-0.5 text-[#0B57D8]" : "text-gray-300 group-hover:text-[#0B57D8]"}`}
                      strokeWidth={2.25}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
      </div>
    </div>
  );
}
