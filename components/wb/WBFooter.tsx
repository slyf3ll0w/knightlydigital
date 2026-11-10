import Image from "next/image";
import Link from "next/link";
import { WB_HOME } from "./WBNav";
import { APP_STORE_URL, WB_EMAIL, WB_EMAIL_HREF, WB_FACEBOOK_URL, WB_INSTAGRAM_URL, WB_PHONE, WB_TIKTOK_URL } from "@/lib/wb-site";

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
import { INCLUDED_SEATS } from "@/lib/plans";
import { FREE_PAGE_PATH } from "@/lib/wb-free";
import { TRADES } from "@/lib/wb-trades";
import { ALTERNATIVES, ALTERNATIVES_PATH } from "@/lib/wb-alternatives";
import { FREE_PAGES } from "@/lib/wb-free-pages";
import { TOOLS, TOOLS_PATH, toolPath } from "@/lib/wb-tools";

const columns: {
  heading: string;
  links: { label: string; href: string; external?: boolean }[];
}[] = [
  {
    heading: "Product",
    links: [
      { label: "Home", href: WB_HOME },
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "The free plan", href: FREE_PAGE_PATH },
      ...FREE_PAGES.map((p) => ({ label: p.eyebrow, href: p.path })),
      { label: "iPhone app", href: APP_STORE_URL, external: true },
    ],
  },
  {
    heading: "Free tools",
    links: [...TOOLS.map((t) => ({ label: `${t.noun[0].toUpperCase()}${t.noun.slice(1)} generator`, href: toolPath(t) })), { label: "Templates by trade", href: TOOLS_PATH }],
  },
  {
    heading: "For your trade",
    links: [...TRADES.map((t) => ({ label: t.name, href: `/trades/${t.slug}` })), { label: "Every trade", href: "/trades" }],
  },
  {
    heading: "Features",
    links: [
      { label: "Scheduling & dispatch", href: "/features/scheduling-dispatch" },
      { label: "Quotes & invoicing", href: "/features/quotes-and-invoicing" },
      { label: "Payments", href: "/features/payments" },
      { label: "Client portal", href: "/features/client-portal" },
      { label: "Time tracking", href: "/features/time-tracking" },
      { label: "Atlas", href: "/features/atlas" },
    ],
  },
  {
    heading: "Compare",
    links: [
      { label: "vs. Jobber", href: "/vs/jobber" },
      { label: "vs. Housecall Pro", href: "/vs/housecall-pro" },
      { label: "vs. ServiceTitan", href: "/vs/servicetitan" },
      ...ALTERNATIVES.map((a) => ({ label: `${a.name} alternative`, href: `${ALTERNATIVES_PATH}/${a.slug}` })),
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Get started", href: "/apply" },
      { label: "Book a call", href: "/book-a-call" },
      { label: "Log in", href: "/app/login" },
      { label: "Help Center", href: "/help" },
      { label: "Contact", href: "/contact" },
      { label: "Facebook", href: WB_FACEBOOK_URL, external: true },
      { label: "Instagram", href: WB_INSTAGRAM_URL, external: true },
      { label: "TikTok", href: WB_TIKTOK_URL, external: true },
      { label: "Streamflaire", href: "https://streamflaire.com", external: true },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Status", href: "/status" },
      { label: "Registering for texting", href: "/texting-registration" },
    ],
  },
];

export default function WBFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(200px,1.1fr)_repeat(3,minmax(0,1fr))] lg:gap-8 xl:grid-cols-[minmax(220px,1.1fr)_repeat(6,minmax(0,1fr))]">
        <div className="max-w-xs">
          <Image
            src="/workbench-wordmark.png"
            alt="WorkBench FSM"
            width={1054}
            height={199}
            className="h-7 w-auto"
          />
          <p className="mt-5 text-[14px] leading-relaxed text-gray-500">
            WorkBench FSM: field service management software for home-service
            companies. Free for {INCLUDED_SEATS} users, funded by payment processing. Add-ons only if you want them.
          </p>
          <div className="mt-6 space-y-2 text-[14px] font-semibold text-gray-800">
            <a href={WB_PHONE.href} className="block hover:text-[#0B57D8]">
              {WB_PHONE.display}
            </a>
            <a href={WB_EMAIL_HREF} className="block hover:text-[#0B57D8]">
              {WB_EMAIL}
            </a>
          </div>
          <div className="mt-5 flex items-center gap-3">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener"
                aria-label={`WorkBench FSM on ${s.label}`}
                className="flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-gray-200 transition-colors hover:bg-gray-50"
              >
                <svg viewBox="0 0 24 24" className={`h-[18px] w-[18px] ${s.fill}`} aria-hidden>
                  <path d={s.path} />
                </svg>
              </a>
            ))}
          </div>
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener"
            aria-label="Download WorkBench on the App Store"
            className="mt-6 inline-block transition-opacity hover:opacity-80"
          >
            <Image
              src="/app-store-badge.svg"
              alt="Download on the App Store"
              width={120}
              height={40}
              unoptimized
              className="h-10 w-auto"
            />
          </a>
        </div>
        {columns.map((col) => (
          <div key={col.heading}>
            <p className="text-[13.5px] font-bold text-gray-900">{col.heading}</p>
            <ul className="mt-4 space-y-2.5 text-[14px] text-gray-500">
              {col.links.map((l) =>
                l.external ? (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}
                      className="hover:text-gray-900"
                    >
                      {l.label}
                    </a>
                  </li>
                ) : (
                  <li key={l.label}>
                    <Link href={l.href} className="hover:text-gray-900">
                      {l.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-5 sm:px-8">
          <p className="text-[13px] text-gray-400">
            © 2026 WorkBench FSM, a product of{" "}
            <a href="https://streamflaire.com" target="_blank" rel="noopener" className="hover:text-gray-600">
              Streamflaire Group LLC
            </a>
          </p>
          <p className="text-[13px] text-gray-400">Allen, Texas</p>
        </div>
      </div>
    </footer>
  );
}
