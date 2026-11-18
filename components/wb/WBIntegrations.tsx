import Image from "next/image";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/wb-site";

/**
 * "Works with": the services WorkBench connects to, sliding across in one
 * endless row (David 2026-11-18: "so we can continue to add more").
 *
 * TO ADD ONE: append to INTEGRATIONS with its real logo in public/brand
 * (David 2026-11-18: nothing on the slider without its logo; simple-icons
 * SVGs, filled with the brand color). Only list what WorkBench really
 * connects to today.
 */

type Integration = {
  name: string;
  /** What it does with WorkBench, a few words. */
  note: string;
  logo: string;
  href?: string;
};

export const INTEGRATIONS: Integration[] = [
  { name: "QuickBooks Online", note: "Invoices and payments sync", logo: "/brand/quickbooks.svg" },
  { name: "Square", note: "Card and bank payments", logo: "/brand/square.svg" },
  { name: "Google Calendar", note: "Your jobs on your calendar", logo: "/brand/google-calendar.svg" },
  { name: "Zapier", note: "Send in leads from anywhere", logo: "/brand/zapier.svg" },
  { name: "Make", note: "Send in leads from anywhere", logo: "/brand/make.svg" },
  { name: "Visa", note: "Cards accepted", logo: "/brand/visa.svg" },
  { name: "Mastercard", note: "Cards accepted", logo: "/brand/mastercard.svg" },
  { name: "American Express", note: "Cards accepted", logo: "/brand/amex.svg" },
  { name: "Discover", note: "Cards accepted", logo: "/brand/discover.svg" },
  { name: "App Store", note: "iPhone app", logo: "/app-store-badge.svg", href: APP_STORE_URL },
  { name: "Google Play", note: "Android app", logo: "/google-play-badge.svg", href: PLAY_STORE_URL },
];

function Chip({ it }: { it: Integration }) {
  const badge = it.logo?.endsWith("-badge.svg");
  const body = (
    <span className="flex h-[72px] items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 shadow-[0_6px_18px_-12px_rgba(10,20,40,0.25)]">
      {badge ? (
        <Image src={it.logo} alt={it.name} width={120} height={40} unoptimized className="h-9 w-auto" />
      ) : (
        <>
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-white ring-1 ring-gray-100">
            <Image src={it.logo} alt="" width={26} height={26} unoptimized className="h-[24px] w-auto max-w-[30px]" />
          </span>
          <span className="whitespace-nowrap">
            <span className="block text-[15px] font-extrabold text-gray-900">{it.name}</span>
            <span className="block text-[12.5px] text-gray-500">{it.note}</span>
          </span>
        </>
      )}
    </span>
  );
  return it.href ? (
    <a href={it.href} target="_blank" rel="noopener" aria-label={it.name} className="flex-none">
      {body}
    </a>
  ) : (
    <span className="flex-none">{body}</span>
  );
}

export default function WBIntegrations() {
  // Speed scales with the list so adding items doesn't make it race.
  const seconds = INTEGRATIONS.length * 4;
  return (
    <div className="wb-marquee-wrap overflow-hidden py-2">
      <ul className="sr-only">
        {INTEGRATIONS.map((it) => (
          <li key={it.name}>
            {it.name}: {it.note}
          </li>
        ))}
      </ul>
      <div className="wb-marquee flex w-max gap-4" style={{ ["--wb-marquee-s" as string]: `${seconds}s` }} aria-hidden>
        {[...INTEGRATIONS, ...INTEGRATIONS].map((it, i) => (
          <Chip key={`${it.name}-${i}`} it={it} />
        ))}
      </div>
    </div>
  );
}
