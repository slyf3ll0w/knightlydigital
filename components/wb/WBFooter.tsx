import Image from "next/image";
import Link from "next/link";
import { WB_HOME } from "./WBNav";
import { APP_STORE_URL, PLAY_STORE_URL, WB_EMAIL, WB_EMAIL_HREF, WB_FACEBOOK_URL, WB_INSTAGRAM_URL, WB_PHONE, WB_TIKTOK_URL } from "@/lib/wb-site";

/** Brand-colored social icons under the contact details (24×24 viewBox paths). */
const socials = [
  {
    label: "Facebook",
    href: WB_FACEBOOK_URL,
    fill: "fill-[#1877F2]",
    path: "M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z",
  },
  {
    label: "Instagram",
    href: WB_INSTAGRAM_URL,
    fill: "fill-[#E4405F]",
    path: "M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.88 5.88 0 0 0-2.13 1.38A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13a5.88 5.88 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.13-1.38 5.88 5.88 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.13A5.88 5.88 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z",
  },
  {
    label: "TikTok",
    href: WB_TIKTOK_URL,
    fill: "fill-gray-900",
    path: "M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
];
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { ALTERNATIVES_PATH } from "@/lib/wb-alternatives";
import { TOOLS_PATH } from "@/lib/wb-tools";
import { ANNOUNCEMENTS_PATH } from "@/lib/wb-announcements";
import { BLOG_PATH } from "@/lib/blog-shared";

/**
 * The site footer, round 5 (David 2026-11-18: "so many links, very busy").
 * Four short columns of the pages people actually look for; every trade,
 * free page and alternative is reachable from its own index page (/trades,
 * /alternatives, the free plan page) and the sitemap, so they are not
 * listed here one by one. Legal links sit in the bottom line.
 */
const columns: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Trades", href: "/trades" },
      { label: "The free plan", href: FREE_PAGE_PATH },
    ],
  },
  {
    heading: "Compare",
    links: [
      { label: "vs. Jobber", href: "/vs/jobber" },
      { label: "vs. Housecall Pro", href: "/vs/housecall-pro" },
      { label: "vs. ServiceTitan", href: "/vs/servicetitan" },
      { label: "All alternatives", href: ALTERNATIVES_PATH },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Help Center", href: "/help" },
      { label: "What's new", href: ANNOUNCEMENTS_PATH },
      { label: "Blog", href: BLOG_PATH },
      { label: "Free tools", href: TOOLS_PATH },
      { label: "Status", href: "/status" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Contact", href: "/contact" },
      { label: "Book a call", href: "/book-a-call" },
      { label: "Custom software", href: "/custom-software" },
      { label: "Get started", href: "/apply" },
      { label: "Log in", href: "/app/login" },
    ],
  },
];

const legal = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Texting registration", href: "/texting-registration" },
];

export default function WBFooter() {
  return (
    <footer className="bg-[#F5F7FA]">
      <div className="mx-auto max-w-6xl px-5 pb-8 pt-16 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr] lg:gap-16">
          <div className="max-w-sm">
            <Link href={WB_HOME} aria-label="WorkBench FSM home">
              <Image src="/workbench-wordmark.png" alt="WorkBench FSM" width={1054} height={199} className="h-8 w-auto" />
            </Link>
            <p className="mt-5 text-[15px] leading-relaxed text-gray-600">
              Scheduling, quotes, invoicing and payments for home-service companies. Free to start.
            </p>
            <div className="mt-6 space-y-1.5 text-[15px] font-bold text-gray-900">
              <a href={WB_PHONE.href} className="block hover:text-[#0B57D8]">
                {WB_PHONE.display}
              </a>
              <a href={WB_EMAIL_HREF} className="block hover:text-[#0B57D8]">
                {WB_EMAIL}
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <a href={APP_STORE_URL} target="_blank" rel="noopener" aria-label="Download WorkBench on the App Store" className="transition-opacity hover:opacity-80">
                <Image src="/app-store-badge.svg" alt="Download on the App Store" width={120} height={40} unoptimized className="h-10 w-auto" />
              </a>
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener" aria-label="Get WorkBench on Google Play" className="transition-opacity hover:opacity-80">
                <Image src="/google-play-badge.svg" alt="Get it on Google Play" width={180} height={53} unoptimized className="h-10 w-auto" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((col) => (
              <div key={col.heading}>
                <p className="text-[14px] font-extrabold text-gray-900">{col.heading}</p>
                <ul className="mt-4 space-y-3 text-[14.5px] text-gray-600">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} className="hover:text-[#0B57D8]">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-5 border-t border-gray-200 pt-6">
          <div className="flex items-center gap-2">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener"
                aria-label={`WorkBench on ${s.label}`}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white ring-1 ring-gray-200 transition-colors hover:ring-gray-400"
              >
                <svg viewBox="0 0 24 24" className={`h-4 w-4 ${s.fill}`} aria-hidden>
                  <path d={s.path} />
                </svg>
              </a>
            ))}
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-gray-500">
            <span>
              &copy; {new Date().getFullYear()} WorkBench FSM, a product of{" "}
              <a href="https://streamflaire.com" target="_blank" rel="noopener" className="hover:text-gray-800">
                Streamflaire Group LLC
              </a>
            </span>
            {legal.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-gray-800">
                {l.label}
              </Link>
            ))}
          </p>
        </div>
      </div>
    </footer>
  );
}
