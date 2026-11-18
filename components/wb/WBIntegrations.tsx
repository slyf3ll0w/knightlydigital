import Image from "next/image";
import { Bot, Landmark, Sparkles, Webhook } from "lucide-react";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/wb-site";

/**
 * "Works with": the services WorkBench connects to, sliding across in one
 * endless row (David 2026-11-18: "so we can continue to add more").
 *
 * TO ADD ONE: append to INTEGRATIONS. `logo` is a file in public/brand
 * (square, shown at 24 px) or leave it out and pick a lucide `icon`. Only
 * list something WorkBench really connects to today.
 */

type Integration = {
  name: string;
  /** What it does with WorkBench, a few words. */
  note: string;
  logo?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  href?: string;
};

export const INTEGRATIONS: Integration[] = [
  { name: "QuickBooks Online", note: "Invoices and payments sync", logo: "/brand/quickbooks.svg" },
  { name: "Google Calendar", note: "Two-way calendar sync", logo: "/brand/google-calendar.svg" },
  { name: "Square", note: "Card and bank payments", icon: Landmark },
  { name: "Visa", note: "Cards accepted", logo: "/brand/visa.svg" },
  { name: "Mastercard", note: "Cards accepted", logo: "/brand/mastercard.svg" },
  { name: "American Express", note: "Cards accepted", logo: "/brand/amex.svg" },
  { name: "Discover", note: "Cards accepted", logo: "/brand/discover.svg" },
  { name: "Claude", note: "Ask it about your business", icon: Sparkles },
  { name: "ChatGPT", note: "Ask it about your business", icon: Bot },
  { name: "Zapier and Make", note: "Leads in through a webhook", icon: Webhook },
  { name: "App Store", note: "iPhone app", logo: "/app-store-badge.svg", href: APP_STORE_URL },
  { name: "Google Play", note: "Android app", logo: "/google-play-badge.svg", href: PLAY_STORE_URL },
];

function Chip({ it }: { it: Integration }) {
  const Icon = it.icon;
  const badge = it.logo?.endsWith("-badge.svg");
  const body = (
    <span className="flex h-[72px] items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 shadow-[0_6px_18px_-12px_rgba(10,20,40,0.25)]">
      {badge ? (
        <Image src={it.logo!} alt={it.name} width={120} height={40} unoptimized className="h-9 w-auto" />
      ) : (
        <>
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#F2F6FE]">
            {it.logo ? (
              <Image src={it.logo} alt="" width={26} height={26} unoptimized className="h-[24px] w-auto max-w-[30px]" />
            ) : Icon ? (
              <Icon className="h-5 w-5 text-[#0B57D8]" strokeWidth={2} />
            ) : null}
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
