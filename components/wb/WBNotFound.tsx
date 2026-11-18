import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import WBKoala, { WBKoalaSays } from "@/components/wb/WBKoala";
import { WB_PHONE } from "@/lib/wb-site";

const PLACES = [
  { href: "/", label: "Home", sub: "What WorkBench does" },
  { href: "/features", label: "Features", sub: "Everything in the app" },
  { href: "/pricing", label: "Pricing", sub: "Free to start, the whole bill" },
  { href: "/help", label: "Help Center", sub: "Step-by-step guides" },
];

/**
 * The marketing site's 404 body, inside the site layout (header + footer):
 * app/(wbsite)/not-found.tsx. Unmatched addresses reach it through the
 * catch-all app/(wbsite)/[...missing]; customer links (pay, quote, portal…)
 * and the app keep the root app/not-found.tsx card.
 */
export default function WBNotFound() {
  return (
    <>
        <section className="relative overflow-hidden border-b border-gray-200">
          <div className="wb-bloom absolute inset-0" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-14 pt-[7.5rem] sm:px-8 sm:pb-20 sm:pt-[9.5rem] lg:grid-cols-[1.2fr_1fr]">
            <div>
              <h1 className="mt-4 text-4xl font-extrabold leading-[1.06] text-gray-900 sm:text-[3.4rem]">
                This page isn&apos;t on the schedule.
              </h1>
              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-gray-600">
                The address may be mistyped, or the page moved. One of these is probably where you were headed.
              </p>
              <ul className="mt-8 max-w-xl border-t-2 border-[#0A1428]">
                {PLACES.map((p) => (
                  <li key={p.href} className="border-b border-gray-200">
                    <Link href={p.href} className="group flex items-center gap-4 py-3.5">
                      <span className="flex-1">
                        <span className="block text-[17px] font-extrabold text-gray-900 group-hover:text-[#0B57D8]">{p.label}</span>
                        <span className="block text-[14px] text-gray-500">{p.sub}</span>
                      </span>
                      <ArrowRight className="h-5 w-5 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-[#0B57D8]" strokeWidth={2.5} />
                    </Link>
                  </li>
                ))}
              </ul>
              <a href={WB_PHONE.href} className="mt-6 inline-flex items-center gap-2 text-[15px] font-bold text-gray-900 hover:text-[#0B57D8]">
                <Phone className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.5} aria-hidden />
                Or call {WB_PHONE.display}
              </a>
            </div>
            <figure className="relative mx-auto w-full max-w-sm pt-14">
              <WBKoalaSays className="absolute left-0 top-0 max-w-[14rem]">
                Hmm, nothing here.
                <br />
                Try one of these!
              </WBKoalaSays>
              <WBKoala priority sizes="(min-width: 1024px) 340px, 70vw" className="mx-auto w-[78%] drop-shadow-[0_18px_24px_rgba(10,20,40,0.25)]" />
            </figure>
          </div>
        </section>
    </>
  );
}
